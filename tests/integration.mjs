import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import pg from 'pg';

test('HTTP API persists and isolates user data', async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl || databaseUrl === process.env.DATABASE_URL) {
    throw new Error('Set TEST_DATABASE_URL to a separate disposable PostgreSQL database');
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const uploadDir = await mkdtemp(join(tmpdir(), 'memory-integration-'));
  const port = 25000 + Math.floor(Math.random() * 10000);
  const base = `http://127.0.0.1:${port}`;
  const users = [];
  let server;
  try {
    await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
    server = spawn(process.execPath, ['dist-server/server/server.js'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, DATABASE_URL: databaseUrl, UPLOAD_DIR: uploadDir, PORT: String(port), NODE_ENV: 'development' },
      stdio: 'ignore'
    });
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (server.exitCode !== null) throw new Error(`Server exited: ${server.exitCode}`);
      try { ready = (await fetch(`${base}/api/health`)).ok; }
      catch { /* Wait for the server to bind. */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'health endpoint should become ready');

    async function call(path, method = 'GET', payload, cookie, extra = {}) {
      const headers = { ...extra };
      if (cookie) headers.cookie = cookie;
      let body = payload;
      if (payload !== undefined && !(payload instanceof Uint8Array)) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(payload);
      }
      const response = await fetch(base + path, { method, headers, body });
      return {
        status: response.status,
        data: response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text(),
        cookie: response.headers.get('set-cookie')?.split(';')[0]
      };
    }

    assert.equal((await call('/login.html')).status, 200);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const emailA = `a-${suffix}@example.test`, emailB = `b-${suffix}@example.test`;
    const a = await call('/api/register', 'POST', { name: 'Test A', email: emailA, password: 'strong-password-123' });
    assert.equal(a.status, 200);
    users.push(a.data.user.id);
    assert.ok(a.cookie?.startsWith('memory_session='));
    assert.equal((await call('/api/register', 'POST', { name: 'Test A', email: emailA, password: 'strong-password-123' })).status, 409);
    const b = await call('/api/register', 'POST', { name: 'Test B', email: emailB, password: 'strong-password-456' });
    assert.equal(b.status, 200);
    users.push(b.data.user.id);
    assert.equal((await call('/api/me', 'GET', undefined, a.cookie)).data.user.email, emailA);
    assert.equal((await call('/api/workspace', 'GET', undefined, b.cookie)).data.data, null);

    const first = { projects: [{ id: 'p1', name: 'Project', children: [], samples: [] }], charts: [] };
    const second = { projects: [{ ...first.projects[0], name: 'Renamed' }], charts: [] };
    assert.equal((await call('/api/workspace', 'PUT', { data: first, revision: '0' }, a.cookie)).data.revision, '1');
    assert.equal((await call('/api/workspace', 'PUT', { data: second, revision: '1' }, a.cookie)).data.revision, '2');
    assert.equal((await call('/api/workspace', 'PUT', { data: first, revision: '1' }, a.cookie)).status, 409);
    assert.equal((await call('/api/workspace', 'GET', undefined, a.cookie)).data.data.projects[0].name, 'Renamed');
    assert.equal((await call('/api/workspace', 'GET', undefined, b.cookie)).data.data, null);

    const file = new TextEncoder().encode('file-check');
    const uploaded = await call('/api/files', 'POST', file, a.cookie, { 'content-type': 'text/plain', 'x-file-name': 'check.txt' });
    assert.equal(uploaded.status, 201);
    const filePath = `/api/files/${uploaded.data.id}`;
    assert.equal((await call(filePath, 'GET', undefined, a.cookie)).data, 'file-check');
    assert.equal((await call(filePath, 'GET', undefined, b.cookie)).status, 404);
    assert.equal((await call(filePath, 'DELETE', undefined, b.cookie)).status, 404);
    assert.equal((await call(filePath, 'DELETE', undefined, a.cookie)).status, 200);
    assert.equal((await call(filePath, 'GET', undefined, a.cookie)).status, 404);
    assert.equal((await call('/api/login', 'POST', { email: emailA, password: 'strong-password-123' }, undefined, { origin: 'https://other.example' })).status, 403);
    assert.equal((await call('/api/logout', 'POST', undefined, a.cookie)).status, 200);
    assert.equal((await call('/api/me', 'GET', undefined, a.cookie)).status, 401);
  } finally {
    if (server && server.exitCode === null && server.signalCode === null) {
      server.kill('SIGTERM');
      await new Promise(resolve => server.once('exit', resolve));
    }
    if (users.length) await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await pool.end();
    await rm(uploadDir, { recursive: true, force: true });
  }
});
