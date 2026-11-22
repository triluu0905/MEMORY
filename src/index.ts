import { auth } from './auth';
void auth.restore().then(user => {
  if (!user) return;
  document.querySelectorAll<HTMLAnchorElement>('a[href="login.html"],a[href="signup.html"]').forEach(link => {
    link.href = 'app.html';
    if (link.textContent?.trim() === 'Đăng nhập' || link.textContent?.trim() === 'Đăng ký') link.textContent = 'Vào workspace';
  });
}).catch(() => {});
