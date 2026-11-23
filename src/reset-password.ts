import { auth } from './auth';
import { ApiError } from './api';

const token = new URLSearchParams(location.search).get('token') || '';
const message = document.getElementById('message')!;
const form = document.getElementById('reset-form') as HTMLFormElement;
if (!token) { message.className = 'message error'; message.textContent = 'Liên kết đặt lại mật khẩu không hợp lệ.'; form.querySelectorAll('input,button').forEach(element => { (element as HTMLInputElement).disabled = true; }); }
form.addEventListener('submit', async event => {
  event.preventDefault();
  const password = (document.getElementById('password') as HTMLInputElement).value;
  const confirm = (document.getElementById('confirm-password') as HTMLInputElement).value;
  if (password.length < 12) { message.className = 'message error'; message.textContent = 'Mật khẩu cần ít nhất 12 ký tự.'; return; }
  if (password !== confirm) { message.className = 'message error'; message.textContent = 'Hai mật khẩu chưa khớp.'; return; }
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  try { await auth.resetPassword(token, password); location.replace('login.html?reset=1'); }
  catch (error) { message.className = 'message error'; message.textContent = error instanceof ApiError ? error.message : 'Không thể đặt lại mật khẩu.'; }
  finally { button.disabled = false; }
});
