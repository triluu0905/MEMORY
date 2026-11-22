import { auth } from './auth';
import { workspace } from './workspace';

declare global {
  interface Window { MemoryAuth: typeof auth; MemoryWorkspace: typeof workspace }
}

async function boot(): Promise<void> {
  try {
    const user = await auth.restore();
    if (!user) { location.replace('login.html'); return; }
    await workspace.load();
    window.MemoryAuth = auth;
    window.MemoryWorkspace = workspace;
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
