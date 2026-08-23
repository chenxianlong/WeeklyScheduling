let csrfToken: string | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function getCsrf() {
  if (csrfToken) return csrfToken;
  const response = await fetch("/api/auth/csrf", { credentials: "include" });
  const data = await response.json();
  csrfToken = data.csrfToken;
  return csrfToken as string;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("x-csrf-token", await getCsrf());
  }
  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;
  if (!response.ok) {
    if (response.status === 403 && data?.message?.includes("安全令牌")) csrfToken = null;
    throw new ApiError(data?.message ?? "请求失败", response.status, data?.details ?? data?.errors);
  }
  if (path === "/auth/login" || path === "/auth/logout") csrfToken = null;
  return data as T;
}

export function mutation<T>(path: string, method: string, body?: unknown) {
  return api<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
