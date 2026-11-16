// Small hooks and helpers shared by every screen.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { nowIso, useDb } from "@/domain/db";
import type { Result } from "@/domain/actions";
import { can, type Permission } from "@/domain/permissions";
import type { Consultant, Db, StaffUser } from "@/domain/types";

/** Current demo time, refreshed every 30 seconds and whenever data changes. */
export function useNow(): string {
  const db = useDb();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);
  void db.meta.now;
  return nowIso();
}

export function useStaffUser(): StaffUser | undefined {
  const db = useDb();
  const s = db.meta.session;
  return s.kind === "staff" ? db.users.find((u) => u.id === s.userId) : undefined;
}

export function useConsultant(): Consultant | undefined {
  const db = useDb();
  const s = db.meta.session;
  return s.kind === "consultant" ? db.consultants.find((c) => c.id === s.consultantId) : undefined;
}

/**
 * Decision tags and notes about open decisions or source formats show only
 * while presenter mode is off, for review sessions with FemmeCare.
 */
export function useReviewNotes(): boolean {
  return !useDb().meta.presenterMode;
}

export function useCan(p: Permission): boolean {
  const u = useStaffUser();
  return can(u?.roles, p);
}

/** Name for any actor id found in audit entries and timelines. */
export function actorName(db: Db, id?: string): string {
  if (!id) return "";
  if (id === "system") return "System";
  if (id === "applicant") return "Applicant";
  if (id === "visitor") return "Website visitor";
  if (id === "courier") return "Courier";
  const u = db.users.find((x) => x.id === id);
  if (u) return u.name;
  const c = db.consultants.find((x) => x.id === id);
  if (c) return `${c.givenName} ${c.surname}`.trim();
  return id;
}

/**
 * Run an action and show a confirmation or the error.
 * Returns the value on success, undefined on failure.
 */
export function act<T>(r: Result<T>, success?: string | ((v: T) => string)): T | undefined {
  if (r.ok) {
    if (success) toast.success(typeof success === "function" ? success(r.value) : success);
    return r.value;
  }
  toast.error(r.error);
  return undefined;
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function toCsv(rows: (string | number | undefined | null)[][]): string {
  return rows
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
}

/** Export rows to a real .xlsx file. */
export async function downloadExcel(filename: string, header: string[], rows: (string | number | undefined | null)[][], sheet = "Report") {
  const { default: writeXlsxFile } = await import("write-excel-file");
  const data = [
    header.map((h) => ({ value: h, fontWeight: "bold" as const })),
    ...rows.map((r) => r.map((v) => ({ value: v ?? "", type: typeof v === "number" ? Number : String }))),
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await writeXlsxFile(data as any, { fileName: filename, sheet });
}
