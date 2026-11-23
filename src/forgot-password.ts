import { auth } from './auth';
import { ApiError } from './api';

const email = document.getElementById('email') as HTMLInputElement;
const message = document.getElementById('message')!;
document.getElementById('forgot-form')!.addEventListener('submit', async event => {
  event.preventDefault();
  if (!email.value.trim()) { message.textContent = 'Hãy nhập email của bạn.'; return; }
  const button = document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  try {
    await auth.requestPasswordReset(email.value.trim());
    message.className = 'message success';
    message.textContent = 'Nếu email tồn tại, chúng tôi đã gửi liên kết đặt lại mật khẩu. Hãy kiểm tra cả thư mục Spam.';
  } catch (error) {
    message.className = 'message error';
    message.textContent = error instanceof ApiError ? error.message : 'Không thể gửi yêu cầu. Hãy thử lại.';
  } finally { button.disabled = false; }
});
