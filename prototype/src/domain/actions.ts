// The one place screens change data. Each action runs a business rule inside
// `mutate`, so the change is saved, audited and shown on every open screen.
// Errors thrown by a rule come back to the caller as plain messages.

import { mutate, getDb, nowIso, replaceDb, setClock } from "./db";
import * as stock from "./stock";
import * as outlets from "./outlets";
import * as cons from "./consultants";
import * as com from "./commission";
import { generate } from "./seed/generate";
import type { BankDetails, Channel, ConsultantStatus, Db, Outlet, PaymentMethod, ScenarioId, Settings } from "./types";
import type { Draft } from "immer";
import { addDays, addMinutes, dayKey, lastDayOfMonth, lkIso, monthKey } from "./format";
import { audit, actor, sendMessage } from "./db";

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };

function run<T>(fn: (d: Draft<Db>) => T): Result<T> {
  try {
    return { ok: true, value: mutate(fn) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const actions = {
  // ---------- session and demo ----------
  signInStaff: (userId: string) =>
    run((d) => {
      const u = d.users.find((x) => x.id === userId);
      if (!u || u.status !== "active") throw new Error("This account is not active");
      u.lastSignIn = nowIso();
      d.meta.session = { kind: "staff", userId };
      audit(d, { by: userId, area: "Sign-in", action: "Signed in to the staff console" });
    }),
  signInConsultant: (consultantId: string) =>
    run((d) => {
      d.meta.session = { kind: "consultant", consultantId };
      audit(d, { by: consultantId, area: "Sign-in", action: "Signed in to the app" });
    }),
  signOut: () =>
    run((d) => {
      d.meta.session = { kind: "visitor" };
    }),
  loadScenario: (s: ScenarioId) => {
    const db = generate(s);
    const keep = getDb().meta;
    db.meta.presenterMode = keep.presenterMode;
    db.meta.phaseLens = keep.phaseLens;
    replaceDb(db, { markChanged: false });
  },
  setClockTo: (iso: string) =>
    run((d) => {
      const before = d.meta.now;
      setClock(d, iso);
      if (monthKey(iso) > monthKey(before)) com.notifyMonthEnd(d, monthKey(before));
    }),
  advanceDays: (n: number) => actions.setClockTo(addDays(nowIso(), n)),
  jumpToMonthEnd: () => {
    const m = monthKey(nowIso());
    return actions.setClockTo(lkIso(lastDayOfMonth(m), "18:00"));
  },
  setPresenterMode: (on: boolean) => run((d) => void (d.meta.presenterMode = on)),
  setPhaseLens: (v: "first_release" | "everything") => run((d) => void (d.meta.phaseLens = v)),
  forceNextCardFailure: () => run((d) => void (d.meta.forceNextCardFailure = true)),
  markInboxRead: (ids: string[]) =>
    run((d) => {
      for (const i of d.inbox) if (ids.includes(i.id)) i.read = true;
    }, ),

  // ---------- settings ----------
  updateSettings: (recipe: (s: Draft<Settings>) => void, what: string) =>
    run((d) => {
      const before = JSON.stringify(d.settings);
      recipe(d.settings);
      const after = JSON.stringify(d.settings);
      if (before !== after) audit(d, { by: actor(d), area: "Settings", action: `Setting changed: ${what}` , before: diffText(before, after, "before"), after: diffText(before, after, "after") });
    }),
  updateProduct: (id: string, patch: Partial<Db["products"][number]>) =>
    run((d) => {
      const p = d.products.find((x) => x.id === id);
      if (!p) throw new Error("Product not found");
      const before = `MRP ${p.mrp}, trade ${p.tradePrice}, status ${p.status}`;
      if (patch.mrp !== undefined && patch.mrp !== p.mrp) p.priceHistory.push({ from: nowIso(), mrp: patch.mrp, by: actor(d) });
      Object.assign(p, patch);
      audit(d, { by: actor(d), area: "Products", action: `Product updated ${id}`, entityId: id, before, after: `MRP ${p.mrp}, trade ${p.tradePrice}, status ${p.status}` });
    }),
  createProduct: (p: Omit<Db["products"][number], "priceHistory" | "createdAt">) =>
    run((d) => {
      if (d.products.some((x) => x.id === p.id)) throw new Error(`Item code ${p.id} is already used`);
      if (p.barcode && d.products.some((x) => x.barcode === p.barcode)) throw new Error("That barcode belongs to another product");
      d.products.push({ ...p, createdAt: nowIso(), priceHistory: [{ from: nowIso(), mrp: p.mrp, by: actor(d) }] });
      audit(d, { by: actor(d), area: "Products", action: `Product added ${p.id}`, entityId: p.id, after: `${p.name}, MRP ${p.mrp}` });
    }),
  saveUser: (u: Db["users"][number]) =>
    run((d) => {
      const i = d.users.findIndex((x) => x.id === u.id);
      if (i >= 0) {
        const wasAdmin = d.users[i].roles.includes("admin") && d.users[i].status === "active";
        const otherAdmins = d.users.filter((x) => x.id !== u.id && x.roles.includes("admin") && x.status === "active").length;
        if (wasAdmin && (!u.roles.includes("admin") || u.status !== "active") && otherAdmins === 0)
          throw new Error("At least one active Administrator is needed");
        d.users[i] = u;
        audit(d, { by: actor(d), area: "Users", action: `User updated ${u.name}`, entityId: u.id, after: `${u.roles.join(", ")}; ${u.status}` });
      } else {
        if (d.users.some((x) => x.email.toLowerCase() === u.email.toLowerCase())) throw new Error("A user with this email exists");
        d.users.push(u);
        audit(d, { by: actor(d), area: "Users", action: `User invited ${u.name}`, entityId: u.id, after: u.roles.join(", ") });
        sendMessage(d, { channel: "email", to: u.email, toName: u.name, subject: "You're invited to the FemmeCare staff console", body: `Hello ${u.name},\n\nYou have been given access to the FemmeCare staff console. Sign in at femmecare.lk/staff with this email address; we will send a one-time code each time.\n\nFemmeCare` });
      }
    }),

  // ---------- stock ----------
  recordGrn: (input: Parameters<typeof stock.recordGrn>[1]) =>
    run((d) => {
      const g = stock.recordGrn(d, input);
      outlets.alertWaitingOutlets(d, g.productId);
      return g.id;
    }),
  requestTransfer: (input: Parameters<typeof stock.requestTransfer>[1]) => run((d) => stock.requestTransfer(d, input).id),
  decideTransfer: (id: string, approve: boolean, reason?: string) => run((d) => stock.decideTransfer(d, id, approve, reason)),
  startCount: (productIds?: string[]) => run((d) => stock.startCount(d, productIds).id),
  setCounted: (countId: string, idx: number, value: number | undefined, recount: boolean) =>
    run((d) => {
      const c = d.counts.find((x) => x.id === countId);
      if (!c) return;
      if (recount) c.lines[idx].recounted = value;
      else c.lines[idx].counted = value;
    }),
  scanCount: (countId: string, code: string, recount: boolean) =>
    run((d) => {
      const c = d.counts.find((x) => x.id === countId);
      const p = d.products.find((x) => x.barcode === code.trim() || x.id.toLowerCase() === code.trim().toLowerCase());
      if (!c || !p) throw new Error(`Barcode ${code} is not a FemmeCare product`);
      const line = c.lines.find((l) => l.productId === p.id && (recount ? (l.recounted ?? 0) < l.systemQty * 2 : true));
      if (!line) throw new Error(`${p.name} is not in this count`);
      if (recount) line.recounted = (line.recounted ?? 0) + 1;
      else line.counted = (line.counted ?? 0) + 1;
      return p.name;
    }),
  submitCount: (id: string) => run((d) => stock.submitCount(d, id)),
  decideCount: (id: string, approve: boolean, note?: string) => run((d) => stock.decideCount(d, id, approve, note)),
  adjust: (input: Parameters<typeof stock.adjust>[1]) => run((d) => stock.adjust(d, input).id),

  // ---------- outlets ----------
  createOutlet: (o: Omit<Outlet, "id" | "since" | "status">) => run((d) => outlets.createOutlet(d, o).id),
  updateOutlet: (id: string, patch: Partial<Outlet>) => run((d) => outlets.updateOutlet(d, id, patch)),
  createOutletOrder: (input: outlets.NewOutletOrder) => run((d) => outlets.createOutletOrder(d, input).id),
  setExpectedDate: (orderId: string, productId: string, iso: string, email: boolean) =>
    run((d) => outlets.setExpectedDate(d, orderId, productId, iso, email)),
  allocateBackorder: (orderId: string, productId: string) => run((d) => outlets.allocateBackorder(d, orderId, productId)),
  declineBackorder: (orderId: string, productId: string, reason: string) => run((d) => outlets.declineBackorder(d, orderId, productId, reason)),
  cancelOutletOrder: (orderId: string, reason: string) => run((d) => outlets.cancelOutletOrder(d, orderId, reason)),
  confirmOutletOrder: (orderId: string) => run((d) => outlets.confirmOutletOrder(d, orderId)),
  holdOutletOrder: (orderId: string, reason: string) => run((d) => outlets.holdOutletOrder(d, orderId, reason)),
  releaseOutletOrder: (orderId: string) => run((d) => outlets.releaseOutletOrder(d, orderId)),
  failDelivery: (dispatchId: string, reason: string) => run((d) => outlets.failDelivery(d, dispatchId, reason)),
  returnToStock: (dispatchId: string) => run((d) => outlets.returnToStock(d, dispatchId)),
  createOutletDispatch: (orderId: string) =>
    run((d) => {
      const x = outlets.createOutletDispatch(d, orderId);
      if (!x) throw new Error("Nothing on this order is allocated and waiting to be picked");
      return x.id;
    }),
  scan: (dispatchId: string, code: string) => run((d) => outlets.scanItem(d, dispatchId, code)),
  packAll: (dispatchId: string) => run((d) => outlets.packAll(d, dispatchId)),
  issueInvoice: (dispatchId: string) => run((d) => outlets.issueInvoice(d, dispatchId).id),
  dispatchOutlet: (dispatchId: string, vehicle: string, driver: string) =>
    run((d) => outlets.dispatchOutletDelivery(d, dispatchId, vehicle, driver)),
  readSignedNote: (dispatchId: string, doc: string) => run((d) => outlets.readSignedNote(d, dispatchId, doc)),
  confirmDelivery: (dispatchId: string, qty: Record<string, number>, note?: string, receivedBy?: string) =>
    run((d) => outlets.confirmDelivery(d, dispatchId, qty, note, receivedBy)),
  recordOutletPayment: (input: Parameters<typeof outlets.recordOutletPayment>[1]) => run((d) => outlets.recordOutletPayment(d, input).id),
  cancelInvoice: (id: string, reason: string) => run((d) => outlets.cancelInvoice(d, id, reason)),

  // ---------- consultants ----------
  submitApplication: (a: cons.Application) => run((d) => cons.submitApplication(d, a).id),
  approveApplication: (id: string) => run((d) => cons.approveApplication(d, id)),
  rejectApplication: (id: string, reason: string) => run((d) => cons.rejectApplication(d, id, reason)),
  changeStatus: (id: string, to: ConsultantStatus, reason: string, teamMoveTo?: "sponsor" | "no1") =>
    run((d) => cons.changeStatus(d, id, to, reason, teamMoveTo)),
  changeSponsor: (id: string, sponsorId: string, reason: string) => run((d) => cons.changeSponsor(d, id, sponsorId, reason)),
  updateContact: (id: string, patch: Parameters<typeof cons.updateContact>[2]) => run((d) => cons.updateContact(d, id, patch)),
  requestBankChange: (id: string, bank: BankDetails) => run((d) => cons.requestBankChange(d, id, bank)),
  decideBankChange: (id: string, approve: boolean, reason?: string) => run((d) => cons.decideBankChange(d, id, approve, reason)),
  verifyExistingBank: (id: string) => run((d) => cons.verifyExistingBank(d, id)),
  placeOrder: (input: { consultantId: string; lines: { productId: string; qty: number }[]; address: string; city: string; method: PaymentMethod }) =>
    run((d) => cons.placeOrder(d, input).id),
  payByCard: (orderId: string, last4: string) => run((d) => cons.payByCard(d, orderId, { last4 })),
  uploadProof: (orderId: string, input: { amount: number; reference: string; proofImage: string }) => run((d) => cons.uploadProof(d, orderId, input)),
  decidePayment: (orderId: string, attemptId: string, approve: boolean, reason?: string) =>
    run((d) => cons.decidePayment(d, orderId, attemptId, approve, reason)),
  createConsultantDispatch: (orderId: string) =>
    run((d) => {
      const x = cons.createConsultantDispatch(d, orderId);
      if (!x) throw new Error("Could not create the pick list");
      return x.id;
    }),
  handToCourier: (dispatchId: string, courier: string, trackingNo: string) => run((d) => cons.handToCourier(d, dispatchId, courier, trackingNo)),
  markDelivered: (orderId: string, by: "staff" | "consultant") => run((d) => cons.markConsultantDelivered(d, orderId, by)),
  cancelConsultantOrder: (orderId: string, reason: string) => run((d) => cons.cancelConsultantOrder(d, orderId, reason)),
  requestRefund: (orderId: string, reason: string, restock: boolean) => run((d) => cons.requestRefund(d, orderId, reason, restock)),
  decideRefund: (orderId: string, approve: boolean, note?: string) => run((d) => cons.decideRefund(d, orderId, approve, note)),

  // ---------- commission ----------
  closeMonth: (month: string) => run((d) => com.closeMonth(d, month, nowIso()).id),
  approvePayout: (batchId: string) => run((d) => com.approvePayout(d, batchId)),
  markFileGenerated: (batchId: string) => run((d) => com.markFileGenerated(d, batchId)),
  recordResults: (batchId: string, failIds: string[], reason?: string) => run((d) => com.recordResults(d, batchId, failIds, reason)),
};

function diffText(before: string, after: string, side: "before" | "after"): string {
  const a = flatten(JSON.parse(before));
  const b = flatten(JSON.parse(after));
  const keys = Object.keys({ ...a, ...b }).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  const src = side === "before" ? a : b;
  return keys.map((k) => `${k}: ${String(src[k])}`).join("; ");
}

function flatten(o: unknown, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (o && typeof o === "object" && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o)) Object.assign(out, flatten(v, prefix ? `${prefix}.${k}` : k));
  } else out[prefix] = Array.isArray(o) ? o.join(", ") : o;
  return out;
}

// ---------- simulated outside events (demo panel) ----------

export const simulate = {
  courierDelivers: (): Result<string> =>
    run((d) => {
      const o = d.consultantOrders.find((x) => x.deliveryStatus === "dispatched");
      if (!o) throw new Error("No consultant order is out with a courier right now");
      cons.markConsultantDelivered(d, o.id, "courier");
      return `${o.id} delivered`;
    }),
  bankReturnsResults: (): Result<string> =>
    run((d) => {
      const b = d.payoutBatches.find((x) => x.status === "file_generated");
      if (!b) throw new Error("No bank file is waiting for results. Approve a payout batch and create its bank file first");
      const pending = b.lines.filter((l) => l.status === "pending");
      const fail = pending.length > 1 ? [pending[pending.length - 1].consultantId] : [];
      com.recordResults(d, b.id, fail, "Account number not valid at the bank");
      return `${pending.length - fail.length} paid, ${fail.length} failed`;
    }),
  newApplication: (): Result<string> =>
    run((d) => {
      const sponsor = d.consultants.filter((c) => c.status === "active" && (c.number ?? 0) > 1).sort((a, b) => (a.number ?? 0) - (b.number ?? 0))[1];
      const n = d.consultants.length + 1;
      const names = [["Sewwandi", "Rathnayake"], ["Oshadi", "Kodikara"], ["Hiruni", "Wijesekara"], ["Malki", "Abeyratne"], ["Senuri", "Nanayakkara"]];
      const [g, s] = names[n % names.length];
      const c = cons.submitApplication(d, {
        title: "Ms",
        givenName: g,
        surname: s,
        nic: `1998${String(600 + (n % 300)).padStart(3, "0")}${String(1000 + n).slice(-4)}${n % 10}`,
        dob: "",
        address: `No. ${10 + n}, Temple Road`,
        city: "Gampaha",
        postalCode: "11000",
        mobile: `077${String(4000000 + n * 97).slice(-7)}`,
        email: `${g}.${s}${n}@gmail.com`.toLowerCase(),
        bank: { accountName: `${g} ${s}`, accountNumber: `8001${String(n).padStart(8, "0")}`, bank: "Sampath Bank", branch: "Gampaha" },
        sponsorNumber: sponsor?.number,
        joinedVia: "link",
        consentShareWithSponsor: true,
        acceptedTerms: true,
        password: "femmecare",
      });
      return `${c.givenName} ${c.surname} applied through ${sponsor ? cons.fullName(sponsor) : "FemmeCare"}'s link`;
    }),
  nextCardFails: (): Result<string> =>
    run((d) => {
      d.meta.forceNextCardFailure = true;
      return "The next card payment will be declined";
    }),
  productionSendsStock: (): Result<string> =>
    run((d) => {
      const waiting = d.outletOrders.flatMap((o) => o.lines.filter((l) => l.backordered > 0).map((l) => l.productId));
      const productId = waiting[0] ?? "FC001";
      const now = nowIso();
      const g = stock.expectGrn(d, { productId, qty: 1500, mfgDate: dayKey(addDays(now, -8)), expiryDate: dayKey(addDays(now, 730)), productionRef: `PRD-${1200 + d.grns.length}` });
      return `${g.qty} × ${productId} arrived; ${g.id} is waiting for Stores`;
    }),
  signedNoteWithDifference: (): Result<string> =>
    run((d) => {
      const x = d.dispatches.find((y) => y.channel === "outlet" && y.status === "dispatched" && !y.pod);
      if (!x) throw new Error("No outlet delivery is waiting for its signed note");
      outlets.readSignedNote(d, x.id, "pod-difference");
      return `Signed note for ${x.id} received, with a difference to confirm`;
    }),
};

export type { Channel };
export { addMinutes };
