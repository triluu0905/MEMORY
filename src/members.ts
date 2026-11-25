import { ApiError, json, request } from './api';
import { auth } from './auth';
import { setLanguage, translateText } from './i18n';

type Workspace = { id: string; role: 'owner' | 'editor' | 'viewer'; name: string; email: string };
type Member = { user_id: string; role: string; joined_at: string; name: string; email: string };
const main = document.querySelector<HTMLElement>('main')!;
let workspaceId = new URLSearchParams(location.search).get('workspace');
let workspaces: Workspace[] = [];

function esc(value: unknown) { return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!)); }
function appUrl(id: string) { return `app.html?workspace=${encodeURIComponent(id)}`; }
function t(value: string) { return translateText(value); }
function roleLabel(role: string) { return t(({ owner: 'Chủ sở hữu', editor: 'Có thể sửa', viewer: 'Chỉ xem' } as Record<string, string>)[role] || role); }
async function load(): Promise<void> {
  const user = await auth.restore();
  if (!user) { location.replace('login.html'); return; }
  setLanguage(user.language);
  workspaces = (await request<{ workspaces: Workspace[] }>('/workspaces')).workspaces;
  workspaceId = workspaceId || workspaces[0]?.id || null;
  if (!workspaceId) throw new Error('Không tìm thấy workspace');
  const [membersResult, activitiesResult, invitationsResult] = await Promise.all([
    request<{ members: Member[]; role: string }>(`/workspaces/${workspaceId}/members`),
    request<{ activities: Array<{ type: string; created_at: string; name: string | null; email: string | null }> }>(`/workspaces/${workspaceId}/activities`),
    request<{ invitations: Array<{ id: string; email: string; role: string; expires_at: string }> }>(`/workspaces/${workspaceId}/invitations`).catch(error => error instanceof ApiError && error.status === 403 ? { invitations: [] } : Promise.reject(error))
  ]);
  const current = workspaces.find(item => item.id === workspaceId)!;
  const canManage = membersResult.role === 'owner';
  main.innerHTML = `<header><a href="${appUrl(workspaceId)}">${t('← Quay lại')}</a><h1>${t('Thành viên')}</h1><p>${esc(current.name)} · ${t('Quyền của bạn')}: <b>${roleLabel(current.role)}</b></p></header>
    <section><label>${t('Không gian làm việc')} <select id="workspace">${workspaces.map(item => `<option value="${item.id}" ${item.id === workspaceId ? 'selected' : ''}>${esc(item.name)} (${roleLabel(item.role)})</option>`).join('')}</select></label></section>
    ${canManage ? `<section><h2>${t('Mời thành viên')}</h2><form id="invite"><input name="email" type="email" placeholder="email@lab.edu" required><select name="role"><option value="editor">${t('Có thể sửa')}</option><option value="viewer">${t('Chỉ xem')}</option></select><button>${t('Tạo liên kết mời')}</button></form><p id="invite-result"></p></section>` : ''}
    <section><h2>${t('Đã tham gia')}</h2><ul>${membersResult.members.map(member => `<li><span><b>${esc(member.name)}</b> · ${esc(member.email)} <small>${roleLabel(member.role)} · ${new Date(member.joined_at).toLocaleString('vi-VN')}</small></span>${canManage && member.role !== 'owner' ? `<button data-remove="${member.user_id}">${t('Xóa')}</button>` : ''}</li>`).join('')}</ul></section>
    ${canManage && invitationsResult.invitations.length ? `<section><h2>${t('Đang chờ')}</h2><ul>${invitationsResult.invitations.map(invite => `<li>${esc(invite.email)} · ${roleLabel(invite.role)} <small>${t('Hết hạn')} ${new Date(invite.expires_at).toLocaleString('vi-VN')}</small></li>`).join('')}</ul></section>` : ''}
    <section><h2>${t('Hoạt động gần đây')}</h2><ul>${activitiesResult.activities.length ? activitiesResult.activities.map(event => `<li>${esc(event.name || event.email || t('Một thành viên'))} ${event.type === 'member_joined' ? t('đã tham gia') : event.type === 'member_removed' ? t('đã bị xóa') : t('đã rời đi')} <small>${new Date(event.created_at).toLocaleString('vi-VN')}</small></li>`).join('') : `<li>${t('Chưa có hoạt động.')}</li>`}</ul></section>`;
  document.querySelector<HTMLSelectElement>('#workspace')!.onchange = event => { location.href = `members.html?workspace=${encodeURIComponent((event.target as HTMLSelectElement).value)}`; };
  document.querySelector<HTMLFormElement>('#invite')?.addEventListener('submit', async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget as HTMLFormElement);
    const result = await request<{ token: string; expiresInDays: number }>(`/workspaces/${workspaceId}/invitations`, json('POST', { email: form.get('email'), role: form.get('role') }));
    const link = `${location.origin}/app.html?invite=${encodeURIComponent(result.token)}`;
    const output = document.querySelector<HTMLElement>('#invite-result')!;
    output.innerHTML = `${t('Gửi liên kết này. Hết hạn sau')} ${result.expiresInDays} ${t('ngày')}: <a href="${link}">${esc(link)}</a> <button id="copy">${t('Sao chép')}</button>`;
    document.querySelector<HTMLButtonElement>('#copy')!.onclick = async () => { await navigator.clipboard.writeText(link); document.querySelector<HTMLButtonElement>('#copy')!.textContent = t('Đã sao chép'); };
  });
  document.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach(button => button.onclick = async () => { if (!confirm('Xóa thành viên này khỏi workspace?')) return; await request(`/workspaces/${workspaceId}/members/${button.dataset.remove}`, { method: 'DELETE' }); await load(); });
}
void load().catch(error => { main.textContent = `Không tải được thành viên: ${error instanceof Error ? error.message : String(error)}`; });
