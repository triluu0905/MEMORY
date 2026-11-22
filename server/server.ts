import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { writeFile, mkdir, stat, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { randomUUID, randomBytes, scryptSync, createHash, timingSafeEqual } from 'node:crypto';
import pg from 'pg';

const root = resolve(import.meta.dirname, '../..');
const uploads = resolve(root, process.env.UPLOAD_DIR || 'uploads');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const maxJson = 5 * 1024 * 1024;
const maxFile = 20 * 1024 * 1024;
const maxUserFiles = 1024 * 1024 * 1024;
const attempts = new Map<string, { count: number; reset: number }>();
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
type Account = { id: string; email: string; name: string; lab: string };
type HttpError = Error & { status?: number };

function send(res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
}
function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function password(value: string, salt: string) { return scryptSync(value, salt, 64); }
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
  const { rows } = await pool.query('SELECT u.id, u.email, u.name, u.lab FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()', [hash(token)]);
  return rows[0] || null;
}
async function login(res: ServerResponse, account: Account, remember: boolean) {
  const token = randomBytes(32).toString('base64url');
  const age = remember ? 30 * 86400 : 86400;
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
  await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+($3 * interval '1 second'))", [hash(token), account.id, age]);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  send(res, 200, { user: { id: account.id, email: account.email, name: account.name, lab: account.lab } }, { 'set-cookie': `memory_session=${token}; HttpOnly; SameSite=Lax; Path=/api${remember ? `; Max-Age=${age}` : ''}${secure}` });
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
    return login(res, { id, email, name, lab: '' }, true);
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
  const account = await user(req);
  if (!account) return send(res, 401, { error: 'Sign in required' });
  if (url.pathname === '/api/me' && method === 'GET') return send(res, 200, { user: account });
  if (url.pathname === '/api/logout' && method === 'POST') {
    const token = cookies(req).memory_session;
    if (token) await pool.query('DELETE FROM sessions WHERE token_hash=$1', [hash(token)]);
    return send(res, 200, { ok: true }, { 'set-cookie': 'memory_session=; HttpOnly; SameSite=Lax; Path=/api; Max-Age=0' });
  }
  if (url.pathname === '/api/me' && method === 'PATCH') {
    const input = await jsonBody(req);
    const name = String(input.name || '').trim().slice(0, 120), lab = String(input.lab || '').trim().slice(0, 120);
    if (!name) return send(res, 400, { error: 'Name required' });
    const { rows } = await pool.query('UPDATE users SET name=$1,lab=$2 WHERE id=$3 RETURNING id,email,name,lab', [name, lab, account.id]);
    return send(res, 200, { user: rows[0] });
  }
  if (url.pathname === '/api/workspace' && method === 'GET') {
    const { rows } = await pool.query('SELECT data,revision FROM workspaces WHERE user_id=$1', [account.id]);
    return send(res, 200, { data: rows[0]?.data || null, revision: String(rows[0]?.revision || 0) });
  }
  if (url.pathname === '/api/workspace' && method === 'PUT') {
    const input = await jsonBody(req);
    const data = input.data as { projects?: unknown; charts?: unknown } | null;
    if (!data || !Array.isArray(data.projects) || !Array.isArray(data.charts)) return send(res, 400, { error: 'Invalid workspace' });
    const revision = Number(input.revision);
    if (!Number.isSafeInteger(revision) || revision < 0) return send(res, 400, { error: 'Invalid revision' });
    const { rows } = revision === 0
      ? await pool.query('INSERT INTO workspaces(user_id,data,revision) VALUES($1,$2::jsonb,1) ON CONFLICT(user_id) DO NOTHING RETURNING revision', [account.id, JSON.stringify(input.data)])
      : await pool.query('UPDATE workspaces SET data=$2::jsonb, revision=revision+1, updated_at=now() WHERE user_id=$1 AND revision=$3 RETURNING revision', [account.id, JSON.stringify(input.data), revision]);
    return rows.length ? send(res, 200, { revision: String(rows[0].revision) }) : send(res, 409, { error: 'Workspace changed elsewhere' });
  }
  const fileMatch = url.pathname.match(/^\/api\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/);
  if (url.pathname === '/api/files' && method === 'POST') {
    let name: string;
    try { name = decodeURIComponent(String(req.headers['x-file-name'] || '')).slice(0, 255); }
    catch { return send(res, 400, { error: 'Invalid file name' }); }
    if (!name) return send(res, 400, { error: 'File name required' });
    const quota = await pool.query('SELECT coalesce(sum(size_bytes),0)::bigint AS used FROM attachments WHERE user_id=$1', [account.id]);
    if (Number(quota.rows[0].used) >= maxUserFiles) return send(res, 413, { error: 'Storage quota exceeded' });
    const content = await body(req, maxFile), id = randomUUID(), stored = randomUUID();
    if (Number(quota.rows[0].used) + content.length > maxUserFiles) return send(res, 413, { error: 'Storage quota exceeded' });
    await mkdir(uploads, { recursive: true, mode: 0o700 });
    await writeFile(join(uploads, stored), content, { flag: 'wx', mode: 0o600 });
    try { await pool.query('INSERT INTO attachments(id,user_id,name,mime,size_bytes,stored_name) VALUES($1,$2,$3,$4,$5,$6)', [id, account.id, name, String(req.headers['content-type'] || 'application/octet-stream').slice(0, 100), content.length, stored]); }
    catch (error) { await unlink(join(uploads, stored)); throw error; }
    return send(res, 201, { id, name, size: content.length });
  }
  if (fileMatch && method === 'GET') {
    const { rows } = await pool.query('SELECT * FROM attachments WHERE id=$1 AND user_id=$2', [fileMatch[1], account.id]);
    if (!rows.length) return send(res, 404, { error: 'Not found' });
    const inline = url.searchParams.get('view') === '1' && ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(rows[0].mime);
    res.writeHead(200, { 'content-type': rows[0].mime, 'content-length': rows[0].size_bytes, 'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(rows[0].name)}`, 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' });
    createReadStream(join(uploads, rows[0].stored_name)).pipe(res);
    return;
  }
  if (fileMatch && method === 'DELETE') {
    const { rows } = await pool.query('DELETE FROM attachments WHERE id=$1 AND user_id=$2 RETURNING stored_name', [fileMatch[1], account.id]);
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
