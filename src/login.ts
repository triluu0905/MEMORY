import { auth } from './auth';
import { ApiError } from './api';

const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const message = (value: string) => { const el = document.getElementById('msg')!; el.className = 'msg on err'; el.textContent = value; };
const password = field('p');
document.getElementById('tg')!.addEventListener('click', () => {
  password.type = password.type === 'password' ? 'text' : 'password';
  document.getElementById('tg')!.textContent = password.type === 'password' ? 'Hiện' : 'Ẩn';
});
document.querySelectorAll<HTMLButtonElement>('[data-soc]').forEach(button => { button.disabled = true; button.title = 'Chưa hỗ trợ'; });
document.getElementById('useDemo')?.remove();
if (new URLSearchParams(location.search).has('out')) message('Bạn đã đăng xuất.');
if (new URLSearchParams(location.search).has('reset')) { const el = document.getElementById('msg')!; el.className = 'msg on'; el.textContent = 'Mật khẩu đã được đặt lại. Hãy đăng nhập bằng mật khẩu mới.'; }
void auth.restore().then(user => { if (user) location.replace('app.html'); }).catch(error => message(String(error)));
document.getElementById('f')!.addEventListener('submit', async event => {
  event.preventDefault();
  const email = field('u').value.trim();
  const pass = password.value;
  if (!email || !pass) { message('Hãy nhập email và mật khẩu.'); return; }
  const button = document.querySelector<HTMLButtonElement>('#f button[type="submit"]');
  if (button) button.disabled = true;
  try { await auth.login(email, pass, field('rm').checked); location.href = 'app.html'; }
  catch (error) { message(error instanceof ApiError ? error.message : 'Đăng nhập thất bại.'); }
  finally { if (button) button.disabled = false; }
});
