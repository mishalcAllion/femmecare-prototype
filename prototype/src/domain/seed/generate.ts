// Demo data generator. It simulates the business day by day from December 2026,
// using the same business rules as the screens, so every figure reconciles.
// The same seed always produces the same history.

import type { Db, ScenarioId, Consultant } from "../types";
import { setSeedMode } from "../db";
import { addDays, addMinutes, dayKey, lkIso, monthKey, prevMonthKey, weekday } from "../format";
import { BANKS, CITIES, GIVEN, NAMED, OUTLETS, PRODUCTS, SAMPLE_SETTINGS, STAFF, SURNAMES } from "./data";
import { expectGrn, recordGrn, requestTransfer, startCount, submitCount, decideCount } from "../stock";
import {
  alertWaitingOutlets,
  freeForNewOrders,
  allocateBackorder,
  confirmDelivery,
  createOutletDispatch,
  createOutletOrder,
  declineBackorder,
  dispatchOutletDelivery,
  invoiceBalance,
  issueInvoice,
  packAll,
  readSignedNote,
  recordOutletPayment,
  waitingQueue,
} from "../outlets";
import {
  approveApplication,
  changeStatus,
  createConsultantDispatch,
  decidePayment,
  handToCourier,
  markConsultantDelivered,
  payByCard,
  placeOrder,
  rejectApplication,
  requestBankChange,
  requestRefund,
  submitApplication,
  type Application,
} from "../consultants";
import { approvePayout, closeMonth, markFileGenerated, recordResults } from "../commission";

// ---------- random ----------

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rand {
  private r: () => number;
  constructor(seed: number) {
    this.r = mulberry32(seed);
  }
  next() {
    return this.r();
  }
  int(a: number, b: number) {
    return a + Math.floor(this.r() * (b - a + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.r() * arr.length)];
  }
  chance(p: number) {
    return this.r() < p;
  }
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((s, w) => s + w, 0);
    let x = this.r() * total;
    for (let i = 0; i < items.length; i++) {
      x -= weights[i];
      if (x <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}

// ---------- scenarios ----------

export const SCENARIOS: Record<ScenarioId, { label: string; end: () => string; description: string }> = {
  month_end: {
    label: "Month-end",
    end: () => lkIso("2027-03-02", "09:00"),
    description: "Tue 2 Mar 2027. Full work queues; February ended but not closed; January paid with one failed payout.",
  },
  launch_day: {
    label: "Launch day",
    end: () => lkIso("2027-01-04", "09:00"),
    description: "Mon 4 Jan 2027. Products, opening stock and outlets set up; the first applications arriving; no orders yet.",
  },
  mid_month: {
    label: "Mid-month",
    end: () => lkIso("2027-02-17", "10:00"),
    description: "Wed 17 Feb 2027. Commissions building up as provisional; some sponsors below the threshold; back-orders waiting.",
  },
  blank: {
    label: "Blank",
    end: () => new Date().toISOString(),
    description: "Today's real date. Settings and staff users only, ready for the client's own products and outlets.",
  },
};

export function emptyDb(nowIso: string, scenario: ScenarioId): Db {
  return {
    version: 1,
    meta: {
      scenario,
      now: nowIso,
      changed: false,
      presenterMode: false,
      phaseLens: "first_release",
      forceNextCardFailure: false,
      session: { kind: "visitor" },
      counters: {},
    },
    settings: JSON.parse(JSON.stringify(SAMPLE_SETTINGS)),
    users: JSON.parse(JSON.stringify(STAFF)),
    products: [],
    batches: [],
    stockLots: [],
    movements: [],
    grns: [],
    transfers: [],
    counts: [],
    adjustments: [],
    outlets: [],
    outletOrders: [],
    dispatches: [],
    invoices: [],
    outletPayments: [],
    consultants: [],
    consultantOrders: [],
    commissionMonths: [],
    commissionAdjustments: [],
    payoutBatches: [],
    outbox: [],
    inbox: [],
    audit: [],
  };
}

function addNo1(db: Db, ts: string) {
  db.consultants.push({
    id: "c-0001",
    number: 1,
    appRef: "APP-26-0001",
    title: "",
    givenName: "FemmeCare",
    surname: "(Pvt) Ltd",
    nic: "PV00271834",
    dob: "",
    address: "No. 120, Kandy Road",
    city: "Kurunegala",
    postalCode: "60000",
    mobile: "0372224500",
    email: "consultants@femmecare.lk",
    bank: { accountName: "FemmeCare (Pvt) Ltd", accountNumber: "100045278812", bank: "Commercial Bank", branch: "Kurunegala" },
    bankVerified: true,
    status: "active",
    appliedAt: ts,
    joinedAt: ts,
    joinedVia: "none",
    consentShareWithSponsor: true,
    statusHistory: [{ ts, to: "active", by: "USR-01" }],
    avatarHue: 350,
    password: "femmecare",
  } as Consultant);
}

// ---------- generator ----------

interface Task {
  at: string;
  seq: number;
  who: string; // staff user id, consultant id or "system"
  run: () => void;
}

const COURIER_PREFIX: Record<string, () => string> = {};

export function generate(scenario: ScenarioId): Db {
  const end = SCENARIOS[scenario].end();
  if (scenario === "blank") {
    const db = emptyDb(end, scenario);
    addNo1(db, end);
    return db;
  }
  const R = new Rand(20270104);
  const start = lkIso("2026-12-01", "09:00");
  const db = emptyDb(start, scenario);
  const queue: Task[] = [];
  let seq = 0;

  const at = (iso: string, who: string, run: () => void) => {
    const t = { at: iso, seq: seq++, who, run };
    // insert keeping the queue sorted by time then sequence
    let lo = 0;
    let hi = queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (queue[mid].at < t.at || (queue[mid].at === t.at && queue[mid].seq < t.seq)) lo = mid + 1;
      else hi = mid;
    }
    queue.splice(lo, 0, t);
  };
  const safe = (fn: () => void) => {
    try {
      fn();
    } catch {
      /* a rule refused the step; in real life staff would deal with it later */
    }
  };
  const isWorkday = (iso: string) => weekday(iso) !== "Sun";
  const isWeekday = (iso: string) => !["Sat", "Sun"].includes(weekday(iso));
  const nextWorkday = (iso: string, hhmm: string, weekdaysOnly = false) => {
    let d = addDays(lkIso(dayKey(iso), hhmm), 0);
    if (d <= iso) d = addDays(d, 1);
    while (!(weekdaysOnly ? isWeekday(d) : isWorkday(d))) d = addDays(d, 1);
    return d;
  };
  const randomTime = (day: string, from: number, to: number) =>
    lkIso(day, `${String(R.int(from, to - 1)).padStart(2, "0")}:${String(R.int(0, 59)).padStart(2, "0")}`);

  setSeedMode(true);
  try {
    // ---- set-up in December ----
    at(lkIso("2026-12-01", "09:00"), "USR-01", () => {
      for (const p of PRODUCTS)
        db.products.push({ ...p, createdAt: db.meta.now, priceHistory: [{ from: db.meta.now, mrp: p.mrp, by: "USR-01" }] });
      addNo1(db, db.meta.now);
    });
    OUTLETS.forEach((o, i) => {
      at(lkIso(`2026-12-${String(2 + i).padStart(2, "0")}`, "11:00"), "USR-02", () => {
        db.outlets.push({
          id: `CUS-${String(i + 1).padStart(4, "0")}`,
          name: o.name,
          type: o.type,
          contactPerson: o.contactPerson,
          mobile: o.mobile,
          email: o.email,
          billingAddress: o.billingAddress,
          deliveryAddresses: o.addresses.map((a, j) => ({ id: `DA-${i + 1}-${j + 1}`, ...a })),
          city: o.city,
          district: o.district,
          taxId: o.taxId,
          paymentTerms: o.paymentTerms,
          creditLimit: o.creditLimit,
          openingBalance: 0,
          since: db.meta.now,
          status: "active",
          notes: i === 0 ? "Deliver to each showroom's receiving bay before 11 am." : "",
        });
        db.meta.counters["CUS"] = i + 1;
      });
    });

    // ---- production deliveries ----
    const production: [string, string, number, number][] = [
      // date, product, qty, months of shelf life
      ["2026-12-18", "FC001", 5000, 24],
      ["2026-12-18", "FC002", 3000, 24],
      ["2026-12-18", "FC003", 3000, 24],
      ["2026-12-18", "FC004", 4500, 5], // older wipes stock, expires in May 2027
      ["2026-12-19", "FC004", 1200, 18],
      ["2026-12-19", "FC005", 1500, 24],
      ["2026-12-19", "FC006", 1200, 24],
      ["2027-01-12", "FC001", 3000, 24],
      ["2027-01-12", "FC003", 2600, 24],
      ["2027-01-13", "FC005", 900, 24],
      ["2027-01-19", "FC002", 2200, 24],
      ["2027-01-19", "FC004", 1200, 18],
      ["2027-01-20", "FC006", 700, 24],
      ["2027-02-02", "FC001", 3000, 24],
      ["2027-02-02", "FC003", 2600, 24],
      ["2027-02-09", "FC002", 900, 24],
      ["2027-02-09", "FC005", 900, 24],
      ["2027-02-16", "FC004", 1300, 18],
      ["2027-02-16", "FC006", 400, 24],
      ["2027-02-23", "FC001", 3000, 24],
      ["2027-02-23", "FC003", 2200, 24],
    ];
    let prodRef = 1100;
    for (const [day, pid, qty, life] of production) {
      const arrive = lkIso(day, "08:00");
      at(arrive, "system", () => {
        const mfg = dayKey(addDays(arrive, -R.int(6, 15)));
        const expiry = dayKey(addDays(lkIso(mfg), Math.round(life * 30.4)));
        prodRef += 1;
        const g = expectGrn(db as never, { productId: pid, qty, mfgDate: mfg, expiryDate: expiry, productionRef: `PRD-${prodRef}` });
        at(addMinutes(arrive, R.int(60, 150)), "USR-03", () => {
          const out = Math.round((qty * (pid === "FC002" ? 0.55 : 0.6)) / 10) * 10;
          safe(() => {
            recordGrn(db as never, {
              grnId: g.id,
              productId: pid,
              qty,
              batchId: g.batchId,
              mfgDate: g.mfgDate,
              expiryDate: g.expiryDate,
              split: { outlet: out, consultant: qty - out },
              productionRef: g.productionRef,
            });
            alertWaitingOutlets(db as never, pid);
          });
          // outlet sales staff serve waiting outlets the next working day
          at(nextWorkday(db.meta.now, "11:00", true), "USR-02", () => {
            for (const q of waitingQueue(db, pid)) {
              if (R.chance(0.15)) safe(() => declineBackorder(db as never, q.order.id, pid, "Outlet no longer needs the balance"));
              else safe(() => allocateBackorder(db as never, q.order.id, pid));
            }
          });
        });
      });
    }
    // FC002 arrives on the demo morning and waits for Stores
    at(lkIso("2027-03-02", "07:30"), "system", () => {
      prodRef += 1;
      expectGrn(db as never, { productId: "FC002", qty: 2400, mfgDate: "2027-02-22", expiryDate: "2029-02-22", productionRef: `PRD-${prodRef}` });
    });

    // ---- consultants ----
    const people: { given: string; surname: string; title: string; city: string; sponsorIdx: number | "leader" }[] = [];
    for (const n of NAMED) people.push({ given: n.givenName, surname: n.surname, title: n.title, city: n.city, sponsorIdx: n.sponsor });
    const extra = 50;
    for (let i = 0; i < extra; i++)
      people.push({ given: R.pick(GIVEN), surname: R.pick(SURNAMES), title: R.chance(0.5) ? "Mrs" : "Ms", city: R.pick(CITIES).city, sponsorIdx: "leader" });

    const consultantIdByPerson: string[] = [];
    const leaders = [0, 1, 2, 3, 4, 5]; // indexes into people: Thilini, Nimali, Fathima, Dilini, Kavitha, Kavindi
    const leaderWeights = [3, 3, 4, 3, 2, 1];
    // application times: first five on the eve of launch, the rest spread to 2 March
    const appTimes: string[] = [];
    for (let i = 0; i < people.length; i++) {
      if (i < 5) appTimes.push(lkIso("2027-01-03", `${18 + Math.floor(i / 3)}:${String(10 + i * 9).padStart(2, "0")}`));
      else {
        const dayOffset = Math.floor(((i - 5) / (people.length - 5)) ** 0.85 * 57) + 1; // 4 Jan .. 2 Mar
        const day = dayKey(addDays(lkIso("2027-01-04", "09:00"), dayOffset - 1));
        appTimes.push(randomTime(day, 8, 22));
      }
    }
    // five applications land after the last approval run before the demo morning
    const lastFive = people.length - 5;
    const lateTimes = [lkIso("2027-03-01", "13:10"), lkIso("2027-03-01", "15:42"), lkIso("2027-03-01", "19:05"), lkIso("2027-03-02", "07:20"), lkIso("2027-03-02", "08:35")];
    for (let i = lastFive; i < people.length; i++) appTimes[i] = lateTimes[i - lastFive];

    const scheduleOrders = (cid: string, from: string, leader: boolean) => {
      const next = addDays(from, R.int(leader ? 2 : 3, leader ? 5 : 10));
      const day = dayKey(next);
      at(randomTime(day, 10, 22), cid, () => consultantOrder(cid, leader));
    };

    const consultantOrder = (cid: string, leader: boolean) => {
      const c = db.consultants.find((x) => x.id === cid);
      if (!c || c.status !== "active") return;
      const nLines = R.weighted([1, 2, 3], [5, 4, 2]);
      const picks = new Set<string>();
      while (picks.size < nLines) picks.add(R.weighted(["FC001", "FC002", "FC003", "FC004", "FC005", "FC006"], [40, 24, 16, 8, 7, 5]));
      const lines = [...picks].map((pid) => ({ productId: pid, qty: leader ? R.int(4, 12) : R.int(1, 5) }));
      const method = R.chance(0.55) ? "card" : "bank_transfer";
      let orderId = "";
      safe(() => {
        const o = placeOrder(db as never, { consultantId: cid, lines, address: c.address, city: c.city, method });
        orderId = o.id;
      });
      if (!orderId) return;
      if (method === "card") {
        at(addMinutes(db.meta.now, 2), cid, () => {
          if (R.chance(0.06)) {
            db.meta.forceNextCardFailure = true;
            payByCard(db as never, orderId, { last4: String(R.int(1000, 9999)) });
            at(addMinutes(db.meta.now, R.int(5, 40)), cid, () => payByCard(db as never, orderId, { last4: String(R.int(1000, 9999)) }));
          } else payByCard(db as never, orderId, { last4: String(R.int(1000, 9999)) });
        });
      } else {
        at(addMinutes(db.meta.now, R.int(20, 240)), cid, () => {
          const o = db.consultantOrders.find((x) => x.id === orderId)!;
          safe(() => uploadSlip(orderId, o.total));
        });
      }
      scheduleOrders(cid, db.meta.now, leader);
    };

    const slipRef = () => `${R.pick(["CMB", "BOC", "PB", "SMP", "HNB"])}${R.int(10000000, 99999999)}`;
    const uploadSlip = (orderId: string, amount: number, ref = slipRef(), image = `slip-${R.int(1, 3)}`) => {
      const o = db.consultantOrders.find((x) => x.id === orderId)!;
      db.meta.session = { kind: "consultant", consultantId: o.consultantId };
      // import lazily to avoid a cycle in tooling
      uploadProofFn(db, orderId, amount, ref, image);
    };

    people.forEach((p, i) => {
      const retry = () => apply();
      const apply = () => {
        const approvedLeaders = leaders.filter((li) => db.consultants.find((x) => x.id === consultantIdByPerson[li])?.status === "active");
        let sponsorPerson: number;
        if (p.sponsorIdx === "leader") {
          sponsorPerson = approvedLeaders.length ? R.weighted(approvedLeaders, approvedLeaders.map((li) => leaderWeights[leaders.indexOf(li)])) : -1;
        } else sponsorPerson = p.sponsorIdx;
        const sponsorCid = sponsorPerson === -1 ? "c-0001" : consultantIdByPerson[sponsorPerson];
        const sponsor = db.consultants.find((x) => x.id === sponsorCid);
        if (sponsorPerson !== -1 && sponsor?.status !== "active") {
          // the person who introduced her is not approved yet; she applies the next day
          at(addDays(db.meta.now, 1), "applicant", retry);
          return;
        }
        const loc = CITIES.find((x) => x.city === p.city) ?? CITIES[0];
        const year = R.int(1978, 2003);
        const dayNo = R.int(1, 365) + 500;
        const nic = `${year}${String(dayNo).padStart(3, "0")}${R.int(1000, 9999)}${R.int(0, 9)}`;
        const handle = `${p.given}.${p.surname}`.toLowerCase().replace(/[^a-z.]/g, "");
        const app: Application = {
          title: p.title,
          givenName: p.given,
          surname: p.surname,
          nic,
          dob: "",
          address: `No. ${R.int(3, 220)}, ${R.pick(loc.streets)}`,
          city: loc.city,
          postalCode: loc.postal,
          mobile: `07${R.pick(["0", "1", "2", "4", "5", "6", "7", "8"])}${R.int(1000000, 9999999)}`,
          email: `${handle}${R.int(1, 99)}@gmail.com`,
          bank: { accountName: `${p.given} ${p.surname}`, accountNumber: String(R.int(10000000, 99999999)) + String(R.int(1000, 9999)), bank: R.pick(BANKS), branch: loc.city },
          sponsorNumber: sponsor?.number && sponsor.number !== 1 ? sponsor.number : undefined,
          joinedVia: sponsor?.number && sponsor.number !== 1 ? (R.chance(0.7) ? "link" : "number") : "none",
          consentShareWithSponsor: true,
          acceptedTerms: true,
          password: "femmecare",
        };
        if (sponsor && sponsor.status !== "active") app.sponsorNumber = undefined;
        let cid = "";
        safe(() => {
          cid = submitApplication(db as never, app).id;
        });
        if (!cid) return;
        consultantIdByPerson[i] = cid;
        const reject = i === 23;
        const approveAt = i >= lastFive ? lkIso("2027-03-02", "10:30") : nextWorkday(db.meta.now, R.chance(0.5) ? "10:30" : "15:00", true);
        at(approveAt, "USR-01", () => {
          if (reject) {
            safe(() => rejectApplication(db as never, cid, "The NIC number did not match the name given"));
            return;
          }
          safe(() => approveApplication(db as never, cid));
          const c = db.consultants.find((x) => x.id === cid)!;
          c.bankVerified = true;
          scheduleOrders(cid, db.meta.now, leaders.includes(i));
        });
      };
      at(appTimes[i], "applicant", apply);
    });

    // ---- operations runs ----
    const opsRun = (when: string) => {
      at(when, "USR-05", () => {
        // verify bank slips
        for (const o of db.consultantOrders.filter((x) => x.paymentStatus === "proof_uploaded")) {
          const a = o.payments.find((p) => p.status === "pending");
          if (!a || a.ts > db.meta.now || held.has(o.id)) continue;
          safe(() => decidePayment(db as never, o.id, a.id, true));
        }
        // pack and hand over paid orders
        db.meta.session = { kind: "staff", userId: "USR-03" };
        for (const o of db.consultantOrders.filter((x) => x.paymentStatus === "paid" && !x.dispatchId && x.deliveryStatus === "placed" && !x.refund)) {
          safe(() => {
            const x = createConsultantDispatch(db as never, o.id);
            if (!x) return;
            packAll(db as never, x.id);
            db.meta.session = { kind: "staff", userId: "USR-05" };
            const courier = R.weighted(["Domex", "Pronto Lanka", "Koombiyo"], [5, 3, 2]);
            const track = courier === "Domex" ? `DMX${R.int(100000000, 999999999)}` : courier === "Pronto Lanka" ? `PL${R.int(10000000, 99999999)}` : `KB${R.int(10000000, 99999999)}`;
            handToCourier(db as never, x.id, courier, track);
            const oid = o.id;
            const cid = o.consultantId;
            const byConsultant = R.chance(0.35);
            at(addMinutes(db.meta.now, R.int(20, 60) * 60), byConsultant ? cid : "courier", () =>
              markConsultantDelivered(db as never, oid, byConsultant ? "consultant" : "courier"),
            );
          });
          db.meta.session = { kind: "staff", userId: "USR-03" };
        }
      });
    };
    const held = new Set<string>();
    const verifyRun = (when: string) => {
      at(when, "USR-05", () => {
        for (const o of db.consultantOrders.filter((x) => x.paymentStatus === "proof_uploaded")) {
          const a = o.payments.find((p) => p.status === "pending");
          if (!a || a.ts > db.meta.now || held.has(o.id)) continue;
          safe(() => decidePayment(db as never, o.id, a.id, true));
        }
      });
    };

    // ---- outlet orders ----
    const outletWeights = [5, 3, 2, 2, 2, 1, 2, 1];
    let poSeq = 4400;
    const outletOrder = (when: string) => {
      at(when, "USR-02", () => {
        const idx = R.weighted([0, 1, 2, 3, 4, 5, 6, 7], outletWeights);
        const outlet = db.outlets[idx];
        if (!outlet) return;
        const big = idx <= 2 || idx === 6;
        const nLines = R.weighted([1, 2, 3, 4], [2, 4, 3, 1]);
        const picks = new Set<string>();
        while (picks.size < nLines) picks.add(R.weighted(["FC001", "FC002", "FC003", "FC004", "FC005", "FC006"], [35, 22, 18, 10, 9, 6]));
        poSeq += R.int(1, 9);
        const lines = [...picks].map((pid) => ({ productId: pid, qty: Math.round((big ? R.int(100, 300) : R.int(30, 100)) / 10) * 10 }));
        safe(() =>
          createOutletOrder(db as never, {
            outletId: outlet.id,
            poNumber: `${idx === 0 ? "CP" : idx === 1 ? "HOF" : idx === 2 ? "FP" : "PO"}-${poSeq}`,
            poDate: dayKey(addDays(db.meta.now, -R.int(0, 2))),
            requiredDate: dayKey(addDays(db.meta.now, R.int(5, 14))),
            deliveryAddressId: R.pick(outlet.deliveryAddresses).id,
            lines,
            hasPoPhoto: R.chance(0.6),
          }),
        );
      });
    };

    const outletRun = (when: string) => {
      at(when, "USR-03", () => {
        for (const o of db.outletOrders.filter((x) => x.status !== "cancelled" && x.lines.some((l) => l.allocated > 0))) {
          safe(() => {
            const x = createOutletDispatch(db as never, o.id);
            if (!x) return;
            packAll(db as never, x.id);
            db.meta.session = { kind: "staff", userId: "USR-02" };
            const inv = issueInvoice(db as never, x.id);
            db.meta.session = { kind: "staff", userId: "USR-03" };
            // each van has its own driver
            const vehicles = ["LP-4521", "PH-7788", "LI-0932"];
            const drivers = ["Saman Kumara", "Priyantha Silva", "Ajith Perera"];
            const vehicle = R.pick(vehicles);
            R.pick(drivers); // second draw kept so the rest of the generated data stays the same
            dispatchOutletDelivery(db as never, x.id, vehicle, drivers[vehicles.indexOf(vehicle)]);
            const xid = x.id;
            const outletIdx = db.outlets.findIndex((y) => y.id === o.outletId);
            at(nextWorkday(addDays(db.meta.now, R.int(1, 2)), "14:00", true), "USR-02", () => {
              const doc = R.chance(0.08) ? "pod-difference" : "pod-clean";
              readSignedNote(db as never, xid, doc);
              const xd = db.dispatches.find((y) => y.id === xid)!;
              confirmDelivery(db as never, xid, xd.pod!.readQty, undefined, R.pick(["S. Perera", "K. Fernando", "M. Rizvi", "N. Silva", "T. Bandara", "P. Herath"]));
            });
            // payment behaviour per outlet
            const lateOutlet = outletIdx === 2 || outletIdx === 3;
            const cash = db.outlets[outletIdx]?.paymentTerms === "Cash";
            const due = inv.dueDate;
            const payAt = cash ? addDays(db.meta.now, 2) : lateOutlet ? addDays(due, R.int(5, 40)) : addDays(due, -R.int(0, 8));
            const invId = inv.id;
            at(nextWorkday(payAt, "11:30", true), "USR-06", () => {
              const iv = db.invoices.find((y) => y.id === invId)!;
              const bal = invoiceBalance(db, iv);
              if (bal <= 0) return;
              const partial = !cash && R.chance(0.12);
              safe(() =>
                recordOutletPayment(db as never, {
                  invoiceId: invId,
                  amount: partial ? Math.round(bal / 2) : bal,
                  method: cash ? "Cash" : R.weighted(["Bank Transfer", "Cheque"], [3, 2]),
                  reference: cash ? "" : `${R.pick(["TT", "CHQ"])}${R.int(100000, 999999)}`,
                }),
              );
            });
          });
          db.meta.session = { kind: "staff", userId: "USR-03" };
        }
      });
    };

    // ---- daily calendar ----
    for (let day = lkIso("2027-01-04", "00:00"); day <= end; day = addDays(day, 1)) {
      const dk = dayKey(day);
      if (isWorkday(day)) {
        verifyRun(lkIso(dk, "08:45"));
        opsRun(lkIso(dk, "11:00"));
        opsRun(lkIso(dk, "16:00"));
      }
      if (isWeekday(day)) {
        outletRun(lkIso(dk, "10:30"));
        const n = R.weighted([0, 1, 1, 2], [2, 4, 3, 1]);
        for (let k = 0; k < n; k++) outletOrder(randomTime(dk, 10, 16));
      }
    }

    // ---- month-end and payouts for January ----
    at(lkIso("2027-02-01", "16:30"), "USR-06", () => safe(() => closeMonth(db as never, "2027-01", db.meta.now)));
    at(lkIso("2027-02-02", "11:00"), "USR-06", () => safe(() => approvePayout(db as never, "PB-2027-01")));
    at(lkIso("2027-02-02", "15:30"), "USR-06", () => safe(() => markFileGenerated(db as never, "PB-2027-01")));
    at(lkIso("2027-02-04", "10:00"), "USR-06", () => {
      const b = db.payoutBatches.find((x) => x.id === "PB-2027-01");
      const pend = b?.lines.filter((l) => l.status === "pending").map((l) => l.consultantId) ?? [];
      const failing = pend.length > 1 ? pend[1] : undefined;
      safe(() => recordResults(db as never, "PB-2027-01", failing ? [failing] : [], "Account closed at the bank"));
      if (failing) {
        const c = db.consultants.find((x) => x.id === failing)!;
        // she sends new details at the end of February
        at(lkIso("2027-03-01", "14:05"), failing, () =>
          safe(() => requestBankChange(db as never, failing, { accountName: `${c.givenName} ${c.surname}`, accountNumber: String(R.int(100000000000, 999999999999)), bank: "Sampath Bank", branch: c.city })),
        );
      }
    });

    // ---- February events ----
    at(lkIso("2027-02-15", "16:00"), "USR-03", () => {
      safe(() => {
        const c = startCount(db as never, ["FC003", "FC004"]);
        for (const l of c.lines) l.counted = l.systemQty;
        const target = c.lines.find((l) => l.productId === "FC003" && l.channel === "outlet");
        if (target) target.counted = target.systemQty - 3;
        submitCount(db as never, c.id);
        at(lkIso("2027-02-15", "17:20"), "USR-04", () => safe(() => decideCount(db as never, c.id, true, "3 packs found damaged on the bottom shelf")));
      });
    });
    at(lkIso("2027-02-11", "11:20"), "USR-01", () => {
      const c = db.consultants.filter((x) => x.status === "active" && (x.number ?? 0) > 20)[4];
      if (c) safe(() => changeStatus(db as never, c.id, "suspended", "Three failed card payments in a row; waiting for a call back"));
    });
    at(lkIso("2027-02-19", "15:40"), "USR-01", () => {
      const c = db.consultants.filter((x) => x.status === "active" && (x.number ?? 0) > 20)[9];
      if (c) safe(() => changeStatus(db as never, c.id, "suspended", "Customer complaint under review"));
    });
    at(lkIso("2027-02-24", "10:05"), "USR-01", () => {
      const c = db.consultants.filter((x) => x.status === "active" && (x.number ?? 0) > 25)[2];
      if (c) safe(() => changeStatus(db as never, c.id, "terminated", "Selling below MRP on a public marketplace, after a written warning", "sponsor"));
    });

    // ---- the demo morning's queues (month-end scenario) ----
    const story = (iso: string, who: string, fn: () => void) => at(iso, who, fn);
    const freeNow = (pid: string) => freeForNewOrders(db, pid);
    // two slips sent on the last evening of February, not yet verified
    story(lkIso("2027-02-28", "19:10"), "system", () => {
      const cands = db.consultantOrders.filter((o) => o.paymentStatus === "awaiting" && o.paymentMethod === "bank_transfer");
      const all = db.consultants.filter((c) => c.status === "active" && (c.number ?? 0) > 2);
      const pickC = (n: number) => all[n % all.length];
      const mk = (c: Consultant, lines: { productId: string; qty: number }[]) => {
        db.meta.session = { kind: "consultant", consultantId: c.id };
        return placeOrder(db as never, { consultantId: c.id, lines, address: c.address, city: c.city, method: "bank_transfer" });
      };
      void cands;
      const o1 = mk(pickC(7), [{ productId: "FC001", qty: 10 }, { productId: "FC003", qty: 4 }]);
      held.add(o1.id);
      uploadSlip(o1.id, o1.total);
      db.meta.now = lkIso("2027-02-28", "20:25");
      const o2 = mk(pickC(12), [{ productId: "FC002", qty: 6 }]);
      held.add(o2.id);
      uploadSlip(o2.id, o2.total - 500);
    });
    story(lkIso("2027-03-01", "21:10"), "system", () => {
      const c = db.consultants.filter((x) => x.status === "active" && (x.number ?? 0) > 5)[15];
      if (!c) return;
      db.meta.session = { kind: "consultant", consultantId: c.id };
      const o = placeOrder(db as never, { consultantId: c.id, lines: [{ productId: "FC001", qty: 8 }], address: c.address, city: c.city, method: "bank_transfer" });
      held.add(o.id);
      const reused = db.consultantOrders.flatMap((x) => x.payments).find((p) => p.method === "bank_transfer" && p.status === "verified");
      uploadSlip(o.id, o.total, reused?.reference ?? slipRef(), "slip-2");
    });
    story(lkIso("2027-03-02", "07:45"), "system", () => {
      const c = db.consultants.filter((x) => x.status === "active" && (x.number ?? 0) > 5)[21];
      if (!c) return;
      db.meta.session = { kind: "consultant", consultantId: c.id };
      const o = placeOrder(db as never, { consultantId: c.id, lines: [{ productId: "FC005", qty: 3 }, { productId: "FC006", qty: 2 }], address: c.address, city: c.city, method: "bank_transfer" });
      held.add(o.id);
      uploadSlip(o.id, o.total, slipRef(), "slip-3");
    });
    // a refund request for a damaged January delivery
    story(lkIso("2027-03-01", "12:20"), "USR-05", () => {
      const nimali = db.consultants.find((c) => c.givenName === "Nimali" && c.surname === "Perera");
      const team = db.consultants.filter((c) => c.sponsorId === nimali?.id).map((c) => c.id);
      const o = db.consultantOrders.find(
        (x) => team.includes(x.consultantId) && x.paidAt && monthKey(x.paidAt) === "2027-01" && x.deliveryStatus === "delivered" && x.paymentStatus === "paid",
      );
      if (o) safe(() => requestRefund(db as never, o.id, "Consultant reported 4 packs water-damaged in transit; photos received on WhatsApp", false));
    });
    // a bank-detail change sent this morning
    story(lkIso("2027-03-02", "08:10"), "system", () => {
      const c = db.consultants.filter((x) => x.status === "active" && (x.number ?? 0) > 10)[6];
      if (!c) return;
      db.meta.session = { kind: "consultant", consultantId: c.id };
      safe(() => requestBankChange(db as never, c.id, { accountName: `${c.givenName} ${c.surname}`, accountNumber: String(R.int(100000000000, 999999999999)), bank: "Hatton National Bank", branch: c.city }));
    });
    // Stores asks to move stock between allocations
    story(lkIso("2027-03-01", "16:40"), "USR-03", () => {
      const lot = db.stockLots.filter((l) => l.productId === "FC001" && l.channel === "consultant" && l.onHand - l.reserved > 300).pop();
      if (lot)
        safe(() =>
          requestTransfer(db as never, { productId: "FC001", batchId: lot.batchId, from: "consultant", to: "outlet", qty: 200, reason: "Cool Planet's Kandy order needs more Regular pads; consultant stock covers 5 weeks" }),
        );
    });
    // two recent consultants whose bank details are not verified yet
    story(lkIso("2027-02-26", "10:00"), "USR-06", () => {
      const recent = db.consultants.filter((c) => c.status === "active" && (c.number ?? 0) > 3).slice(-3);
      for (const c of recent.slice(0, 2)) c.bankVerified = false;
    });
    // FC002 runs short in late February: two more outlets order it
    story(lkIso("2027-02-25", "11:30"), "USR-02", () => {
      for (const idx of [4, 6]) {
        const outlet = db.outlets[idx];
        poSeq += 3;
        safe(() =>
          createOutletOrder(db as never, {
            outletId: outlet.id,
            poNumber: `PO-${poSeq}`,
            poDate: dayKey(db.meta.now),
            requiredDate: dayKey(addDays(db.meta.now, 7)),
            deliveryAddressId: outlet.deliveryAddresses[0].id,
            lines: [{ productId: "FC002", qty: 120 }, { productId: "FC001", qty: 100 }],
            hasPoPhoto: true,
          }),
        );
      }
    });
    story(lkIso("2027-02-26", "10:10"), "USR-02", () => {
      const outlet = db.outlets[0];
      poSeq += 4;
      safe(() =>
        createOutletOrder(db as never, {
          outletId: outlet.id,
          poNumber: `CP-${poSeq}`,
          poDate: dayKey(db.meta.now),
          requiredDate: dayKey(addDays(db.meta.now, 10)),
          deliveryAddressId: outlet.deliveryAddresses[1].id,
          lines: [{ productId: "FC002", qty: 250 }, { productId: "FC003", qty: 120 }],
          hasPoPhoto: true,
        }),
      );
    });

    // Night pads run out: on 1 March three outlets end up waiting for FC002
    story(lkIso("2027-03-01", "10:05"), "USR-02", () => {
      const left = waitingQueue(db, "FC002").length ? 0 : Math.max(0, freeNow("FC002"));
      const plan: [number, number, string][] = [
        [0, left + 150, "CP"],
        [1, 120, "HOF"],
        [2, 80, "FP"],
      ];
      for (const [idx, qty, pre] of plan) {
        const outlet = db.outlets[idx];
        poSeq += 5;
        db.meta.now = addMinutes(db.meta.now, 7);
        safe(() =>
          createOutletOrder(db as never, {
            outletId: outlet.id,
            poNumber: `${pre}-${poSeq}`,
            poDate: "2027-02-27",
            requiredDate: "2027-03-08",
            deliveryAddressId: outlet.deliveryAddresses[0].id,
            lines: [{ productId: "FC002", qty }],
            hasPoPhoto: true,
          }),
        );
      }
    });

    // Nelum Pharmacy is put on hold for overdue invoices (workbook customer status "On Hold")
    story(lkIso("2027-02-26", "15:20"), "USR-06", () => {
      const o = db.outlets[3];
      if (!o) return;
      o.status = "on_hold";
      o.notes = "On hold from 26 Feb 2027: two invoices more than 30 days overdue. Release when paid.";
      db.audit.unshift({ id: `aud-hold-${o.id}`, ts: db.meta.now, by: "USR-06", area: "Outlets", action: `Outlet put on hold ${o.id}`, entityId: o.id, before: "Active", after: "On Hold", reason: "Two invoices more than 30 days overdue" });
    });

    // ---- run the simulation ----
    while (queue.length && queue[0].at <= end) {
      const t = queue.shift()!;
      db.meta.now = t.at;
      db.meta.session =
        t.who.startsWith("USR-")
          ? { kind: "staff", userId: t.who }
          : t.who.startsWith("c-")
            ? { kind: "consultant", consultantId: t.who }
            : { kind: "visitor" };
      t.run();
    }

    // ---- tidy up for the demo ----
    db.meta.now = end;
    db.meta.session = { kind: "visitor" };
    db.meta.changed = false;
    // keep the bell to recent items; mark older ones read
    const weekAgo = addDays(end, -3);
    db.inbox = db.inbox.filter((i) => i.ts >= addDays(end, -21));
    for (const i of db.inbox) if (i.ts < weekAgo) i.read = true;
    // month-end reminder
    if (scenario === "month_end")
      db.inbox.unshift({ id: "inb-monthend", ts: lkIso("2027-03-01", "06:00"), audience: { role: "finance" }, title: `February 2027 has ended. Close the month and pay commission by the 5th`, link: "/staff/month-end", read: false });
    void prevMonthKey;
    return db;
  } finally {
    setSeedMode(false);
  }
}

// late-bound to keep this file's imports readable
import { uploadProof } from "../consultants";
function uploadProofFn(db: Db, orderId: string, amount: number, reference: string, image: string) {
  uploadProof(db as never, orderId, { amount, reference, proofImage: image });
}
void COURIER_PREFIX;
