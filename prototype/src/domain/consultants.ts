// Consultant channel: sign-up with a sponsor, approval, status, sponsor changes,
// bank details, ordering, payments, courier dispatch, cancellations and refunds.

import type { Draft } from "immer";
import type {
  BankDetails,
  Consultant,
  ConsultantOrder,
  ConsultantStatus,
  Db,
  Dispatch,
  PaymentMethod,
} from "./types";
import { actor, audit, nextId, notify, sendMessage, stamp } from "./db";
import { consultantCode, date, lkr, round2, salesMonth } from "./format";
import { available, issue, pickPlan, release, reserve } from "./stock";

type D = Draft<Db> | Db;

export const STATUS_LABEL: Record<ConsultantStatus, string> = {
  pending: "Pending",
  active: "Active",
  suspended: "Suspended",
  terminated: "Terminated",
  rejected: "Rejected",
};

export function fullName(c: Pick<Consultant, "givenName" | "surname">) {
  return `${c.givenName} ${c.surname}`.trim();
}

export function consultantById(db: D, id?: string) {
  return id ? db.consultants.find((c) => c.id === id) : undefined;
}

export function consultantByNumber(db: D, n: number) {
  return db.consultants.find((c) => c.number === n);
}

export function label(db: D) {
  return db.settings.labels.consultant;
}

/** A sponsor's direct team: approved members, leaving out anyone terminated or rejected. */
export function directTeam(db: D, sponsorId: string) {
  return db.consultants.filter((c) => c.sponsorId === sponsorId && c.number !== undefined && c.status !== "terminated" && c.status !== "rejected");
}

export function isDownline(db: D, ancestorId: string, id: string): boolean {
  let cur = consultantById(db, id);
  let guard = 0;
  while (cur?.sponsorId && guard++ < 50) {
    if (cur.sponsorId === ancestorId) return true;
    cur = consultantById(db, cur.sponsorId);
  }
  return false;
}

// ---------- NIC ----------

/** Sri Lankan NIC: old 9 digits + V/X, or new 12 digits. Returns date of birth if valid. */
export function parseNic(raw: string): { valid: boolean; dob?: string; message?: string } {
  const nic = raw.trim().toUpperCase();
  let year: number;
  let day: number;
  if (/^\d{9}[VX]$/.test(nic)) {
    year = 1900 + Number(nic.slice(0, 2));
    day = Number(nic.slice(2, 5));
  } else if (/^\d{12}$/.test(nic)) {
    year = Number(nic.slice(0, 4));
    day = Number(nic.slice(4, 7));
  } else {
    return { valid: false, message: "Use the old format (9 digits and V or X) or the new 12-digit format" };
  }
  if (day > 500) day -= 500;
  if (day < 1 || day > 366) return { valid: false, message: "This NIC number is not valid" };
  // NIC day numbers count February as 29 days in every year
  const monthDays = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let m = 0;
  while (m < 12 && day > monthDays[m]) {
    day -= monthDays[m];
    m += 1;
  }
  const dob = `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { valid: true, dob };
}

export function validMobile(m: string) {
  return /^(?:\+94|0)7\d{8}$/.test(m.replace(/\s/g, ""));
}

// ---------- Applications ----------

export interface Application {
  title: string;
  givenName: string;
  surname: string;
  nic: string;
  dob: string;
  address: string;
  city: string;
  postalCode: string;
  mobile: string;
  email: string;
  officePhone?: string;
  homePhone?: string;
  bank: BankDetails;
  sponsorNumber?: number;
  joinedVia: "link" | "number" | "none";
  consentShareWithSponsor: boolean;
  acceptedTerms: boolean;
  password: string;
}

export function sponsorCheck(db: D, n?: number): { ok: boolean; sponsor?: Consultant; message?: string } {
  if (n === undefined || Number.isNaN(n)) return { ok: true, sponsor: consultantByNumber(db, 1) };
  const s = consultantByNumber(db, n);
  if (!s) return { ok: false, message: `There is no ${label(db).toLowerCase()} number ${consultantCode(n)}` };
  if (s.status !== "active") return { ok: false, message: `${consultantCode(n)} can't sponsor new ${label(db).toLowerCase()}s at the moment` };
  return { ok: true, sponsor: s };
}

export function duplicateCheck(db: D, a: { nic?: string; mobile?: string; email?: string }, exceptId?: string) {
  const others = db.consultants.filter((c) => c.id !== exceptId && c.status !== "rejected");
  const norm = (s?: string) => (s ?? "").replace(/\s/g, "").toLowerCase();
  if (a.nic && others.some((c) => norm(c.nic) === norm(a.nic))) return "This NIC number is already registered. Please contact FemmeCare.";
  if (a.mobile && others.some((c) => norm(c.mobile) === norm(a.mobile))) return "This mobile number is already registered.";
  if (a.email && others.some((c) => norm(c.email) === norm(a.email))) return "This email address is already registered.";
}

export function submitApplication(d: Draft<Db>, a: Application): Draft<Consultant> {
  const nic = parseNic(a.nic);
  if (!nic.valid) throw new Error(nic.message);
  const dup = duplicateCheck(d, a);
  if (dup) throw new Error(dup);
  const sp = sponsorCheck(d, a.sponsorNumber);
  if (!sp.ok || !sp.sponsor) throw new Error(sp.message);
  if (!a.acceptedTerms) throw new Error("Please accept the terms, benefit plan and policy manual");
  const ts = stamp(d);
  const c: Consultant = {
    id: `c-${String(d.consultants.length + 1).padStart(4, "0")}`,
    appRef: nextId(d, "APP", 4),
    title: a.title,
    givenName: a.givenName.trim(),
    surname: a.surname.trim(),
    nic: a.nic.trim().toUpperCase(),
    dob: a.dob || nic.dob || "",
    address: a.address,
    city: a.city,
    postalCode: a.postalCode,
    mobile: a.mobile,
    email: a.email.trim().toLowerCase(),
    officePhone: a.officePhone,
    homePhone: a.homePhone,
    bank: a.bank,
    bankVerified: false,
    sponsorId: sp.sponsor.id,
    status: "pending",
    appliedAt: ts,
    joinedVia: a.joinedVia,
    consentShareWithSponsor: a.consentShareWithSponsor,
    statusHistory: [{ ts, to: "pending", by: "applicant" }],
    avatarHue: (d.consultants.length * 47) % 360,
    password: a.password,
  };
  d.consultants.push(c);
  notify(d, { role: "admin" }, `New application ${c.appRef}: ${fullName(c)}`, `/staff/applications/${c.id}`);
  sendMessage(d, {
    channel: "email",
    to: c.email,
    toName: fullName(c),
    subject: "We received your FemmeCare application",
    body: `Dear ${c.givenName},\n\nThank you for applying to become a FemmeCare ${label(d).toLowerCase()}. Your reference is ${c.appRef}. We will review your details and let you know within two working days.\n\nFemmeCare`,
    relatedType: "Application",
    relatedId: c.id,
  });
  audit(d, { by: "applicant", area: label(d) + "s", action: `Application received ${c.appRef}`, entityId: c.id, after: `${fullName(c)}, sponsor ${consultantCode(sp.sponsor.number)}` });
  return d.consultants[d.consultants.length - 1];
}

export function approveApplication(d: Draft<Db>, id: string) {
  const c = d.consultants.find((x) => x.id === id);
  if (!c || c.status !== "pending") return;
  const sponsor = consultantById(d, c.sponsorId);
  if (sponsor && sponsor.status !== "active")
    throw new Error(`The sponsor ${fullName(sponsor)} is ${STATUS_LABEL[sponsor.status].toLowerCase()}. Change the sponsor before approving.`);
  const next = Math.max(...d.consultants.map((x) => x.number ?? 0)) + 1;
  const ts = stamp(d);
  c.number = next;
  c.status = "active";
  c.joinedAt = ts;
  c.statusHistory.push({ ts, from: "pending", to: "active", by: actor(d) });
  sendMessage(d, {
    channel: "email",
    to: c.email,
    toName: fullName(c),
    subject: `Welcome to FemmeCare, ${c.givenName}`,
    body: `Dear ${c.givenName},\n\nYour application is approved. Your ${label(d).toLowerCase()} number is ${consultantCode(next)}.\n\nSign in at femmecare.lk/app with your number or email and the password you chose.\n\nWelcome to the FemmeCare family.`,
    relatedType: label(d),
    relatedId: c.id,
  });
  sendMessage(d, {
    channel: "sms",
    to: c.mobile,
    toName: fullName(c),
    body: `FemmeCare: Welcome! Your ${label(d).toLowerCase()} number is ${consultantCode(next)}. Sign in at femmecare.lk/app`,
    relatedType: label(d),
    relatedId: c.id,
  });
  if (sponsor) {
    notify(d, { consultantId: sponsor.id }, `${fullName(c)} joined your team`, "/app/team");
  }
  audit(d, { by: actor(d), area: label(d) + "s", action: `Application approved ${c.appRef}`, entityId: c.id, after: `${consultantCode(next)} issued` });
}

export function rejectApplication(d: Draft<Db>, id: string, reason: string) {
  const c = d.consultants.find((x) => x.id === id);
  if (!c || c.status !== "pending") return;
  if (!reason.trim()) throw new Error("A reason is required");
  c.status = "rejected";
  c.rejectReason = reason;
  c.statusHistory.push({ ts: stamp(d), from: "pending", to: "rejected", by: actor(d), reason });
  sendMessage(d, {
    channel: "email",
    to: c.email,
    toName: fullName(c),
    subject: "Your FemmeCare application",
    body: `Dear ${c.givenName},\n\nWe could not approve your application ${c.appRef}: ${reason}\n\nYou are welcome to apply again.\n\nFemmeCare`,
    relatedType: "Application",
    relatedId: c.id,
  });
  audit(d, { by: actor(d), area: label(d) + "s", action: `Application rejected ${c.appRef}`, entityId: c.id, reason });
}

const ALLOWED: Record<ConsultantStatus, ConsultantStatus[]> = {
  pending: [],
  active: ["suspended", "terminated"],
  suspended: ["active", "terminated"],
  terminated: [],
  rejected: [],
};

export function allowedStatusChanges(s: ConsultantStatus) {
  return ALLOWED[s];
}

export function changeStatus(
  d: Draft<Db>,
  id: string,
  to: ConsultantStatus,
  reason: string,
  teamMoveTo?: "sponsor" | "no1",
) {
  const c = d.consultants.find((x) => x.id === id);
  if (!c) return;
  if (!ALLOWED[c.status].includes(to)) throw new Error(`Can't change from ${STATUS_LABEL[c.status]} to ${STATUS_LABEL[to]}`);
  if (!reason.trim()) throw new Error("A reason is required");
  if (c.number === 1) throw new Error("FemmeCare's own account can't change status");
  const from = c.status;
  c.status = to;
  c.statusHistory.push({ ts: stamp(d), from, to, by: actor(d), reason });
  audit(d, { by: actor(d), area: label(d) + "s", action: `Status changed ${consultantCode(c.number)}`, entityId: c.id, before: STATUS_LABEL[from], after: STATUS_LABEL[to], reason });
  if (to === "terminated") {
    const newSponsor = teamMoveTo === "no1" ? consultantByNumber(d, 1) : consultantById(d, c.sponsorId);
    for (const m of d.consultants.filter((x) => x.sponsorId === c.id)) {
      m.sponsorId = newSponsor?.id;
      audit(d, { by: actor(d), area: label(d) + "s", action: `Sponsor changed ${consultantCode(m.number)}`, entityId: m.id, before: consultantCode(c.number), after: consultantCode(newSponsor?.number), reason: `${fullName(c)} terminated` });
    }
  }
  sendMessage(d, {
    channel: "email",
    to: c.email,
    toName: fullName(c),
    subject: `Your FemmeCare account is now ${STATUS_LABEL[to].toLowerCase()}`,
    body: `Dear ${c.givenName},\n\nYour account status changed to ${STATUS_LABEL[to]}. Reason: ${reason}\n\nFemmeCare`,
    relatedType: label(d),
    relatedId: c.id,
  });
}

export function changeSponsor(d: Draft<Db>, id: string, newSponsorId: string, reason: string) {
  const c = d.consultants.find((x) => x.id === id);
  const s = d.consultants.find((x) => x.id === newSponsorId);
  if (!c || !s) return;
  if (!reason.trim()) throw new Error("A reason is required");
  if (c.id === s.id) throw new Error("A consultant can't sponsor themselves");
  if (isDownline(d, c.id, s.id)) throw new Error(`${fullName(s)} is in ${fullName(c)}'s own team`);
  if (s.status !== "active") throw new Error(`${fullName(s)} is not active`);
  const before = consultantById(d, c.sponsorId);
  c.sponsorId = s.id;
  audit(d, { by: actor(d), area: label(d) + "s", action: `Sponsor changed ${consultantCode(c.number)}`, entityId: c.id, before: before ? `${consultantCode(before.number)} ${fullName(before)}` : "none", after: `${consultantCode(s.number)} ${fullName(s)}`, reason });
}

export function updateContact(d: Draft<Db>, id: string, patch: Partial<Pick<Consultant, "mobile" | "email" | "officePhone" | "homePhone" | "address" | "city" | "postalCode">>) {
  const c = d.consultants.find((x) => x.id === id);
  if (!c) return;
  if (patch.mobile && !validMobile(patch.mobile)) throw new Error("Enter a mobile number like 077 123 4567");
  const dup = duplicateCheck(d, { mobile: patch.mobile, email: patch.email }, id);
  if (dup) throw new Error(dup);
  const before = JSON.stringify({ mobile: c.mobile, email: c.email, address: c.address });
  Object.assign(c, patch);
  audit(d, { by: actor(d), area: label(d) + "s", action: `Contact details updated ${consultantCode(c.number)}`, entityId: id, before, after: JSON.stringify({ mobile: c.mobile, email: c.email, address: c.address }) });
}

export function requestBankChange(d: Draft<Db>, id: string, bank: BankDetails) {
  const c = d.consultants.find((x) => x.id === id);
  if (!c) return;
  if (!bank.accountNumber.trim() || !bank.bank.trim()) throw new Error("Enter the bank and account number");
  c.pendingBank = { ...bank, requestedAt: stamp(d) };
  notify(d, { role: "finance" }, `Bank details to verify: ${fullName(c)}`, "/staff/bank-details");
  audit(d, { by: actor(d), area: label(d) + "s", action: `Bank change requested ${consultantCode(c.number)}`, entityId: id, after: `${bank.bank}, account ending ${bank.accountNumber.slice(-4)}` });
}

export function decideBankChange(d: Draft<Db>, id: string, approve: boolean, reason?: string) {
  const c = d.consultants.find((x) => x.id === id);
  if (!c?.pendingBank) return;
  const { requestedAt: _r, ...bank } = c.pendingBank;
  void _r;
  if (approve) {
    c.bank = bank;
    c.bankVerified = true;
  }
  c.pendingBank = undefined;
  audit(d, { by: actor(d), area: label(d) + "s", action: `Bank details ${approve ? "verified" : "rejected"} ${consultantCode(c.number)}`, entityId: id, reason });
  notify(d, { consultantId: c.id }, approve ? "Your new bank details are verified" : `Your bank details were not accepted: ${reason}`, "/app/profile");
}

export function verifyExistingBank(d: Draft<Db>, id: string) {
  const c = d.consultants.find((x) => x.id === id);
  if (!c) return;
  c.bankVerified = true;
  audit(d, { by: actor(d), area: label(d) + "s", action: `Bank details verified ${consultantCode(c.number)}`, entityId: id });
}

// ---------- Prices ----------

export function consultantPrice(db: D, mrp: number) {
  const { method, rate } = db.settings.pricing;
  return round2(method === "discount" ? mrp * (1 - rate / 100) : mrp / (1 + rate / 100));
}

export function deliveryCharge(db: D, subtotal: number) {
  const { flatCharge, freeOver } = db.settings.delivery;
  return subtotal >= freeOver ? 0 : flatCharge;
}

export function inStock(db: D, productId: string) {
  return available(db, productId, "consultant") > 0;
}

// ---------- Orders ----------

export function placeOrder(
  d: Draft<Db>,
  input: { consultantId: string; lines: { productId: string; qty: number }[]; address: string; city: string; method: PaymentMethod },
): Draft<ConsultantOrder> {
  const c = d.consultants.find((x) => x.id === input.consultantId);
  if (!c || c.status !== "active") throw new Error("Only active accounts can place orders");
  const lines = input.lines.filter((l) => l.qty > 0);
  if (!lines.length) throw new Error("Your cart is empty");
  const s = d.settings.payments;
  if ((input.method === "card" && !s.card) || (input.method === "bank_transfer" && !s.bankTransfer) || (input.method === "cod" && !s.cod))
    throw new Error("That payment method is not available");
  const ts = stamp(d);
  const ol = lines.map((l) => {
    const p = d.products.find((x) => x.id === l.productId)!;
    return { productId: p.id, qty: l.qty, mrp: p.mrp, price: consultantPrice(d, p.mrp) };
  });
  const subtotal = round2(ol.reduce((a, l) => a + l.qty * l.price, 0));
  const mrpValue = round2(ol.reduce((a, l) => a + l.qty * l.mrp, 0));
  const charge = deliveryCharge(d, subtotal);
  const o: ConsultantOrder = {
    id: nextId(d, "CO", 5),
    consultantId: c.id,
    createdAt: ts,
    lines: ol,
    subtotal,
    mrpValue,
    deliveryCharge: charge,
    total: round2(subtotal + charge),
    address: input.address,
    city: input.city,
    paymentMethod: input.method,
    paymentStatus: input.method === "cod" ? "cod_pending" : "awaiting",
    payments: [],
    deliveryStatus: "placed",
    stockReserved: false,
    events: [{ ts, by: c.id, text: "Order placed" }],
  };
  d.consultantOrders.unshift(o);
  const draft = d.consultantOrders[0];
  if (input.method === "cod") reserveOrder(d, draft);
  sendMessage(d, {
    channel: "email",
    to: c.email,
    toName: fullName(c),
    subject: `Order ${o.id} received`,
    body: `Dear ${c.givenName},\n\nThank you for your order ${o.id} for ${lkr(o.total)}.${input.method === "bank_transfer" ? `\n\nPlease transfer ${lkr(o.total)} to ${s.bankAccountName}, ${s.bankName}, account ${s.bankAccountNumber}, using ${o.id} as the reference, and upload the slip in the app.` : ""}\n\nFemmeCare`,
    relatedType: "Order",
    relatedId: o.id,
  });
  audit(d, { by: c.id, area: "Consultant orders", action: `Order placed ${o.id}`, entityId: o.id, after: lkr(o.total) });
  return draft;
}

function reserveOrder(d: Draft<Db>, o: Draft<ConsultantOrder>) {
  if (o.stockReserved) return true;
  for (const l of o.lines) {
    if (available(d, l.productId, "consultant") < l.qty) {
      o.events.push({ ts: stamp(d), by: "system", text: `Not enough ${l.productId} in stock to reserve; Operations will contact you` });
      notify(d, { role: "operations" }, `Paid order ${o.id} is short of stock`, `/staff/consultant-orders/${o.id}`);
      return false;
    }
  }
  for (const l of o.lines) reserve(d, l.productId, "consultant", l.qty);
  o.stockReserved = true;
  return true;
}

function markPaid(d: Draft<Db>, o: Draft<ConsultantOrder>, paidAt: string) {
  o.paymentStatus = "paid";
  o.paidAt = paidAt;
  o.events.push({ ts: stamp(d), by: "system", text: "Payment confirmed" });
  reserveOrder(d, o);
  const c = consultantById(d, o.consultantId)!;
  sendMessage(d, {
    channel: "sms",
    to: c.mobile,
    toName: fullName(c),
    body: `FemmeCare: Payment of ${lkr(o.total)} received for order ${o.id}. We are packing it now.`,
    relatedType: "Order",
    relatedId: o.id,
  });
  notify(d, { role: "operations" }, `Paid order to pack: ${o.id}`, "/staff/dispatch");
  notify(d, { consultantId: c.id }, `Payment received for ${o.id}`, `/app/orders/${o.id}`);
}

export function payByCard(d: Draft<Db>, orderId: string, card: { last4: string }) {
  const o = d.consultantOrders.find((x) => x.id === orderId);
  if (!o) return { ok: false, message: "Order not found" };
  if (o.paymentStatus === "paid") return { ok: false, message: "This order is already paid. No second payment was taken." };
  const fail = d.meta.forceNextCardFailure;
  d.meta.forceNextCardFailure = false;
  const ts = stamp(d);
  const attempt = {
    id: nextId(d, "PAY", 5),
    ts,
    method: "card" as const,
    amount: o.total,
    reference: `CARD-${card.last4}-${Math.floor(Math.random() * 900000 + 100000)}`,
    status: fail ? ("failed" as const) : ("success" as const),
  };
  o.payments.push(attempt);
  if (fail) {
    o.paymentStatus = "failed";
    o.events.push({ ts, by: "system", text: "Card payment declined by the bank" });
    audit(d, { by: o.consultantId, area: "Payments", action: `Card payment failed ${o.id}`, entityId: o.id });
    return { ok: false, message: "Your bank declined the payment. No money was taken. Please try again or use another card." };
  }
  markPaid(d, o, ts);
  audit(d, { by: o.consultantId, area: "Payments", action: `Card payment received ${o.id}`, entityId: o.id, after: lkr(o.total) });
  return { ok: true, message: "Payment successful" };
}

export function uploadProof(d: Draft<Db>, orderId: string, input: { amount: number; reference: string; proofImage: string }) {
  const o = d.consultantOrders.find((x) => x.id === orderId);
  if (!o) return;
  if (o.paymentStatus === "paid") throw new Error("This order is already paid");
  if (!input.reference.trim()) throw new Error("Enter the reference on the bank slip");
  const dupe = d.consultantOrders.find(
    (x) => x.id !== orderId && x.payments.some((p) => p.method === "bank_transfer" && p.reference.toLowerCase() === input.reference.trim().toLowerCase()),
  );
  const attempt = {
    id: nextId(d, "PAY", 5),
    ts: stamp(d),
    method: "bank_transfer" as const,
    amount: round2(input.amount),
    reference: input.reference.trim(),
    status: "pending" as const,
    proofImage: input.proofImage,
    duplicateOf: dupe?.id,
  };
  o.payments.push(attempt);
  o.paymentStatus = "proof_uploaded";
  o.events.push({ ts: attempt.ts, by: o.consultantId, text: "Bank slip uploaded, waiting for verification" });
  notify(d, { role: "operations" }, `Bank transfer to verify: ${o.id}`, "/staff/payments");
  audit(d, { by: o.consultantId, area: "Payments", action: `Bank slip uploaded ${o.id}`, entityId: o.id, after: `${lkr(attempt.amount)}, ref ${attempt.reference}` });
}

export function decidePayment(d: Draft<Db>, orderId: string, attemptId: string, approve: boolean, reason?: string) {
  const o = d.consultantOrders.find((x) => x.id === orderId);
  const a = o?.payments.find((p) => p.id === attemptId);
  if (!o || !a || a.status !== "pending") return;
  a.decidedBy = actor(d);
  a.decidedAt = stamp(d);
  const c = consultantById(d, o.consultantId)!;
  if (approve) {
    a.status = "verified";
    // the paid date is the day the money was sent, as shown on the slip
    markPaid(d, o, a.ts);
    audit(d, { by: actor(d), area: "Payments", action: `Bank transfer verified ${o.id}`, entityId: o.id, after: `${lkr(a.amount)}, ref ${a.reference}` });
  } else {
    if (!reason?.trim()) throw new Error("Give the reason, so the consultant knows what to fix");
    a.status = "rejected";
    a.rejectReason = reason;
    o.paymentStatus = "rejected";
    o.events.push({ ts: stamp(d), by: actor(d), text: `Bank slip not accepted: ${reason}` });
    sendMessage(d, {
      channel: "sms",
      to: c.mobile,
      toName: fullName(c),
      body: `FemmeCare: We could not verify the payment for order ${o.id}: ${reason}. Please upload the slip again in the app.`,
      relatedType: "Order",
      relatedId: o.id,
    });
    notify(d, { consultantId: c.id }, `Payment for ${o.id} not accepted: ${reason}`, `/app/orders/${o.id}`);
    audit(d, { by: actor(d), area: "Payments", action: `Bank transfer rejected ${o.id}`, entityId: o.id, reason });
  }
}

export function createConsultantDispatch(d: Draft<Db>, orderId: string): Draft<Dispatch> | undefined {
  const o = d.consultantOrders.find((x) => x.id === orderId);
  if (!o) return;
  if (o.paymentStatus !== "paid" && o.paymentStatus !== "cod_pending") throw new Error("Orders are packed only after full payment");
  if (o.dispatchId) return d.dispatches.find((x) => x.id === o.dispatchId);
  if (!o.stockReserved && !reserveOrder(d, o)) throw new Error("Not enough stock to pack this order");
  const lines = o.lines.flatMap((l) =>
    pickPlan(d, l.productId, "consultant", l.qty).map((p) => ({ productId: l.productId, batchId: p.batchId, qty: p.qty, scanned: 0 })),
  );
  const x: Dispatch = {
    id: nextId(d, "DSP", 5),
    channel: "consultant",
    orderId,
    status: "to_pick",
    createdAt: stamp(d),
    lines,
    events: [{ ts: stamp(d), by: actor(d), text: "Pick list created (earliest expiry first)" }],
  };
  d.dispatches.unshift(x);
  o.dispatchId = x.id;
  return d.dispatches[0];
}

export function handToCourier(d: Draft<Db>, dispatchId: string, courier: string, trackingNo: string) {
  const x = d.dispatches.find((y) => y.id === dispatchId);
  if (!x || x.channel !== "consultant") return;
  if (x.status !== "ready") throw new Error("Pack and scan every item first");
  if (!trackingNo.trim()) throw new Error("Enter the courier's tracking number");
  const o = d.consultantOrders.find((y) => y.id === x.orderId)!;
  for (const l of x.lines) issue(d, l.productId, l.batchId, "consultant", l.qty, { type: "Dispatch", id: x.id });
  o.stockReserved = false;
  const ts = stamp(d);
  x.status = "dispatched";
  x.courier = courier;
  x.trackingNo = trackingNo.trim();
  x.dispatchedAt = ts;
  x.events.push({ ts, by: actor(d), text: `Handed to ${courier}, tracking ${x.trackingNo}` });
  o.deliveryStatus = "dispatched";
  o.events.push({ ts, by: actor(d), text: `Dispatched with ${courier}, tracking ${x.trackingNo}` });
  const c = consultantById(d, o.consultantId)!;
  sendMessage(d, {
    channel: "sms",
    to: c.mobile,
    toName: fullName(c),
    body: `FemmeCare: Your order ${o.id} is on its way with ${courier}. Tracking number ${x.trackingNo}.`,
    relatedType: "Order",
    relatedId: o.id,
  });
  sendMessage(d, {
    channel: "email",
    to: c.email,
    toName: fullName(c),
    subject: `Your order ${o.id} is on its way`,
    body: `Dear ${c.givenName},\n\nYour order ${o.id} was handed to ${courier} on ${date(ts)}. Tracking number: ${x.trackingNo}.\n\nFemmeCare`,
    relatedType: "Order",
    relatedId: o.id,
  });
  notify(d, { consultantId: c.id }, `${o.id} dispatched with ${courier}`, `/app/orders/${o.id}`);
  audit(d, { by: actor(d), area: "Logistics", action: `Courier handover ${x.id}`, entityId: o.id, after: `${courier} ${x.trackingNo}` });
}

export function markConsultantDelivered(d: Draft<Db>, orderId: string, by: "staff" | "consultant" | "courier") {
  const o = d.consultantOrders.find((x) => x.id === orderId);
  if (!o || o.deliveryStatus !== "dispatched") return;
  const x = d.dispatches.find((y) => y.id === o.dispatchId);
  const ts = stamp(d);
  o.deliveryStatus = "delivered";
  const who = by === "consultant" ? o.consultantId : by === "courier" ? "courier" : actor(d);
  o.events.push({ ts, by: who, text: by === "consultant" ? "Received, confirmed in the app" : by === "courier" ? "Delivered (courier update)" : "Marked delivered" });
  if (x) {
    x.status = "delivered";
    x.deliveredAt = ts;
    x.events.push({ ts, by: who, text: "Delivered" });
  }
  if (o.paymentStatus === "cod_pending") {
    o.paymentStatus = "paid";
    o.paidAt = ts;
    o.payments.push({ id: nextId(d, "PAY", 5), ts, method: "cod", amount: o.total, reference: "Cash on delivery", status: "success" });
  }
}

export function canCancel(o: ConsultantOrder) {
  return o.deliveryStatus === "placed" || o.deliveryStatus === "packed";
}

/** Cancel an order before dispatch. Unpaid orders cancel at once; paid ones need a refund approved by Finance. */
export function cancelConsultantOrder(d: Draft<Db>, orderId: string, reason: string) {
  const o = d.consultantOrders.find((x) => x.id === orderId);
  if (!o) return;
  if (!reason.trim()) throw new Error("A reason is required");
  if (!canCancel(o)) throw new Error("This order has left the warehouse and can't be cancelled");
  const ts = stamp(d);
  if (o.paymentStatus === "paid") {
    o.refund = { status: "requested", reason, restock: true, requestedBy: actor(d), requestedAt: ts };
    o.events.push({ ts, by: actor(d), text: `Cancellation and refund requested: ${reason}` });
    notify(d, { role: "finance" }, `Refund to approve: ${o.id}`, "/staff/refunds");
    audit(d, { by: actor(d), area: "Consultant orders", action: `Refund requested ${o.id}`, entityId: o.id, reason });
    return;
  }
  if (o.stockReserved) for (const l of o.lines) release(d, l.productId, "consultant", l.qty);
  o.stockReserved = false;
  const x = d.dispatches.find((y) => y.id === o.dispatchId);
  if (x) d.dispatches.splice(d.dispatches.indexOf(x), 1);
  o.dispatchId = undefined;
  o.deliveryStatus = "cancelled";
  o.cancelReason = reason;
  if (o.paymentStatus !== "cod_pending") o.paymentStatus = o.paymentStatus === "proof_uploaded" ? "rejected" : o.paymentStatus;
  o.events.push({ ts, by: actor(d), text: `Cancelled: ${reason}` });
  audit(d, { by: actor(d), area: "Consultant orders", action: `Order cancelled ${o.id}`, entityId: o.id, reason });
}

/** Refund for a delivered order (e.g. damaged goods). */
export function requestRefund(d: Draft<Db>, orderId: string, reason: string, restock: boolean) {
  const o = d.consultantOrders.find((x) => x.id === orderId);
  if (!o || o.paymentStatus !== "paid") return;
  if (!reason.trim()) throw new Error("A reason is required");
  o.refund = { status: "requested", reason, restock, requestedBy: actor(d), requestedAt: stamp(d) };
  o.events.push({ ts: stamp(d), by: actor(d), text: `Refund requested: ${reason}` });
  notify(d, { role: "finance" }, `Refund to approve: ${o.id}`, "/staff/refunds");
  audit(d, { by: actor(d), area: "Consultant orders", action: `Refund requested ${o.id}`, entityId: o.id, reason });
}

export function decideRefund(d: Draft<Db>, orderId: string, approve: boolean, note?: string) {
  const o = d.consultantOrders.find((x) => x.id === orderId);
  if (!o?.refund || o.refund.status !== "requested") return;
  if (o.refund.requestedBy === actor(d)) throw new Error("A refund must be approved by someone other than the person who asked for it");
  const ts = stamp(d);
  o.refund.decidedBy = actor(d);
  o.refund.decidedAt = ts;
  if (!approve) {
    o.refund.status = "rejected";
    o.events.push({ ts, by: actor(d), text: `Refund not approved${note ? `: ${note}` : ""}` });
    audit(d, { by: actor(d), area: "Consultant orders", action: `Refund rejected ${o.id}`, entityId: o.id, reason: note });
    return;
  }
  o.refund.status = "approved";
  const wasDispatched = o.deliveryStatus === "dispatched" || o.deliveryStatus === "delivered";
  if (!wasDispatched) {
    if (o.stockReserved) for (const l of o.lines) release(d, l.productId, "consultant", l.qty);
    o.stockReserved = false;
    const x = d.dispatches.find((y) => y.id === o.dispatchId);
    if (x && x.status !== "dispatched" && x.status !== "delivered") d.dispatches.splice(d.dispatches.indexOf(x), 1);
    o.deliveryStatus = "cancelled";
    o.cancelReason = o.refund.reason;
  }
  o.paymentStatus = "refunded";
  o.events.push({ ts, by: actor(d), text: `Refund of ${lkr(o.total)} approved` });
  // commission effect: if the month of payment is already closed, post an adjustment
  const closed = d.commissionMonths.find((m) => o.paidAt && m.id === salesMonth(o.paidAt, d.settings.commission.cutoff));
  const c = consultantById(d, o.consultantId);
  if (closed && c?.sponsorId) {
    const set = closed.settingsUsed;
    const value = set.base === "mrp" ? o.mrpValue : o.subtotal;
    const line = closed.lines.find((l) => l.sponsorId === c.sponsorId);
    if (line?.qualifies) {
      const amt = round2((-value * set.rate) / 100);
      o.refund.afterClose = true;
      d.commissionAdjustments.unshift({
        id: nextId(d, "CADJ", 4),
        ts,
        sponsorId: c.sponsorId,
        amount: amt,
        reason: `Refund of ${o.id} (${fullName(c)}) after ${closed.id} was closed`,
        orderId: o.id,
        fromMonth: closed.id,
        by: actor(d),
      });
      audit(d, { by: actor(d), area: "Commission", action: `Adjustment posted for ${o.id}`, entityId: c.sponsorId, after: lkr(amt), reason: "Refund after month-end close" });
    }
  }
  if (c) {
    sendMessage(d, {
      channel: "sms",
      to: c.mobile,
      toName: fullName(c),
      body: `FemmeCare: A refund of ${lkr(o.total)} for order ${o.id} has been approved and will ${o.paymentMethod === "card" ? "go back to the card you paid with" : "reach your bank account"} within 5 working days.`,
      relatedType: "Order",
      relatedId: o.id,
    });
  }
  audit(d, { by: actor(d), area: "Consultant orders", action: `Refund approved ${o.id}`, entityId: o.id, after: lkr(o.total) });
}

export const PAYMENT_STATUS_LABEL: Record<ConsultantOrder["paymentStatus"], string> = {
  awaiting: "Awaiting payment",
  proof_uploaded: "Slip uploaded",
  paid: "Paid",
  failed: "Payment failed",
  rejected: "Slip rejected",
  cod_pending: "Pay on delivery",
  refunded: "Refunded",
};

export const DELIVERY_STATUS_LABEL: Record<ConsultantOrder["deliveryStatus"], string> = {
  placed: "Placed",
  packed: "Packed",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
