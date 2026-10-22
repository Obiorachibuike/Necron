export const API_BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;
  details: { field: string; message: string; type?: string }[];

  constructor(status: number, code: string, message: string,
              details: { field: string; message: string; type?: string }[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  formData?: FormData;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  let body: BodyInit | undefined;

  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }

  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrf = readCookie("cp_csrf");
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    headers,
    body,
    credentials: "same-origin",
    cache: "no-store",
  });

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    let code = "request_failed";
    let message = `Request failed (${response.status}). Please try again.`;
    let details: { field: string; message: string; type?: string }[] = [];
    try {
      const data = await response.json();
      if (data?.error) {
        code = data.error.code ?? code;
        message = data.error.message ?? message;
        details = data.error.details ?? [];
      }
    } catch {
      /* non-JSON error body */
    }
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("cp:unauthorized"));
    }
    throw new ApiError(response.status, code, message, details);
  }

  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: "DELETE", body }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", formData }),
};

export async function downloadFile(path: string, filename: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "same-origin" });
  if (!response.ok) {
    let message = "Download failed.";
    try {
      const data = await response.json();
      message = data?.error?.message ?? message;
    } catch {
      /* ignore */
    }
    throw new ApiError(response.status, "download_failed", message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadUrl(path: string): string {
  return `${API_BASE}${path}`;
}
