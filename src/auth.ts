import { ApiError, json, request, type Account } from './api';

let current: Account | null = null;
export const auth = {
  session: () => current,
  async restore(): Promise<Account | null> {
    try { current = (await request<{ user: Account }>('/me')).user; }
    catch (error) { if (error instanceof ApiError && error.status === 401) current = null; else throw error; }
    return current;
  },
  async register(input: { name: string; email: string; pass: string }): Promise<Account> {
    const result = await request<{ user: Account }>('/register', json('POST', { name: input.name, email: input.email, password: input.pass }));
    current = result.user;
    return current;
  },
  async login(email: string, password: string, remember: boolean): Promise<Account> {
    const result = await request<{ user: Account }>('/login', json('POST', { email, password, remember }));
    current = result.user;
    return current;
  },
  async requestPasswordReset(email: string): Promise<void> {
    await request('/forgot-password', json('POST', { email }));
  },
  async resetPassword(token: string, password: string): Promise<void> {
    await request('/reset-password', json('POST', { token, password }));
  },
  async update(changes: { name: string; lab: string }): Promise<Account> {
    const result = await request<{ user: Account }>('/me', json('PATCH', changes));
    current = result.user;
    return current;
  },
  async logout(): Promise<void> { await request('/logout', { method: 'POST' }); current = null; }
};
