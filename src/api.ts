// Typed client for job-tracker-api (github.com/Revind4k/job-tracker-api).

export const STATUSES = ["APPLIED", "SCREEN", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"] as const;
export type Status = (typeof STATUSES)[number];

export interface Application {
  id: number;
  company: string;
  role: string;
  status: Status;
  appliedOn: string; // YYYY-MM-DD
  url: string | null;
  notes: string | null;
  updatedAt: string;
}

export type ApplicationInput = Pick<Application, "company" | "role" | "status" | "appliedOn"> & {
  url?: string | null;
  notes?: string | null;
};

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

export interface Stats {
  total: number;
  byStatus: Record<Status, number>;
  responseRate: number;
  last12Weeks: { week: string; count: number }[];
}

/** An HTTP error from the API, with the server's message and any per-field validation errors. */
export class ApiError extends Error {
  readonly status: number;
  readonly fields: Record<string, string>;
  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8080").replace(/\/$/, "");
const TOKEN_KEY = "jt.token";

// sessionStorage, not localStorage: the token dies with the tab, which limits how long a
// token stolen by an XSS bug (or left on a shared machine) stays useful.
export const session = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t: string) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

let onUnauthorized: () => void = () => {};
/** Called when a request comes back 401 (expired or invalid token). */
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = session.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (res.status === 401 && token) {
    session.clear();
    onUnauthorized();
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 429) {
      const wait = res.headers.get("Retry-After");
      throw new ApiError(429, `Too many requests. Try again in ${wait ?? "a few"} seconds.`);
    }
    throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`,
      (data as { fields?: Record<string, string> }).fields);
  }
  return data as T;
}

export const api = {
  register: (email: string, password: string) =>
    request<{ accessToken: string }>("POST", "/auth/register", { email, password }),
  login: (email: string, password: string) =>
    request<{ accessToken: string }>("POST", "/auth/login", { email, password }),
  list: (opts: { status?: Status; page?: number; size?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.status) q.set("status", opts.status);
    q.set("page", String(opts.page ?? 0));
    q.set("size", String(opts.size ?? 20));
    return request<Page<Application>>("GET", `/applications?${q}`);
  },
  create: (a: ApplicationInput) => request<Application>("POST", "/applications", a),
  update: (id: number, patch: Partial<ApplicationInput>) => request<Application>("PATCH", `/applications/${id}`, patch),
  remove: (id: number) => request<void>("DELETE", `/applications/${id}`),
  stats: () => request<Stats>("GET", "/applications/stats"),
};

/**
 * The free hosting tier sleeps after 15 idle minutes, and the first request then takes
 * 30-60 s while the server boots. Polls the health check until it answers, reporting
 * elapsed seconds so the UI can say what's happening instead of looking broken.
 */
export async function waitForServer(onWaiting: (seconds: number) => void, timeoutMs = 120_000): Promise<boolean> {
  const start = Date.now();
  for (let attempt = 0; Date.now() - start < timeoutMs; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(`${BASE}/actuator/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) return true;
    } catch {
      // still booting
    }
    onWaiting(Math.round((Date.now() - start) / 1000));
    await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 5000)));
  }
  return false;
}
