import { describe, expect, it } from "vitest";
import { STATUSES } from "../api";
import { weekSeries } from "../format";
import { sampleApplications, tokenInfo } from "../demo";
import { makeToken } from "./fakeApi";

describe("tokenInfo", () => {
  it("reads email and expiry from a JWT", () => {
    const info = tokenInfo(makeToken(7, "eren@example.com", 60));
    expect(info?.email).toBe("eren@example.com");
    expect(info!.expiresAt).toBeGreaterThan(Date.now());
  });
  it("returns null for garbage", () => {
    expect(tokenInfo("not-a-jwt")).toBeNull();
  });
});

describe("sampleApplications", () => {
  it("makes valid, past-dated applications for every fictional company", () => {
    const today = new Date("2026-10-15T12:00:00");
    const apps = sampleApplications(today);
    expect(apps).toHaveLength(14);
    for (const a of apps) {
      expect(STATUSES).toContain(a.status);
      expect(a.appliedOn <= "2026-10-15").toBe(true);
      expect(a.appliedOn >= "2026-07-31").toBe(true);
    }
  });
});

describe("weekSeries", () => {
  it("returns 12 Monday-aligned weeks with gaps filled, oldest first", () => {
    const s = weekSeries([{ week: "2026-10-12", count: 3 }, { week: "2026-09-28", count: 1 }], new Date("2026-10-15T12:00:00"));
    expect(s).toHaveLength(12);
    expect(s[11]).toEqual({ week: "2026-10-12", count: 3 }); // Thursday Oct 15 -> week of Monday Oct 12
    expect(s[10]).toEqual({ week: "2026-10-05", count: 0 });
    expect(s[9]).toEqual({ week: "2026-09-28", count: 1 });
    expect(s[0].week).toBe("2026-07-27");
  });
  it("treats Sunday as the end of the ISO week", () => {
    const s = weekSeries([], new Date("2026-10-18T12:00:00")); // a Sunday
    expect(s[11].week).toBe("2026-10-12");
  });
});
