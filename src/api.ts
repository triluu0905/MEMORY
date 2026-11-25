export interface Account { id: string; email: string; name: string; lab: string; language: 'vi' | 'en' }
export interface Workspace { projects: unknown[]; charts: unknown[]; [key: string]: unknown }

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options });
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.');
  }
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data
      ? String(data.error) : 'Yêu cầu không thành công.';
    throw new ApiError(response.status, message);
  }
  return data as T;
}

export function json(method: 'POST' | 'PUT' | 'PATCH', value: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) };
}
