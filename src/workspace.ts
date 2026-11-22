import { ApiError, json, request, type Workspace } from './api';

export interface FileRecord { id: string; name: string; size: number; src?: string }

class WorkspaceStore {
  initial: Workspace | null = null;
  private revision = '0';
  private pending: Workspace | null = null;
  private active: Promise<void> | null = null;
  private stopped = false;
  onStatus: (message: string, failed?: boolean) => void = () => {};

  async load(): Promise<Workspace | null> {
    const result = await request<{ data: Workspace | null; revision: string }>('/workspace');
    this.initial = result.data;
    this.revision = result.revision;
    return this.initial;
  }

  save(data: Workspace): void {
    if (this.stopped) return;
    this.pending = structuredClone(data);
    this.onStatus('Đang lưu…');
    void this.flush();
  }

  hasPending(): boolean { return Boolean(this.pending || this.active); }

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
        const result = await request<{ revision: string }>('/workspace', json('PUT', { data: value, revision: this.revision }));
        this.revision = result.revision;
        if (!this.pending) this.onStatus('Đã lưu');
      } catch (error) {
        this.pending = value;
        if (error instanceof ApiError && error.status === 409) {
          this.stopped = true;
          this.onStatus('Dữ liệu đã đổi ở phiên khác. Tải lại trang để xem bản mới.', true);
        } else {
          this.onStatus('Chưa lưu được. Nhấn để thử lại.', true);
        }
        break;
      }
    }
  }

  async upload(file: File): Promise<FileRecord> {
    if (file.size > 20 * 1024 * 1024) throw new ApiError(413, 'Tệp vượt quá 20 MB.');
    const record = await request<FileRecord>('/files', {
      method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) }, body: file
    });
    return { ...record, src: file.type.startsWith('image/') ? `/api/files/${record.id}?view=1` : undefined };
  }

  async remove(id: string): Promise<void> { await request(`/files/${encodeURIComponent(id)}`, { method: 'DELETE' }); }

  url(id: string): string { return `/api/files/${encodeURIComponent(id)}`; }
}

export const workspace = new WorkspaceStore();
