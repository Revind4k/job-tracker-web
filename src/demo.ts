import { api, session, type ApplicationInput, type Status } from "./api";

/** Reads the email and expiry from a JWT payload (display only; the server verifies it). */
export function tokenInfo(token: string): { email: string; expiresAt: number } | null {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const p = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")));
    return { email: String(p.email ?? ""), expiresAt: Number(p.exp) * 1000 };
  } catch {
    return null;
  }
}

// Fictional companies, so the demo never implies a real application.
const COMPANIES = [
  "Northwind Labs", "Bluefin Analytics", "Cobalt Systems", "Harbor Health", "Lumen Robotics", "Pinecrest Bank",
  "Quarry Games", "Redwood Cloud", "Saltbox Media", "Tidewater Energy", "Umber Security", "Vantage Logistics",
  "Willow Finance", "Yardline Sports",
];
const ROLES = ["Software Engineer", "Backend Engineer", "Mobile Engineer (Flutter)", "Full-Stack Engineer", "SWE Intern", "Platform Engineer"];
// Weighted like a real search: most applications never hear back.
const OUTCOMES: Status[] = ["APPLIED", "APPLIED", "APPLIED", "APPLIED", "REJECTED", "REJECTED", "REJECTED", "SCREEN", "SCREEN", "INTERVIEW", "OFFER", "WITHDRAWN"];

export function sampleApplications(today = new Date(), rand = Math.random): ApplicationInput[] {
  return COMPANIES.map((company, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - Math.floor(rand() * 75)); // spread over ~11 weeks for the chart
    return {
      company,
      role: ROLES[i % ROLES.length],
      status: OUTCOMES[Math.floor(rand() * OUTCOMES.length)],
      appliedOn: d.toISOString().slice(0, 10),
      url: null,
      notes: i % 3 === 0 ? "Sample data for the demo account." : null,
    };
  });
}

/** Creates a throwaway account and fills it with sample applications. Returns the token. */
export async function createDemoAccount(onProgress?: (done: number, total: number) => void): Promise<string> {
  const id = crypto.getRandomValues(new Uint32Array(2)).join("");
  const password = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join("");
  const { accessToken } = await api.register(`demo-${id}@demo.invalid`, password);
  session.set(accessToken); // the create calls below need it
  const apps = sampleApplications();
  for (let i = 0; i < apps.length; i++) {
    await api.create(apps[i]); // sequential: stays well under the per-user rate limit
    onProgress?.(i + 1, apps.length);
  }
  return accessToken;
}
