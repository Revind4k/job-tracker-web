import type { Stats } from "../api";
import { weekSeries } from "../format";

export function StatsPanel({ stats }: { stats: Stats }) {
  const weeks = weekSeries(stats.last12Weeks);
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const active = (stats.byStatus.SCREEN ?? 0) + (stats.byStatus.INTERVIEW ?? 0);
  return (
    <section className="stats" aria-label="Summary">
      <div className="card stat"><span className="big">{stats.total}</span><span className="muted">applications</span></div>
      <div className="card stat">
        <span className="big">{Math.round(stats.responseRate * 100)}%</span>
        <span className="muted">response rate</span>
      </div>
      <div className="card stat"><span className="big">{active}</span><span className="muted">in progress</span></div>
      <div className="card stat"><span className="big">{stats.byStatus.OFFER ?? 0}</span><span className="muted">offers</span></div>
      <figure className="card chart">
        <figcaption className="muted small">Applications per week (last 12 weeks)</figcaption>
        <div className="bars" role="img"
          aria-label={weeks.map((w) => `${w.week}: ${w.count}`).join(", ")}>
          {weeks.map((w) => (
            <div key={w.week} className="bar" style={{ height: `${(w.count / max) * 100}%` }} title={`Week of ${w.week}: ${w.count}`}>
              {w.count > 0 && <span>{w.count}</span>}
            </div>
          ))}
        </div>
      </figure>
    </section>
  );
}
