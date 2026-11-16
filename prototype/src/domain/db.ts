// The in-browser database: one immutable state object, saved to IndexedDB.
// Every change goes through `mutate`, which stamps the demo as changed,
// notifies subscribers (React screens and the ra-core data provider) and saves.

import { produce, type Draft } from "immer";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import { useSyncExternalStore } from "react";
import type { AuditEntry, Db, InboxItem, OutboxMessage, RoleId } from "./types";

const STATE_KEY = "femmecare:state:v1";
const SNAP_INDEX_KEY = "femmecare:snapshots";

let state: Db | null = null;
let realTimeAtSet = Date.now();
const listeners = new Set<() => void>();

export function hasDb() {
  return state !== null;
}

export function getDb(): Db {
  if (!state) throw new Error("Database not loaded");
  return state;
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => fn());
}

// ---------- Several tabs at once ----------
// Each tab keeps its own signed-in person (sessionStorage), so a consultant can
// be in one window and Finance in another. Data changes are broadcast so every
// open tab shows the same records straight away.

const SESSION_KEY = "femmecare:session";
const channel: BroadcastChannel | null = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("femmecare-db") : null;

function tabSession(): Db["meta"]["session"] | undefined {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Db["meta"]["session"]) : undefined;
  } catch {
    return undefined;
  }
}

function rememberSession(s: Db["meta"]["session"]) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* private mode: the session still works for this page */
  }
}

function withTabSession(next: Db): Db {
  const mine = state?.meta.session ?? tabSession();
  if (!mine) return next;
  return produce(next, (d) => {
    d.meta.session = mine;
  });
}

channel?.addEventListener("message", (e: MessageEvent<{ type: "state"; db: Db; realTimeAtSet: number }>) => {
  if (e.data?.type !== "state") return;
  state = withTabSession(e.data.db);
  realTimeAtSet = e.data.realTimeAtSet;
  emit();
});

function broadcast() {
  if (!channel || !state) return;
  try {
    channel.postMessage({ type: "state", db: state, realTimeAtSet });
  } catch {
    /* too large or not cloneable: other tabs catch up on their next load */
  }
}

let saveTimer: number | undefined;
function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    if (!state) return;
    const toSave = produce(state, (d) => {
      d.meta.now = nowIso();
    });
    void idbSet(STATE_KEY, toSave);
  }, 300);
}

/** Replace the whole state (scenario load, snapshot restore). */
export function replaceDb(next: Db, opts: { markChanged?: boolean; keepSession?: boolean } = {}) {
  const prepared = opts.keepSession ? withTabSession(next) : next;
  state = produce(prepared, (d) => {
    if (opts.markChanged !== undefined) d.meta.changed = opts.markChanged;
  });
  rememberSession(state.meta.session);
  realTimeAtSet = Date.now();
  emit();
  scheduleSave();
  broadcast();
}

/** Apply a change. The recipe receives a draft it may mutate freely. */
export function mutate<T = void>(recipe: (d: Draft<Db>) => T, opts: { silent?: boolean } = {}): T {
  let result: T = undefined as T;
  const base = getDb();
  const before = base.meta.session;
  state = produce(base, (d) => {
    result = recipe(d);
    if (!opts.silent) d.meta.changed = true;
  });
  if (state.meta.session !== before) rememberSession(state.meta.session);
  emit();
  scheduleSave();
  broadcast();
  return result;
}

export async function loadSavedDb(): Promise<Db | undefined> {
  try {
    const saved = (await idbGet(STATE_KEY)) as Db | undefined;
    const mine = tabSession();
    if (saved && mine) return produce(saved, (d) => void (d.meta.session = mine));
    return saved;
  } catch {
    return undefined;
  }
}

export function useDb(): Db {
  return useSyncExternalStore(subscribe, getDb, getDb);
}

// ---------- Demo clock ----------

/** Current demo time: the scenario's date plus real time elapsed since it was set. */
export function nowIso(): string {
  if (!state) return new Date().toISOString();
  const base = Date.parse(state.meta.now);
  return new Date(base + (Date.now() - realTimeAtSet)).toISOString();
}

/** True while the seed generator runs: timestamps come from the generator's clock. */
let seedMode = false;
export function setSeedMode(on: boolean) {
  seedMode = on;
}

/** Timestamp for a record created inside a mutate recipe. */
export function stamp(d: Draft<Db> | Db): string {
  return seedMode ? d.meta.now : nowIso();
}

export function now(): Date {
  return new Date(nowIso());
}

/** Used by the seed generator and the demo clock controls. */
export function setClock(d: Draft<Db>, iso: string) {
  d.meta.now = iso;
  realTimeAtSet = Date.now();
}

// ---------- Ids ----------

/** Next id for a prefix, e.g. nextId(d, "SO", 5) -> "SO-27-00418". */
export function nextId(d: Draft<Db>, prefix: string, width = 5, withYear = true): string {
  const yy = stamp(d).slice(2, 4);
  const key = withYear ? `${prefix}-${yy}` : prefix;
  const n = (d.meta.counters[key] ?? 0) + 1;
  d.meta.counters[key] = n;
  return `${key}-${String(n).padStart(width, "0")}`;
}

let rid = 0;
export function uid(prefix = "x") {
  rid += 1;
  return `${prefix}-${Date.now().toString(36)}-${rid.toString(36)}`;
}

// ---------- Side records ----------

export function audit(d: Draft<Db>, e: Omit<AuditEntry, "id" | "ts"> & { ts?: string }) {
  d.audit.unshift({ id: uid("aud"), ts: e.ts ?? stamp(d), ...e } as AuditEntry);
}

export function sendMessage(d: Draft<Db>, m: Omit<OutboxMessage, "id" | "ts"> & { ts?: string }) {
  d.outbox.unshift({ id: uid("msg"), ts: m.ts ?? stamp(d), ...m } as OutboxMessage);
}

export function notify(
  d: Draft<Db>,
  audience: { role?: RoleId; consultantId?: string; userId?: string },
  title: string,
  link?: string,
  body?: string,
) {
  d.inbox.unshift({ id: uid("inb"), ts: stamp(d), audience, title, link, body, read: false } as InboxItem);
}

/** Who is acting right now, for audit entries. */
export function actor(d: Draft<Db> | Db): string {
  const s = d.meta.session;
  if (s.kind === "staff") return s.userId;
  if (s.kind === "consultant") return s.consultantId;
  return "visitor";
}

// ---------- Snapshots ----------

export interface SnapshotInfo {
  id: string;
  name: string;
  savedAt: string; // real time
  demoDate: string;
  scenario: string;
}

export async function listSnapshots(): Promise<SnapshotInfo[]> {
  return ((await idbGet(SNAP_INDEX_KEY)) as SnapshotInfo[] | undefined) ?? [];
}

export async function saveSnapshot(name: string): Promise<SnapshotInfo> {
  const db = produce(getDb(), (d) => {
    d.meta.now = nowIso();
  });
  const info: SnapshotInfo = {
    id: uid("snap"),
    name,
    savedAt: new Date().toISOString(),
    demoDate: db.meta.now,
    scenario: db.meta.scenario,
  };
  await idbSet(`femmecare:snap:${info.id}`, db);
  const list = await listSnapshots();
  await idbSet(SNAP_INDEX_KEY, [info, ...list]);
  return info;
}

export async function restoreSnapshot(id: string) {
  const db = (await idbGet(`femmecare:snap:${id}`)) as Db | undefined;
  if (db) replaceDb(db);
}

export async function deleteSnapshot(id: string) {
  await idbDel(`femmecare:snap:${id}`);
  const list = await listSnapshots();
  await idbSet(
    SNAP_INDEX_KEY,
    list.filter((s) => s.id !== id),
  );
}

export function exportStateBlob(): Blob {
  const db = produce(getDb(), (d) => {
    d.meta.now = nowIso();
  });
  return new Blob([JSON.stringify(db)], { type: "application/json" });
}

export async function importStateFile(file: File) {
  const text = await file.text();
  const db = JSON.parse(text) as Db;
  if (!db || !db.meta || !Array.isArray(db.products)) throw new Error("This file is not a FemmeCare demo snapshot");
  replaceDb(db);
}
