import type { Stats, Status } from "./api";

export const LABEL: Record<Status, string> = {
  APPLIED: "Applied", SCREEN: "Screen", INTERVIEW: "Interview", OFFER: "Offer", REJECTED: "Rejected", WITHDRAWN: "Withdrawn",
};

/** Fills in weeks with no applications so the chart shows real gaps, oldest first. */
export function weekSeries(points: Stats["last12Weeks"], today = new Date()): { week: string; count: number }[] {
  const byWeek = new Map(points.map((p) => [p.week, p.count]));
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); // ISO week start, as Postgres date_trunc('week')
  const out = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(monday);
    d.setDate(d.getDate() - 7 * i);
    const key = d.toLocaleDateString("en-CA");
    out.push({ week: key, count: byWeek.get(key) ?? 0 });
  }
  return out;
}
