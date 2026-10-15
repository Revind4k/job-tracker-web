import { useEffect, useState } from "react";
import { session, setUnauthorizedHandler, waitForServer } from "./api";
import { AuthPage } from "./components/AuthPage";
import { Dashboard } from "./components/Dashboard";
import { tokenInfo } from "./demo";

type Boot = { state: "waking"; seconds: number } | { state: "ready" } | { state: "down" };

function storedToken(): string | null {
  const t = session.get();
  const info = t ? tokenInfo(t) : null;
  if (t && (!info || info.expiresAt <= Date.now())) {
    session.clear(); // expired while the tab sat open
    return null;
  }
  return t;
}

export default function App() {
  const [boot, setBoot] = useState<Boot>({ state: "waking", seconds: 0 });
  const [token, setToken] = useState<string | null>(storedToken);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setNotice("Your session expired. Please log in again.");
    });
    let cancelled = false;
    waitForServer((seconds) => !cancelled && setBoot({ state: "waking", seconds })).then(
      (ok) => !cancelled && setBoot(ok ? { state: "ready" } : { state: "down" }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (boot.state === "waking")
    return (
      <main className="center" aria-live="polite">
        <div className="spinner" aria-hidden />
        <h1>Job Tracker</h1>
        {boot.seconds < 3 ? (
          <p>Connecting…</p>
        ) : (
          <p>
            Waking up the server ({boot.seconds}s). It runs on a free tier that sleeps when idle, so the first visit
            takes 30–60 seconds.
          </p>
        )}
      </main>
    );
  if (boot.state === "down")
    return (
      <main className="center">
        <h1>Job Tracker</h1>
        <p>The API didn't respond within two minutes. Please try again later.</p>
        <button onClick={() => location.reload()}>Retry</button>
      </main>
    );

  const login = (t: string) => {
    session.set(t);
    setNotice(null);
    setToken(t);
  };
  const logout = () => {
    session.clear();
    setToken(null);
  };
  return token ? (
    <Dashboard email={tokenInfo(token)?.email ?? ""} onLogout={logout} />
  ) : (
    <AuthPage onAuthenticated={login} notice={notice} />
  );
}
