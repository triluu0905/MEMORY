import { auth } from './auth';
import { ApiError } from './api';

const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const message = (value: string) => { const el = document.getElementById('msg')!; el.className = 'msg on err'; el.textContent = value; };
const clearMessage = () => { const el = document.getElementById('msg')!; el.className = 'msg'; el.textContent = ''; };
const password = field('p');
const validationAttempted = { value: false };
const setFieldError = (id: string, value: string) => {
  const input = field(id);
  const fieldContainer = input.closest('.field')!;
  const error = id === 'p' ? document.getElementById('ml')! : (() => {
    let node = fieldContainer.querySelector<HTMLElement>('.field-error');
    if (!node) {
      node = document.createElement('div');
      node.className = 'mlabel field-error';
      node.id = `error-${id}`;
      node.setAttribute('aria-live', 'polite');
      input.insertAdjacentElement('afterend', node);
    }
    return node;
  })();
  error.textContent = value;
  error.classList.toggle('err-text', Boolean(value));
  if (value) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', error.id);
  } else {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }
};
const validateFields = () => {
  const name = field('n').value.trim();
  const email = field('e').value.trim();
  const errors = [
    name.length < 2 ? 'Nhập họ tên, ít nhất 2 ký tự.' : '',
    !email ? 'Nhập email.' : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? 'Email không hợp lệ.' : '',
    !password.value ? 'Nhập mật khẩu.' : password.value.length < 12 ? 'Mật khẩu cần ít nhất 12 ký tự.' : '',
  ];
  ['n', 'e', 'p'].forEach((id, index) => setFieldError(id, errors[index]));
  return errors;
};
document.querySelectorAll<HTMLButtonElement>('[data-soc]').forEach(button => { button.disabled = true; button.title = 'Chưa hỗ trợ'; });
document.getElementById('tg')!.addEventListener('click', () => {
  password.type = password.type === 'password' ? 'text' : 'password';
  document.getElementById('tg')!.textContent = password.type === 'password' ? 'Hiện' : 'Ẩn';
});
const bars = document.querySelectorAll<HTMLElement>('.meter i');
password.addEventListener('input', () => {
  const score = Math.min(4, Number(password.value.length >= 12) + Number(/[A-Z]/.test(password.value)) + Number(/\d/.test(password.value)) + Number(/[^A-Za-z0-9]/.test(password.value)));
  bars.forEach((bar, index) => { bar.style.background = index < score ? '#5E9C8F' : ''; });
  if (validationAttempted.value) setFieldError('p', validateFields()[2]);
});
['n', 'e'].forEach(id => field(id).addEventListener('input', () => {
  if (validationAttempted.value) validateFields();
}));
document.getElementById('f')!.addEventListener('input', clearMessage);
void auth.restore().then(user => { if (user) location.replace('app.html'); }).catch(error => message(String(error)));
document.getElementById('f')!.addEventListener('submit', async event => {
  event.preventDefault();
  const name = field('n').value.trim(), email = field('e').value.trim(), pass = password.value;
  validationAttempted.value = true;
  const errors = validateFields();
  if (errors.some(Boolean)) {
    clearMessage();
    field(['n', 'e', 'p'][errors.findIndex(Boolean)]).focus();
    return;
  }
  if (!field('ag').checked) { message('Bạn cần đồng ý với Điều khoản và Chính sách bảo mật.'); return; }
  const button = document.querySelector<HTMLButtonElement>('#f button[type="submit"]');
  if (button) button.disabled = true;
  try { await auth.register({ name, email, pass }); location.href = 'app.html'; }
  catch (error) { message(error instanceof ApiError ? error.message : 'Đăng ký thất bại.'); }
  finally { if (button) button.disabled = false; }
});
