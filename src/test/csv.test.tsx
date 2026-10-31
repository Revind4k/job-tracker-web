import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import type { Status } from "../api";
import { csvField, csvFilename, toCsv } from "../csv";
import { makeToken, state } from "./fakeApi";

describe("csvField", () => {
  it("quotes commas, quotes, and newlines", () => {
    expect(csvField("Acme")).toBe("Acme");
    expect(csvField("Acme, Inc.")).toBe('"Acme, Inc."');
    expect(csvField('The "Best" Co')).toBe('"The ""Best"" Co"');
    expect(csvField("line one\nline two")).toBe('"line one\nline two"');
    expect(csvField(null)).toBe("");
  });
  it("defuses cells a spreadsheet would run as formulas", () => {
    expect(csvField('=HYPERLINK("http://evil.example","click")')).toBe(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
    expect(csvField("+1 555 0100")).toBe("'+1 555 0100");
    expect(csvField("-5")).toBe("'-5");
    expect(csvField("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvField("Data-driven")).toBe("Data-driven"); // only a leading sign counts
  });
});

describe("toCsv", () => {
  it("writes a BOM, a header, readable statuses and CRLF rows", () => {
    const csv = toCsv([{ id: 1, company: "Zürich Labs", role: "SWE", status: "INTERVIEW", appliedOn: "2026-10-01",
      url: null, notes: "Recruiter: Ana, call Tue", updatedAt: "" }]);
    expect(csv.startsWith("﻿Company,Role,Status,Applied,Link,Notes\r\n")).toBe(true);
    expect(csv).toContain('Zürich Labs,SWE,Interview,2026-10-01,,"Recruiter: Ana, call Tue"\r\n');
  });
  it("names the file after the filter and the local date", () => {
    expect(csvFilename(null, new Date("2026-10-31T12:00:00"))).toBe("applications-2026-10-31.csv");
    expect(csvFilename("OFFER", new Date("2026-10-31T12:00:00"))).toBe("applications-offer-2026-10-31.csv");
  });
});

describe("Export CSV", () => {
  afterEach(() => vi.restoreAllMocks());

  function seed(n: number) {
    state.users.set("eren@example.com", { id: 1, password: "x" });
    const statuses: Status[] = ["APPLIED", "INTERVIEW", "REJECTED"];
    for (let i = 0; i < n; i++) {
      const day = String(1 + (i % 28)).padStart(2, "0");
      state.apps.push({ id: state.nextId++, userId: 1, company: `Company ${i}`, role: "Engineer",
        status: statuses[i % 3], appliedOn: `2026-09-${day}`, url: null, notes: null, updatedAt: "" });
    }
    sessionStorage.setItem("jt.token", makeToken(1, "eren@example.com"));
  }

  async function exportAndRead(user: ReturnType<typeof userEvent.setup>) {
    let blob: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => { blob = b as Blob; return "blob:test"; });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    return { name: anchor.download, lines: (await blob!.text()).trim().split("\r\n") };
  }

  it("exports every application, not just the page on screen", async () => {
    seed(230); // the server caps a page at 100, so this takes three requests
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(21)); // the table shows one page of 20
    const { name, lines } = await exportAndRead(userEvent.setup());
    expect(lines).toHaveLength(231); // header + 230
    expect(new Set(lines.slice(1).map((l) => l.split(",")[0])).size).toBe(230); // no row twice
    expect(name).toMatch(/^applications-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("exports only the status that is filtered", async () => {
    seed(30);
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(21));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Interview/ }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(11));
    const { name, lines } = await exportAndRead(user);
    expect(lines).toHaveLength(11);
    expect(lines.slice(1).every((l) => l.includes(",Interview,"))).toBe(true);
    expect(name).toMatch(/^applications-interview-/);
  });
});
