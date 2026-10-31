import type { Application } from "./api";
import { LABEL } from "./format";

const HEADER = ["Company", "Role", "Status", "Applied", "Link", "Notes"];

/**
 * One RFC 4180 field. Spreadsheets run a cell that starts with = + - @ (or a tab or carriage
 * return) as a formula, so a company name like "=HYPERLINK(...)" typed into the app would
 * execute when the export is opened in Excel. Those cells get a leading apostrophe, which
 * Excel and Sheets show as plain text.
 */
export function csvField(value: string | null): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(apps: Application[]): string {
  const rows = apps.map((a) => [a.company, a.role, LABEL[a.status], a.appliedOn, a.url, a.notes]);
  // CRLF line endings and a byte-order mark so Excel opens UTF-8 names (é, ü, 日本) correctly.
  return "﻿" + [HEADER, ...rows].map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}

export function csvFilename(status: string | null, today = new Date()): string {
  return `applications${status ? "-" + status.toLowerCase() : ""}-${today.toLocaleDateString("en-CA")}.csv`;
}
