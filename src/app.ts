import { auth } from './auth';
import { workspace } from './workspace';

declare global {
  interface Window { MemoryAuth: typeof auth; MemoryWorkspace: typeof workspace }
}

async function boot(): Promise<void> {
  try {
    const user = await auth.restore();
    if (!user) { location.replace('login.html'); return; }
    const params = new URLSearchParams(location.search);
    const invite = params.get('invite');
    let workspaceId = params.get('workspace');
    if (invite) {
      const response = await fetch('/api/invitations/accept', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: invite }) });
      const accepted = await response.json() as { workspaceId?: string; error?: string };
      if (!response.ok || !accepted.workspaceId) throw new Error(accepted.error || 'Không thể nhận lời mời');
      workspaceId = accepted.workspaceId;
      history.replaceState(null, '', `app.html?workspace=${encodeURIComponent(workspaceId)}`);
    }
    await workspace.load(workspaceId);
    window.MemoryAuth = auth;
    window.MemoryWorkspace = workspace;
    const membersLink = document.querySelector<HTMLAnchorElement>('#membersLink');
    if (membersLink && workspace.workspaceId) membersLink.href = `members.html?workspace=${encodeURIComponent(workspace.workspaceId)}`;
    document.getElementById('saved')?.addEventListener('click', () => { void workspace.flush(); });
    window.addEventListener('online', () => { void workspace.flush(); });
    const loadUi = import.meta.glob('./workspace-ui.ts')['./workspace-ui.ts'];
    if (!loadUi) throw new Error('Workspace renderer missing');
    await loadUi();
  } catch (error) {
    document.body.textContent = `Không tải được workspace: ${String(error)}. Hãy tải lại trang.`;
  }
}
void boot();
