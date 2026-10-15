import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { createDemoAccount } from "../demo";

export function AuthPage({ onAuthenticated, notice }: { onAuthenticated: (token: string) => void; notice: string | null }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setBusy(mode === "login" ? "Logging in…" : "Creating account…");
    try {
      const { accessToken } = mode === "login" ? await api.login(email, password) : await api.register(email, password);
      onAuthenticated(accessToken);
    } catch (err) {
      const e2 = err as ApiError;
      setError(e2.status === 409 ? "That email is already registered. Log in instead." : Object.values(e2.fields ?? {})[0] ?? e2.message);
    } finally {
      setBusy(null);
    }
  }

  async function demo() {
    setError(null);
    setBusy("Creating a demo account…");
    try {
      const token = await createDemoAccount((done, total) => setBusy(`Adding sample applications (${done}/${total})…`));
      onAuthenticated(token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="auth">
      <section className="card">
        <h1>Job Tracker</h1>
        <p className="muted">Track every application, see your response rate, and spot what's working.</p>
        {notice && <p className="notice" role="status">{notice}</p>}
        <button className="primary wide" onClick={demo} disabled={!!busy}>
          Try it with sample data
        </button>
        <p className="divider"><span>or</span></p>
        <form onSubmit={submit} noValidate>
          <label>
            Email
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="wide" disabled={!!busy}>
            {busy ?? (mode === "login" ? "Log in" : "Create account")}
          </button>
        </form>
        <p className="muted small">
          {mode === "login" ? "New here? " : "Have an account? "}
          <button className="link" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}>
            {mode === "login" ? "Create an account" : "Log in"}
          </button>
        </p>
      </section>
      <p className="muted small footer">
        React + TypeScript front end for a Spring Boot / PostgreSQL API.{" "}
        <a href="https://github.com/Revind4k/job-tracker-web">Source</a> ·{" "}
        <a href="https://github.com/Revind4k/job-tracker-api">API</a>
      </p>
    </main>
  );
}
