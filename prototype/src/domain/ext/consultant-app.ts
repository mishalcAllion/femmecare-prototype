// Extra rules for the public website and the consultant app: finding an account
// by number or email, sign-in checks, password reset, and the month figures the
// consultant home and earnings pages show. Changes go through `mutate`.

import type { Draft } from "immer";
import type { CommissionSettings, Consultant, Db, PayoutLine } from "../types";
import { audit, mutate, nowIso, sendMessage } from "../db";
import { consultantByNumber, fullName } from "../consultants";
import { monthStatus, salesByConsultant as salesByConsultantSafe, statement } from "../commission";
import { consultantCode, date, monthKey, monthLabel, prevMonthKey, round2 } from "../format";
import type { Result } from "../actions";

type D = Draft<Db> | Db;

// ---------- words ----------

/** "Consultant" or "Agent" from settings, with the right article. */
export function labels(db: D) {
  const one = db.settings.labels.consultant;
  const lower = one.toLowerCase();
  const an = /^[aeiou]/i.test(one) ? "an" : "a";
  return { one, lower, many: `${one}s`, manyLower: `${lower}s`, a: `${an} ${lower}` };
}

// ---------- finding an account ----------

/** "FC00006", "fc6", "6" or "00006" -> 6. */
export function parseConsultantNumber(raw: string): number | undefined {
  const s = raw.trim().toUpperCase().replace(/\s/g, "");
  const m = /^(?:FC)?0*(\d{1,6})$/.exec(s);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n > 0 ? n : undefined;
}

export function findAccount(db: D, login: string): Consultant | undefined {
  const v = login.trim();
  if (!v) return undefined;
  if (v.includes("@")) {
    const list = db.consultants.filter((c) => c.email.toLowerCase() === v.toLowerCase());
    return list.find((c) => c.status !== "rejected") ?? list[list.length - 1];
  }
  const n = parseConsultantNumber(v);
  return n === undefined ? undefined : consultantByNumber(db, n);
}

export function lastStatusReason(c: Consultant): string | undefined {
  const h = [...c.statusHistory].reverse().find((x) => x.to === c.status);
  return h?.reason ?? (c.status === "rejected" ? c.rejectReason : undefined);
}

export type SignInCheck =
  | { ok: true; consultant: Consultant; blocked: boolean }
  | { ok: false; field?: "login" | "password"; error: string; notice?: { title: string; body: string; action?: "apply" | "call" } };

export function checkSignIn(db: D, login: string, password: string): SignInCheck {
  if (!login.trim()) return { ok: false, field: "login", error: `Enter your ${labels(db).lower} number or email` };
  if (!password) return { ok: false, field: "password", error: "Enter your password" };
  const c = findAccount(db, login);
  if (!c) return { ok: false, field: "login", error: "We can't find an account with that number or email" };
  if (c.password !== password) return { ok: false, field: "password", error: "That password isn't right. Try again, or reset it." };
  const phone = db.settings.company.phone;
  if (c.status === "pending")
    return {
      ok: false,
      error: "Your application is still being reviewed",
      notice: {
        title: "Your application is being reviewed",
        body: `We received application ${c.appRef} on ${date(c.appliedAt)}. You can sign in once it is approved: we will email and text you your ${labels(db).lower} number.`,
      },
    };
  if (c.status === "rejected")
    return {
      ok: false,
      error: "This application was not approved",
      notice: {
        title: "Your application was not approved",
        body: `${lastStatusReason(c) ? `Reason: ${lastStatusReason(c)}. ` : ""}You are welcome to apply again with updated details.`,
        action: "apply",
      },
    };
  if (c.status === "terminated")
    return {
      ok: false,
      error: "This account is closed",
      notice: {
        title: "This account is closed",
        body: `${lastStatusReason(c) ? `Reason: ${lastStatusReason(c)}. ` : ""}If you think this is a mistake, call FemmeCare on ${phone}.`,
        action: "call",
      },
    };
  return { ok: true, consultant: c, blocked: c.status === "suspended" };
}

// ---------- password reset ----------

const RESET_TYPE = "Password reset";
const RESET_MINUTES = 30;

export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  return `${user.slice(0, 1)}${"•".repeat(Math.max(2, user.length - 2))}${user.slice(-1)}@${domain}`;
}

/** Emails a reset link and code. The message lands in the Outbox. */
export function sendPasswordReset(login: string): Result<{ consultantId: string; to: string; code: string }> {
  try {
    const value = mutate(
      (d) => {
        const c = findAccount(d, login);
        if (!c) throw new Error("We can't find an account with that number or email");
        if (c.status === "rejected" || c.status === "terminated") throw new Error("This account can't be used to sign in. Call FemmeCare for help.");
        const code = String(100000 + Math.floor(Math.random() * 900000));
        const who = c.number ? consultantCode(c.number) : c.appRef;
        sendMessage(d, {
          channel: "email",
          to: c.email,
          toName: fullName(c),
          subject: "Reset your FemmeCare password",
          body: `Dear ${c.givenName},\n\nWe received a request to reset the password for ${who}.\n\nOpen this link to choose a new password:\nhttps://femmecare.lk/signin/reset?u=${c.number ?? ""}&code=${code}\n\nOr enter this code in the app: ${code}\n\nThe link and code work for ${RESET_MINUTES} minutes. If you didn't ask for this, you can ignore this email; your password stays the same.\n\nFemmeCare`,
          relatedType: RESET_TYPE,
          relatedId: c.id,
        });
        return { consultantId: c.id, to: maskEmail(c.email), code };
      },
      { silent: true },
    );
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function resetCodeValid(db: D, consultantId: string, code: string, now = nowIso()): boolean {
  const msg = db.outbox.find((m) => m.relatedType === RESET_TYPE && m.relatedId === consultantId);
  if (!msg) return false;
  if (Date.parse(now) - Date.parse(msg.ts) > RESET_MINUTES * 60_000) return false;
  const m = /enter this code in the app: (\d{6})/.exec(msg.body);
  return !!m && m[1] === code.replace(/\s/g, "");
}

export function passwordProblem(pw: string): string | undefined {
  if (pw.length < 8) return "Use at least 8 characters";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Use letters and at least one number";
}

export function setNewPassword(consultantId: string, code: string, password: string): Result<void> {
  try {
    mutate((d) => {
      const c = d.consultants.find((x) => x.id === consultantId);
      if (!c) throw new Error("Account not found");
      if (!resetCodeValid(d, consultantId, code)) throw new Error("This reset link has expired. Ask for a new one.");
      const p = passwordProblem(password);
      if (p) throw new Error(p);
      c.password = password;
      audit(d, { by: c.id, area: "Sign-in", action: `Password reset ${consultantCode(c.number)}`, entityId: c.id });
      sendMessage(d, {
        channel: "sms",
        to: c.mobile,
        toName: fullName(c),
        body: "FemmeCare: Your password was changed. If this wasn't you, call us on " + d.settings.company.phone + ".",
        relatedType: "Sign-in",
        relatedId: c.id,
      });
    });
    return { ok: true, value: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- month figures for the home and earnings pages ----------

export type MonthState = "Provisional" | "Approved" | "Paid" | "Held" | "Failed" | "No commission";

export interface MonthFigures {
  month: string;
  label: string;
  closed: boolean;
  ended: boolean;
  settings: CommissionSettings;
  ownSales: number;
  teamSales: number;
  thresholdBasis: number;
  qualifies: boolean;
  commissionable: number;
  amount: number;
  adjustments: number;
  payable: number;
  activeReferrals: number;
  teamSize: number;
  team: { consultant: Consultant; sales: number }[];
  why?: string;
  hold?: string;
  margin: number;
  payout?: PayoutLine;
  state: MonthState;
  stateNote?: string;
}

export function monthFigures(db: D, consultantId: string, month: string, now = nowIso()): MonthFigures {
  const st = statement(db, consultantId, month);
  const settings = st.settings;
  const line = st.line;
  const team = st.team;
  const ownSales = st.ownSales;
  const teamSales = line?.teamSales ?? round2(team.reduce((a, t) => a + t.sales, 0));
  const thresholdBasis = line?.thresholdBasis ?? (settings.thresholdCounts === "team_plus_own" ? teamSales + ownSales : teamSales);
  const activeReferrals = line?.activeReferrals ?? team.filter((t) => t.sales > 0).length;
  // pending adjustments are shown on the earliest open month only
  const prevClosed = db.commissionMonths.some((m) => m.id === prevMonthKey(month));
  const showAdj = st.closed || prevClosed || !db.commissionMonths.length;
  const adjustments = st.closed ? round2(st.adjustments.reduce((a, x) => a + x.amount, 0)) : showAdj ? line?.adjustments ?? 0 : 0;
  const amount = line?.amount ?? 0;
  const payable = st.closed ? line?.payable ?? 0 : round2(Math.max(0, amount + adjustments));
  const me = db.consultants.find((c) => c.id === consultantId);
  let why: string | undefined;
  if (!line?.qualifies) {
    if (!team.length) why = `Introduce people to your team to start earning ${settings.rate}% on their sales`;
    else if (me && me.status !== "active") why = `Your account is ${me.status}`;
    else if (thresholdBasis < settings.threshold) why = `${lkrPlain(settings.threshold - thresholdBasis)} more ${settings.thresholdCounts === "team_plus_own" ? "team or own" : "team"} sales needed this month`;
    else if (settings.referralTest.enabled && activeReferrals < settings.referralTest.min)
      why = `Needs ${settings.referralTest.min} team member${settings.referralTest.min > 1 ? "s" : ""} who ordered (has ${activeReferrals})`;
  }
  const ms = monthStatus(db, month);
  let state: MonthState = "Provisional";
  let stateNote: string | undefined;
  const ended = monthKey(now) > month;
  if (!st.closed) {
    stateNote = ended ? `${monthLabel(month)} has ended. FemmeCare is closing the month; the figures are final once approved.` : "Builds up as your team's orders are paid. Final after the month is closed.";
  } else if (payable <= 0) {
    state = "No commission";
  } else if (st.payout?.status === "held") {
    state = "Held";
    stateNote = st.payout.failReason ?? line?.hold;
  } else if (st.payout?.status === "failed") {
    state = "Failed";
    stateNote = st.payout.failReason;
  } else if (st.payout?.status === "paid") {
    state = "Paid";
  } else {
    state = "Approved";
    stateNote = ms === "payout_approved" ? "Payment approved, on its way to your bank" : "Approved at month-end close, waiting for the payout";
  }
  return {
    month,
    label: monthLabel(month),
    closed: st.closed,
    ended,
    settings,
    ownSales,
    teamSales,
    thresholdBasis,
    qualifies: !!line?.qualifies,
    commissionable: line?.commissionable ?? round2(teamSales + (settings.ownSalesEarn ? ownSales : 0)),
    amount,
    adjustments,
    payable,
    activeReferrals,
    teamSize: team.length,
    team,
    why,
    hold: line?.hold,
    margin: st.margin,
    payout: st.payout,
    state,
    stateNote,
  };
}

function lkrPlain(n: number) {
  return `LKR ${(Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Months with any of this consultant's activity, newest first, up to `limit`. */
export function activeMonths(db: D, consultantId: string, now = nowIso(), limit = 12): string[] {
  const c = db.consultants.find((x) => x.id === consultantId);
  const start = monthKey(c?.joinedAt ?? c?.appliedAt ?? now);
  const out: string[] = [];
  let m = monthKey(now);
  while (m >= start && out.length < limit) {
    out.push(m);
    m = prevMonthKey(m);
  }
  return out;
}

/** Commission payments to this consultant, newest first. */
export function paymentHistory(db: D, consultantId: string) {
  return db.payoutBatches
    .flatMap((b) =>
      b.lines
        .filter((l) => l.consultantId === consultantId)
        .map((l) => ({
          batchId: b.id,
          month: l.carriedFrom && l.carriedFrom !== "moved" ? l.carriedFrom : b.month,
          paidWith: b.month,
          amount: l.amount,
          status: l.status,
          bankRef: l.bankRef,
          failReason: l.failReason,
          when: b.resultsAt ?? b.approvedAt ?? b.createdAt,
          carried: !!l.carriedFrom && l.carriedFrom !== "moved",
        })),
    )
    .sort((a, b) => b.when.localeCompare(a.when));
}

/** Monthly own and team sales for a small trend chart, oldest first. */
export function salesTrend(db: D, consultantId: string, months: string[]) {
  return [...months].reverse().map((m) => {
    const closed = db.commissionMonths.find((x) => x.id === m);
    const settings = closed?.settingsUsed ?? db.settings.commission;
    const sales = salesByConsultantSafe(db, m, settings);
    const team = db.consultants.filter((c) => c.sponsorId === consultantId && c.number !== undefined);
    return {
      month: m,
      label: monthLabel(m, false).split(" ")[0],
      own: round2(sales.get(consultantId) ?? 0),
      team: round2(team.reduce((a, c) => a + (sales.get(c.id) ?? 0), 0)),
    };
  });
}
