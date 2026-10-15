import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { api, ApiError, session, setUnauthorizedHandler, waitForServer } from "../api";
import { API, makeToken, server, state } from "./fakeApi";

describe("api client", () => {
  it("surfaces per-field validation errors", async () => {
    session.set((await api.register("a@b.co", "correct-horse")).accessToken);
    const err = await api.create({ company: " ", role: "SWE", status: "APPLIED", appliedOn: "2026-10-01" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.fields).toEqual({ company: "must not be blank" });
  });

  it("turns 429 into a retry hint from Retry-After", async () => {
    server.use(http.get(`${API}/applications/stats`, () =>
      HttpResponse.json({ error: "rate limit exceeded" }, { status: 429, headers: { "Retry-After": "17" } })));
    await expect(api.stats()).rejects.toThrow("Try again in 17 seconds");
  });

  it("reports a network failure as status 0 with a readable message", async () => {
    server.use(http.get(`${API}/applications/stats`, () => HttpResponse.error()));
    await expect(api.stats()).rejects.toMatchObject({ status: 0, message: expect.stringContaining("Can't reach the server") });
  });

  it("clears the token and notifies the app on 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    session.set(makeToken(1, "x@y.z", -10)); // already expired
    await expect(api.stats()).rejects.toMatchObject({ status: 401 });
    expect(session.get()).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("does not leak another user's applications", async () => {
    session.set((await api.register("one@x.co", "correct-horse")).accessToken);
    const mine = await api.create({ company: "A", role: "SWE", status: "APPLIED", appliedOn: "2026-10-01" });
    session.set((await api.register("two@x.co", "correct-horse")).accessToken);
    expect((await api.list()).total).toBe(0);
    await expect(api.remove(mine.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("waitForServer", () => {
  it("keeps polling through a cold start and reports elapsed time", async () => {
    vi.useFakeTimers();
    state.healthy = false;
    const waiting = vi.fn();
    const done = waitForServer(waiting);
    for (let i = 0; i < 3; i++) await vi.advanceTimersByTimeAsync(5000);
    expect(waiting).toHaveBeenCalled();
    state.healthy = true;
    await vi.advanceTimersByTimeAsync(5000);
    await expect(done).resolves.toBe(true);
    vi.useRealTimers();
  });

  it("gives up after the timeout", async () => {
    vi.useFakeTimers();
    state.healthy = false;
    const done = waitForServer(() => {}, 20_000);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(done).resolves.toBe(false);
    vi.useRealTimers();
  });
});
