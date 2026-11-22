import { auth } from './auth';
import { ApiError } from './api';

const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const message = (value: string) => { const el = document.getElementById('msg')!; el.className = 'msg on err'; el.textContent = value; };
const password = field('p');
document.querySelectorAll<HTMLButtonElement>('[data-soc]').forEach(button => { button.disabled = true; button.title = 'Chưa hỗ trợ'; });
document.getElementById('tg')!.addEventListener('click', () => {
  password.type = password.type === 'password' ? 'text' : 'password';
  document.getElementById('tg')!.textContent = password.type === 'password' ? 'Hiện' : 'Ẩn';
});
const bars = document.querySelectorAll<HTMLElement>('.meter i');
password.addEventListener('input', () => {
  const score = Math.min(4, Number(password.value.length >= 12) + Number(/[A-Z]/.test(password.value)) + Number(/\d/.test(password.value)) + Number(/[^A-Za-z0-9]/.test(password.value)));
  bars.forEach((bar, index) => { bar.style.background = index < score ? '#5E9C8F' : ''; });
  document.getElementById('ml')!.textContent = password.value ? 'Mật khẩu cần ít nhất 12 ký tự' : '';
});
void auth.restore().then(user => { if (user) location.replace('app.html'); }).catch(error => message(String(error)));
document.getElementById('f')!.addEventListener('submit', async event => {
  event.preventDefault();
  const name = field('n').value.trim(), email = field('e').value.trim(), pass = password.value;
  if (name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || pass.length < 12) { message('Nhập tên, email hợp lệ và mật khẩu ít nhất 12 ký tự.'); return; }
  if (!field('ag').checked) { message('Bạn cần đồng ý với Điều khoản và Chính sách bảo mật.'); return; }
  const button = document.querySelector<HTMLButtonElement>('#f button[type="submit"]');
  if (button) button.disabled = true;
  try { await auth.register({ name, email, pass }); location.href = 'app.html'; }
  catch (error) { message(error instanceof ApiError ? error.message : 'Đăng ký thất bại.'); }
  finally { if (button) button.disabled = false; }
});
