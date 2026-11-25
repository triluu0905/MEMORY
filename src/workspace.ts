import { ApiError, json, request, type Workspace } from './api';

export interface FileRecord { id: string; name: string; size: number; src?: string }
export interface SampleHistoryEntry {
  id: string; sample_code: string; actor_id: string | null; actor_name: string; type: 'created' | 'edited' | 'deleted';
  changes: { field: string; before: string; after: string }[]; created_at: string;
}

class WorkspaceStore {
  initial: Workspace | null = null;
  workspaceId: string | null = null;
  role: 'owner' | 'editor' | 'viewer' = 'owner';
  private revision = '0';
  private pending: Workspace | null = null;
  private active: Promise<void> | null = null;
  private stopped = false;
  onStatus: (message: string, failed?: boolean) => void = () => {};

  private path(path: string): string { return this.workspaceId ? `${path}${path.includes('?') ? '&' : '?'}workspace=${encodeURIComponent(this.workspaceId)}` : path; }

  async load(workspaceId?: string | null): Promise<Workspace | null> {
    this.workspaceId = workspaceId || null;
    const result = await request<{ data: Workspace | null; revision: string; workspaceId: string; role: 'owner' | 'editor' | 'viewer' }>(this.path('/workspace'));
    this.initial = result.data;
    this.revision = result.revision;
    this.workspaceId = result.workspaceId;
    this.role = result.role;
    return this.initial;
  }

  save(data: Workspace): void {
    if (this.stopped) return;
    this.pending = structuredClone(data);
    this.onStatus('Đang lưu…');
    void this.flush();
  }

  hasPending(): boolean { return Boolean(this.pending || this.active); }

  async sampleHistory(sampleId: string): Promise<SampleHistoryEntry[]> {
    const result = await request<{ history: SampleHistoryEntry[] }>(this.path(`/sample-history?sample=${encodeURIComponent(sampleId)}`));
    return result.history;
  }

  async flush(): Promise<boolean> {
    if (this.active) { await this.active; return !this.pending && !this.stopped; }
    if (!this.pending || this.stopped) return !this.pending && !this.stopped;
    this.active = this.drain();
    await this.active;
    this.active = null;
    return !this.pending && !this.stopped;
  }

  private async drain(): Promise<void> {
    while (this.pending && !this.stopped) {
      const value = this.pending;
      this.pending = null;
      try {
        const result = await request<{ revision: string }>(this.path('/workspace'), json('PUT', { data: value, revision: this.revision }));
        this.revision = result.revision;
        if (!this.pending) this.onStatus('Đã lưu');
      } catch (error) {
        this.pending = value;
        if (error instanceof ApiError && error.status === 409) {
          this.stopped = true;
          this.onStatus('Dữ liệu đã thay đổi ở nơi khác. Tải lại để xem bản mới.', true);
        } else {
          this.onStatus('Chưa lưu được. Nhấn để thử lại.', true);
        }
        break;
      }
    }
  }

  async upload(file: File): Promise<FileRecord> {
    if (file.size > 20 * 1024 * 1024) throw new ApiError(413, 'Tệp vượt quá 20 MB.');
    const record = await request<FileRecord>(this.path('/files'), {
      method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) }, body: file
    });
    return { ...record, src: file.type.startsWith('image/') ? `/api/files/${record.id}?view=1` : undefined };
  }

  async remove(id: string): Promise<void> { await request(this.path(`/files/${encodeURIComponent(id)}`), { method: 'DELETE' }); }

  url(id: string): string { return `/api${this.path(`/files/${encodeURIComponent(id)}`)}`; }
}

export const workspace = new WorkspaceStore();
