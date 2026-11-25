import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { writeFile, mkdir, stat, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { randomUUID, randomBytes, scryptSync, createHash, timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import nodemailer from 'nodemailer';
import { diffSamples } from './sample-history.js';

const root = resolve(import.meta.dirname, '../..');
const uploads = resolve(root, process.env.UPLOAD_DIR || 'uploads');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const maxJson = 5 * 1024 * 1024;
const maxFile = 20 * 1024 * 1024;
const maxUserFiles = 1024 * 1024 * 1024;
const resetTtlSeconds = 60 * 60;
const appOrigin = (process.env.APP_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, '');
const smtp = process.env.SMTP_HOST && process.env.MAIL_FROM
  ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined })
  : null;
const attempts = new Map<string, { count: number; reset: number }>();
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
type Account = { id: string; email: string; name: string; lab: string; language: 'vi' | 'en' };
type HttpError = Error & { status?: number };
type Role = 'owner' | 'editor' | 'viewer';

function send(res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
}
function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function password(value: string, salt: string) { return scryptSync(value, salt, 64); }
function validPassword(value: string) { return value.length >= 12 && value.length <= 256; }
async function sendPasswordReset(email: string, token: string): Promise<void> {
  const url = `${appOrigin}/reset-password.html?token=${encodeURIComponent(token)}`;
  if (!smtp) {
    if (process.env.NODE_ENV !== 'production') console.info(`Password reset link for ${email}: ${url}`);
    else console.error('Password reset email was not sent: SMTP_HOST and MAIL_FROM are required.');
    return;
  }
  await smtp.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: 'Đặt lại mật khẩu MEMORY',
    text: `Bạn đã yêu cầu đặt lại mật khẩu MEMORY. Mở liên kết này trong vòng 1 giờ: ${url}`,
    html: `<p>Bạn đã yêu cầu đặt lại mật khẩu MEMORY.</p><p><a href="${url}">Đặt lại mật khẩu</a></p><p>Liên kết hết hạn sau 1 giờ. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`
  });
}
function limited(req: IncomingMessage): boolean {
  const key = req.socket.remoteAddress || 'unknown', now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.reset < now) { attempts.set(key, { count: 1, reset: now + 15 * 60_000 }); return false; }
  entry.count += 1;
  return entry.count > 20;
}
function cookies(req: IncomingMessage): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) result[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return result;
}
async function body(req: IncomingMessage, limit = maxJson): Promise<Buffer> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw Object.assign(new Error('Payload too large'), { status: 413 }); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function jsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse((await body(req)).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid object');
    return parsed as Record<string, unknown>;
  } catch (error) {
    if ((error as HttpError).status === 413) throw error;
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}
async function user(req: IncomingMessage): Promise<Account | null> {
  const token = cookies(req).memory_session;
  if (!token) return null;
  const { rows } = await pool.query('SELECT u.id, u.email, u.name, u.lab, u.language FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()', [hash(token)]);
  return rows[0] || null;
}
async function login(res: ServerResponse, account: Account, remember: boolean) {
  const token = randomBytes(32).toString('base64url');
  const age = remember ? 30 * 86400 : 86400;
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
  await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+($3 * interval '1 second'))", [hash(token), account.id, age]);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  send(res, 200, { user: { id: account.id, email: account.email, name: account.name, lab: account.lab, language: account.language || 'vi' } }, { 'set-cookie': `memory_session=${token}; HttpOnly; SameSite=Lax; Path=/api${remember ? `; Max-Age=${age}` : ''}${secure}` });
}
async function ensurePersonalWorkspace(account: Account): Promise<void> {
  await pool.query("INSERT INTO workspace_members(workspace_owner_id,user_id,role) VALUES($1,$1,'owner') ON CONFLICT (workspace_owner_id,user_id) DO NOTHING", [account.id]);
}
async function membership(account: Account, ownerId: string): Promise<Role | null> {
  const { rows } = await pool.query('SELECT role FROM workspace_members WHERE workspace_owner_id=$1 AND user_id=$2', [ownerId, account.id]);
  return rows[0]?.role || null;
}
async function workspaceAccess(account: Account, url: URL, write = false): Promise<{ ownerId: string; role: Role } | null> {
  await ensurePersonalWorkspace(account);
  const ownerId = url.searchParams.get('workspace') || account.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId)) return null;
  const role = await membership(account, ownerId);
  if (!role || (write && role === 'viewer')) return null;
  return { ownerId, role };
}
async function activity(ownerId: string, actorId: string | null, type: 'member_joined' | 'member_left' | 'member_removed') {
  await pool.query('INSERT INTO workspace_activities(id,workspace_owner_id,actor_id,type) VALUES($1,$2,$3,$4)', [randomUUID(), ownerId, actorId, type]);
}
async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const method = req.method || 'GET';
  if (!['GET', 'HEAD'].includes(method)) {
    const origin = req.headers.origin;
    const host = req.headers.host;
    let originMatches = true;
    try { if (origin) originMatches = new URL(origin).host === host; }
    catch { originMatches = false; }
    if (!originMatches || req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: 'Origin rejected' });
  }
  if (url.pathname === '/api/health' && method === 'GET') { await pool.query('SELECT 1'); return send(res, 200, { ok: true }); }
  if (url.pathname === '/api/register' && method === 'POST') {
    if (limited(req)) return send(res, 429, { error: 'Too many attempts' });
    const input = await jsonBody(req);
    const email = String(input.email || '').trim().toLowerCase();
    const name = String(input.name || '').trim();
    const pass = String(input.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || pass.length < 12 || pass.length > 256) return send(res, 400, { error: 'Name, email and password of at least 12 characters required' });
    const id = randomUUID(), salt = randomBytes(16).toString('hex');
    try {
      await pool.query('INSERT INTO users(id,email,name,password_salt,password_hash) VALUES($1,$2,$3,$4,$5)', [id, email, name, salt, password(pass, salt).toString('hex')]);
    } catch (error) { if ((error as { code?: string }).code === '23505') return send(res, 409, { error: 'Email already registered' }); throw error; }
    return login(res, { id, email, name, lab: '', language: 'vi' }, true);
  }
  if (url.pathname === '/api/login' && method === 'POST') {
    if (limited(req)) return send(res, 429, { error: 'Too many attempts' });
    const input = await jsonBody(req);
    if (String(input.email || '').length > 254 || String(input.password || '').length > 256) return send(res, 400, { error: 'Invalid credentials' });
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [String(input.email || '').trim().toLowerCase()]);
    const found = rows[0];
    const candidate = password(String(input.password || ''), found?.password_salt || '00000000000000000000000000000000');
    const stored = found ? Buffer.from(found.password_hash, 'hex') : Buffer.alloc(64);
    if (!found || !timingSafeEqual(candidate, stored)) return send(res, 401, { error: 'Invalid credentials' });
    return login(res, found, !!input.remember);
  }
  if (url.pathname === '/api/forgot-password' && method === 'POST') {
    if (limited(req)) return send(res, 429, { error: 'Too many attempts' });
    const email = String((await jsonBody(req)).email || '').trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const { rows } = await pool.query<Account>('SELECT id,email,name,lab FROM users WHERE email=$1', [email]);
      const account = rows[0];
      if (account) {
        const token = randomBytes(32).toString('base64url');
        await pool.query('DELETE FROM password_reset_tokens WHERE user_id=$1 OR expires_at<=now()', [account.id]);
        await pool.query("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+($3 * interval '1 second'))", [hash(token), account.id, resetTtlSeconds]);
        await sendPasswordReset(account.email, token).catch(error => console.error('Password reset email failed:', error));
      }
    }
    return send(res, 202, { message: 'Nếu email tồn tại, chúng tôi đã gửi liên kết đặt lại mật khẩu.' });
  }
  if (url.pathname === '/api/reset-password' && method === 'POST') {
    const input = await jsonBody(req);
    const token = String(input.token || '');
    const nextPassword = String(input.password || '');
    if (!token || !validPassword(nextPassword)) return send(res, 400, { error: 'Mật khẩu phải có từ 12 đến 256 ký tự.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ user_id: string }>('SELECT user_id FROM password_reset_tokens WHERE token_hash=$1 AND expires_at>now() FOR UPDATE', [hash(token)]);
      if (!rows[0]) { await client.query('ROLLBACK'); return send(res, 400, { error: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' }); }
      const salt = randomBytes(16).toString('hex');
      await client.query('UPDATE users SET password_salt=$1,password_hash=$2 WHERE id=$3', [salt, password(nextPassword, salt).toString('hex'), rows[0].user_id]);
      await client.query('DELETE FROM sessions WHERE user_id=$1', [rows[0].user_id]);
      await client.query('DELETE FROM password_reset_tokens WHERE user_id=$1', [rows[0].user_id]);
      await client.query('COMMIT');
      return send(res, 200, { ok: true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }
  const account = await user(req);
  if (!account) return send(res, 401, { error: 'Sign in required' });
  await ensurePersonalWorkspace(account);
  if (url.pathname === '/api/me' && method === 'GET') return send(res, 200, { user: account });
  if (url.pathname === '/api/logout' && method === 'POST') {
    const token = cookies(req).memory_session;
    if (token) await pool.query('DELETE FROM sessions WHERE token_hash=$1', [hash(token)]);
    return send(res, 200, { ok: true }, { 'set-cookie': 'memory_session=; HttpOnly; SameSite=Lax; Path=/api; Max-Age=0' });
  }
  if (url.pathname === '/api/me' && method === 'PATCH') {
    const input = await jsonBody(req);
    const name = String(input.name || '').trim().slice(0, 120), lab = String(input.lab || '').trim().slice(0, 120);
    const language = input.language === undefined ? account.language : input.language;
    if (!name) return send(res, 400, { error: 'Name required' });
    if (language !== 'vi' && language !== 'en') return send(res, 400, { error: 'Unsupported language' });
    const { rows } = await pool.query('UPDATE users SET name=$1,lab=$2,language=$3 WHERE id=$4 RETURNING id,email,name,lab,language', [name, lab, language, account.id]);
    return send(res, 200, { user: rows[0] });
  }
  if (url.pathname === '/api/workspaces' && method === 'GET') {
    const { rows } = await pool.query(`SELECT m.workspace_owner_id AS id,m.role,u.name,u.email
      FROM workspace_members m JOIN users u ON u.id=m.workspace_owner_id
      WHERE m.user_id=$1 ORDER BY (m.workspace_owner_id=$1) DESC,u.name`, [account.id]);
    return send(res, 200, { workspaces: rows });
  }
  if (url.pathname === '/api/workspace' && method === 'GET') {
    const access = await workspaceAccess(account, url);
    if (!access) return send(res, 403, { error: 'Workspace access denied' });
    const { rows } = await pool.query('SELECT data,revision FROM workspaces WHERE user_id=$1', [access.ownerId]);
    return send(res, 200, { data: rows[0]?.data || null, revision: String(rows[0]?.revision || 0), workspaceId: access.ownerId, role: access.role });
  }
  if (url.pathname === '/api/sample-history' && method === 'GET') {
    const access = await workspaceAccess(account, url);
    if (!access) return send(res, 403, { error: 'Workspace access denied' });
    const sampleId = url.searchParams.get('sample') || '';
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(sampleId)) return send(res, 400, { error: 'Invalid sample' });
    const { rows } = await pool.query(`SELECT id,sample_code,actor_id,actor_name,type,changes,created_at
      FROM sample_history WHERE workspace_owner_id=$1 AND sample_id=$2
      ORDER BY created_at DESC,id DESC`, [access.ownerId, sampleId]);
    return send(res, 200, { history: rows });
  }
  if (url.pathname === '/api/workspace' && method === 'PUT') {
    const access = await workspaceAccess(account, url, true);
    if (!access) return send(res, 403, { error: 'You do not have permission to edit this workspace' });
    const input = await jsonBody(req);
    const data = input.data as { projects?: unknown; charts?: unknown } | null;
    if (!data || !Array.isArray(data.projects) || !Array.isArray(data.charts)) return send(res, 400, { error: 'Invalid workspace' });
    const revision = Number(input.revision);
    if (!Number.isSafeInteger(revision) || revision < 0) return send(res, 400, { error: 'Invalid revision' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT data,revision FROM workspaces WHERE user_id=$1 FOR UPDATE', [access.ownerId]);
      if (Number(current.rows[0]?.revision || 0) !== revision || (!current.rows.length && revision !== 0)) {
        await client.query('ROLLBACK');
        return send(res, 409, { error: 'Workspace changed elsewhere' });
      }
      const next = current.rows.length
        ? await client.query('UPDATE workspaces SET data=$2::jsonb,revision=revision+1,updated_at=now() WHERE user_id=$1 RETURNING revision', [access.ownerId, JSON.stringify(input.data)])
        : await client.query('INSERT INTO workspaces(user_id,data,revision) VALUES($1,$2::jsonb,1) RETURNING revision', [access.ownerId, JSON.stringify(input.data)]);
      for (const change of diffSamples(current.rows[0]?.data, input.data)) {
        await client.query(`INSERT INTO sample_history(id,workspace_owner_id,sample_id,sample_code,actor_id,actor_name,type,changes)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [randomUUID(), access.ownerId, change.sampleId, change.sampleCode, account.id, account.name, change.type, JSON.stringify(change.changes)]);
      }
      await client.query('COMMIT');
      return send(res, 200, { revision: String(next.rows[0].revision) });
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') return send(res, 409, { error: 'Workspace changed elsewhere' });
      throw error;
    } finally { client.release(); }
  }
  const memberMatch = url.pathname.match(/^\/api\/workspaces\/([0-9a-f-]{36})\/members$/i);
  const memberDeleteMatch = url.pathname.match(/^\/api\/workspaces\/([0-9a-f-]{36})\/members\/([0-9a-f-]{36})$/i);
  const inviteMatch = url.pathname.match(/^\/api\/workspaces\/([0-9a-f-]{36})\/invitations$/i);
  const activityMatch = url.pathname.match(/^\/api\/workspaces\/([0-9a-f-]{36})\/activities$/i);
  if (memberMatch && method === 'GET') {
    const role = await membership(account, memberMatch[1]);
    if (!role) return send(res, 403, { error: 'Workspace access denied' });
    const { rows } = await pool.query(`SELECT m.user_id,m.role,m.joined_at,u.name,u.email
      FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_owner_id=$1 ORDER BY m.joined_at`, [memberMatch[1]]);
    return send(res, 200, { members: rows, role });
  }
  if (memberDeleteMatch && method === 'DELETE') {
    if (await membership(account, memberDeleteMatch[1]) !== 'owner') return send(res, 403, { error: 'Only the owner can remove members' });
    if (memberDeleteMatch[1] === memberDeleteMatch[2]) return send(res, 400, { error: 'The owner cannot be removed' });
    const removed = await pool.query("DELETE FROM workspace_members WHERE workspace_owner_id=$1 AND user_id=$2 AND role <> 'owner' RETURNING user_id", [memberDeleteMatch[1], memberDeleteMatch[2]]);
    if (!removed.rows.length) return send(res, 404, { error: 'Member not found' });
    await activity(memberDeleteMatch[1], memberDeleteMatch[2], 'member_removed');
    return send(res, 200, { ok: true });
  }
  if (activityMatch && method === 'GET') {
    const role = await membership(account, activityMatch[1]);
    if (!role) return send(res, 403, { error: 'Workspace access denied' });
    const { rows } = await pool.query(`SELECT a.type,a.created_at,u.name,u.email FROM workspace_activities a
      LEFT JOIN users u ON u.id=a.actor_id WHERE a.workspace_owner_id=$1 ORDER BY a.created_at DESC LIMIT 30`, [activityMatch[1]]);
    return send(res, 200, { activities: rows });
  }
  if (inviteMatch && method === 'GET') {
    if (await membership(account, inviteMatch[1]) !== 'owner') return send(res, 403, { error: 'Only the owner can manage invitations' });
    const { rows } = await pool.query('SELECT id,email,role,expires_at,created_at FROM workspace_invitations WHERE workspace_owner_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC', [inviteMatch[1]]);
    return send(res, 200, { invitations: rows });
  }
  if (inviteMatch && method === 'POST') {
    if (await membership(account, inviteMatch[1]) !== 'owner') return send(res, 403, { error: 'Only the owner can invite members' });
    const input = await jsonBody(req), email = String(input.email || '').trim().toLowerCase(), role = String(input.role || 'editor');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['editor', 'viewer'].includes(role)) return send(res, 400, { error: 'A valid email and role are required' });
    const token = randomBytes(32).toString('base64url'), id = randomUUID();
    await pool.query("UPDATE workspace_invitations SET revoked_at=now() WHERE workspace_owner_id=$1 AND email=$2 AND accepted_at IS NULL AND revoked_at IS NULL", [inviteMatch[1], email]);
    await pool.query("INSERT INTO workspace_invitations(id,workspace_owner_id,email,role,token_hash,invited_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '7 days')", [id, inviteMatch[1], email, role, hash(token), account.id]);
    return send(res, 201, { id, email, role, token, expiresInDays: 7 });
  }
  if (url.pathname === '/api/invitations/accept' && method === 'POST') {
    const input = await jsonBody(req), token = String(input.token || '');
    if (!token || token.length > 200) return send(res, 400, { error: 'Invalid invitation' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM workspace_invitations WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE', [hash(token)]);
      const invite = found.rows[0];
      if (!invite) { await client.query('ROLLBACK'); return send(res, 404, { error: 'Invitation is invalid or expired' }); }
      if (invite.email !== account.email) { await client.query('ROLLBACK'); return send(res, 403, { error: 'Sign in with the invited email to join this workspace' }); }
      await client.query('INSERT INTO workspace_members(workspace_owner_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(workspace_owner_id,user_id) DO UPDATE SET role=EXCLUDED.role', [invite.workspace_owner_id, account.id, invite.role]);
      await client.query('UPDATE workspace_invitations SET accepted_at=now() WHERE id=$1', [invite.id]);
      await client.query('INSERT INTO workspace_activities(id,workspace_owner_id,actor_id,type) VALUES($1,$2,$3,$4)', [randomUUID(), invite.workspace_owner_id, account.id, 'member_joined']);
      await client.query('COMMIT');
      return send(res, 200, { workspaceId: invite.workspace_owner_id, role: invite.role });
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  }
  const fileMatch = url.pathname.match(/^\/api\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/);
  if (url.pathname === '/api/files' && method === 'POST') {
    const access = await workspaceAccess(account, url, true);
    if (!access) return send(res, 403, { error: 'You do not have permission to add files to this workspace' });
    let name: string;
    try { name = decodeURIComponent(String(req.headers['x-file-name'] || '')).slice(0, 255); }
    catch { return send(res, 400, { error: 'Invalid file name' }); }
    if (!name) return send(res, 400, { error: 'File name required' });
    const quota = await pool.query('SELECT coalesce(sum(size_bytes),0)::bigint AS used FROM attachments WHERE user_id=$1', [access.ownerId]);
    if (Number(quota.rows[0].used) >= maxUserFiles) return send(res, 413, { error: 'Storage quota exceeded' });
    const content = await body(req, maxFile), id = randomUUID(), stored = randomUUID();
    if (Number(quota.rows[0].used) + content.length > maxUserFiles) return send(res, 413, { error: 'Storage quota exceeded' });
    await mkdir(uploads, { recursive: true, mode: 0o700 });
    await writeFile(join(uploads, stored), content, { flag: 'wx', mode: 0o600 });
    try { await pool.query('INSERT INTO attachments(id,user_id,name,mime,size_bytes,stored_name) VALUES($1,$2,$3,$4,$5,$6)', [id, access.ownerId, name, String(req.headers['content-type'] || 'application/octet-stream').slice(0, 100), content.length, stored]); }
    catch (error) { await unlink(join(uploads, stored)); throw error; }
    return send(res, 201, { id, name, size: content.length });
  }
  if (fileMatch && method === 'GET') {
    const access = await workspaceAccess(account, url);
    if (!access) return send(res, 403, { error: 'Workspace access denied' });
    const { rows } = await pool.query('SELECT * FROM attachments WHERE id=$1 AND user_id=$2', [fileMatch[1], access.ownerId]);
    if (!rows.length) return send(res, 404, { error: 'Not found' });
    const inline = url.searchParams.get('view') === '1' && ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(rows[0].mime);
    res.writeHead(200, { 'content-type': rows[0].mime, 'content-length': rows[0].size_bytes, 'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(rows[0].name)}`, 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' });
    createReadStream(join(uploads, rows[0].stored_name)).pipe(res);
    return;
  }
  if (fileMatch && method === 'DELETE') {
    const access = await workspaceAccess(account, url, true);
    if (!access) return send(res, 403, { error: 'You do not have permission to remove files from this workspace' });
    const { rows } = await pool.query('DELETE FROM attachments WHERE id=$1 AND user_id=$2 RETURNING stored_name', [fileMatch[1], access.ownerId]);
    if (!rows.length) return send(res, 404, { error: 'Not found' });
    await unlink(join(uploads, rows[0].stored_name)).catch(() => {});
    return send(res, 200, { ok: true });
  }
  send(res, 404, { error: 'Not found' });
}
async function staticFile(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const name = url.pathname === '/' ? '/index.html' : url.pathname;
  const path = resolve(root, 'dist', '.' + name);
  if (!path.startsWith(resolve(root, 'dist') + '/')) return send(res, 404, { error: 'Not found' });
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error('Not a file');
    res.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream', 'content-length': info.size, 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'strict-origin-when-cross-origin', 'cache-control': name.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store' });
    createReadStream(path).pipe(res);
  } catch { send(res, 404, { error: 'Not found' }); }
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else await staticFile(req, res, url);
  } catch (error) {
    console.error(error);
    const failure = error as HttpError;
    send(res, failure.status || 500, { error: failure.status ? failure.message : 'Server error' });
  }
});
server.listen(Number(process.env.PORT || 3000), '127.0.0.1');
