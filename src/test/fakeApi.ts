// In-memory stand-in for job-tracker-api, served through MSW so components make real fetch
// calls. Mirrors the server's contract: JWT auth, per-user data, validation errors, stats.
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { Application, Status } from "../api";

export const API = "http://localhost:8080";
const STATUSES: Status[] = ["APPLIED", "SCREEN", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"];

interface State {
  users: Map<string, { id: number; password: string }>;
  apps: (Application & { userId: number })[];
  nextId: number;
  healthy: boolean;
  failNextPatch: boolean;
}
export const state: State = { users: new Map(), apps: [], nextId: 1, healthy: true, failNextPatch: false };
export function resetFake() {
  state.users.clear();
  state.apps = [];
  state.nextId = 1;
  state.healthy = true;
  state.failNextPatch = false;
}

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
export function makeToken(userId: number, email: string, expSeconds = 3600) {
  return `${b64url({ alg: "HS256" })}.${b64url({ sub: String(userId), email, exp: Math.floor(Date.now() / 1000) + expSeconds })}.sig`;
}
function userOf(req: Request): number | null {
  const m = /^Bearer (.+)$/.exec(req.headers.get("Authorization") ?? "");
  if (!m) return null;
  try {
    const p = JSON.parse(atob(m[1].split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.exp * 1000 > Date.now() && p.sub !== "revoked" ? Number(p.sub) : null;
  } catch {
    return null;
  }
}
const unauthorized = () => HttpResponse.json({ error: "unauthorized" }, { status: 401 });

function validate(body: Partial<Application>, partial: boolean) {
  const fields: Record<string, string> = {};
  if (!partial || body.company !== undefined) if (!body.company?.trim()) fields.company = "must not be blank";
  if (!partial || body.role !== undefined) if (!body.role?.trim()) fields.role = "must not be blank";
  if (!partial && !body.appliedOn) fields.appliedOn = "must not be null";
  return Object.keys(fields).length ? HttpResponse.json({ error: "validation failed", fields }, { status: 400 }) : null;
}

export const handlers = [
  http.get(`${API}/actuator/health`, () =>
    state.healthy ? HttpResponse.json({ status: "UP" }) : HttpResponse.error()),
  http.post(`${API}/auth/register`, async ({ request }) => {
    const { email, password } = (await request.json()) as { email: string; password: string };
    if (state.users.has(email.toLowerCase())) return HttpResponse.json({ error: "email already registered" }, { status: 409 });
    const id = state.users.size + 1;
    state.users.set(email.toLowerCase(), { id, password });
    return HttpResponse.json({ accessToken: makeToken(id, email.toLowerCase()), tokenType: "Bearer", expiresIn: 3600 }, { status: 201 });
  }),
  http.post(`${API}/auth/login`, async ({ request }) => {
    const { email, password } = (await request.json()) as { email: string; password: string };
    const u = state.users.get(email.toLowerCase());
    if (!u || u.password !== password) return HttpResponse.json({ error: "invalid email or password" }, { status: 401 });
    return HttpResponse.json({ accessToken: makeToken(u.id, email.toLowerCase()), tokenType: "Bearer", expiresIn: 3600 });
  }),
  http.get(`${API}/applications/stats`, ({ request }) => {
    const uid = userOf(request);
    if (uid === null) return unauthorized();
    const mine = state.apps.filter((a) => a.userId === uid);
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, mine.filter((a) => a.status === s).length]));
    const responded = mine.length - byStatus.APPLIED - byStatus.WITHDRAWN;
    return HttpResponse.json({ total: mine.length, byStatus, responseRate: mine.length ? responded / mine.length : 0, last12Weeks: [] });
  }),
  http.get(`${API}/applications`, ({ request }) => {
    const uid = userOf(request);
    if (uid === null) return unauthorized();
    const q = new URL(request.url).searchParams;
    const page = Number(q.get("page") ?? 0), size = Number(q.get("size") ?? 20), status = q.get("status");
    const mine = state.apps
      .filter((a) => a.userId === uid && (!status || a.status === status))
      .sort((a, b) => b.appliedOn.localeCompare(a.appliedOn) || b.id - a.id);
    return HttpResponse.json({ items: mine.slice(page * size, page * size + size), page, size, total: mine.length });
  }),
  http.post(`${API}/applications`, async ({ request }) => {
    const uid = userOf(request);
    if (uid === null) return unauthorized();
    const body = (await request.json()) as Partial<Application>;
    const bad = validate(body, false);
    if (bad) return bad;
    const app = { ...(body as Application), url: body.url ?? null, notes: body.notes ?? null, status: body.status ?? "APPLIED", id: state.nextId++, userId: uid, updatedAt: new Date().toISOString() };
    state.apps.push(app);
    return HttpResponse.json(app, { status: 201 });
  }),
  http.patch(`${API}/applications/:id`, async ({ request, params }) => {
    const uid = userOf(request);
    if (uid === null) return unauthorized();
    if (state.failNextPatch) {
      state.failNextPatch = false;
      return HttpResponse.json({ error: "database unavailable" }, { status: 503 });
    }
    const app = state.apps.find((a) => a.id === Number(params.id) && a.userId === uid);
    if (!app) return HttpResponse.json({ error: "application not found" }, { status: 404 });
    const body = (await request.json()) as Partial<Application>;
    const bad = validate(body, true);
    if (bad) return bad;
    Object.assign(app, body, { updatedAt: new Date().toISOString() });
    return HttpResponse.json(app);
  }),
  http.delete(`${API}/applications/:id`, ({ request, params }) => {
    const uid = userOf(request);
    if (uid === null) return unauthorized();
    const i = state.apps.findIndex((a) => a.id === Number(params.id) && a.userId === uid);
    if (i < 0) return HttpResponse.json({ error: "application not found" }, { status: 404 });
    state.apps.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];

export const server = setupServer(...handlers);
