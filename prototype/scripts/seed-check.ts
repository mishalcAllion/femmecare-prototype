// Runs the demo data generator and prints the state of every queue.
import { generate } from "../src/domain/seed/generate";
import { available, stockAlerts } from "../src/domain/stock";
import { waitingQueue, invoiceStatus } from "../src/domain/outlets";
import { computeMonth, closeChecks } from "../src/domain/commission";

const scenario = (process.argv[2] ?? "month_end") as never;
const t0 = Date.now();
const db = generate(scenario);
const ms = Date.now() - t0;
const now = db.meta.now;
const c = db.consultants;
console.log(`scenario ${scenario}, generated in ${ms} ms, now ${now}, size ${(JSON.stringify(db).length / 1e6).toFixed(2)} MB`);
console.log("consultants", c.length, Object.fromEntries(["pending","active","suspended","terminated","rejected"].map(s=>[s,c.filter(x=>x.status===s).length])));
console.log("consultant orders", db.consultantOrders.length, "outlet orders", db.outletOrders.length, "invoices", db.invoices.length, "dispatches", db.dispatches.length);
console.log("proofs to verify", db.consultantOrders.filter(o=>o.paymentStatus==="proof_uploaded").length,
  "duplicates", db.consultantOrders.filter(o=>o.payments.some(p=>p.status==="pending"&&p.duplicateOf)).length);
console.log("paid orders to pack", db.consultantOrders.filter(o=>o.paymentStatus==="paid"&&!o.dispatchId&&o.deliveryStatus==="placed").length);
console.log("outlet dispatches awaiting POD", db.dispatches.filter(x=>x.channel==="outlet"&&x.status==="dispatched").length);
for (const p of db.products) {
  const q = waitingQueue(db, p.id);
  console.log(p.id, "avail outlet", available(db,p.id,"outlet"), "consultant", available(db,p.id,"consultant"), "waiting outlets", new Set(q.map(x=>x.order.outletId)).size, "units", q.reduce((s,x)=>s+x.line.backordered,0));
}
console.log("alerts", stockAlerts(db, now).map(a=>a.text));
console.log("grns expected", db.grns.filter(g=>g.status==="expected").map(g=>g.id+" "+g.productId));
console.log("transfers requested", db.transfers.filter(t=>t.status==="requested").length, "bank changes", c.filter(x=>x.pendingBank).length, "refunds", db.consultantOrders.filter(o=>o.refund?.status==="requested").length);
const statuses: Record<string, number> = {};
for (const i of db.invoices) { const s = invoiceStatus(db, i, now); statuses[s]=(statuses[s]??0)+1; }
console.log("invoice statuses", statuses);
console.log("outlet order statuses", db.outletOrders.reduce((m: Record<string,number>,o)=>{m[o.status]=(m[o.status]??0)+1;return m;},{}));
console.log("commission months", db.commissionMonths.map(m=>`${m.id} ${m.status} lines ${m.lines.length} qualified ${m.lines.filter(l=>l.qualifies).length} payable ${m.lines.reduce((s,l)=>s+l.payable,0)}`));
console.log("payout batches", db.payoutBatches.map(b=>`${b.id} ${b.status} ${b.lines.map(l=>l.status).join(",")}`));
const feb = computeMonth(db, "2027-02");
console.log("Feb provisional: sponsors", feb.length, "qualify", feb.filter(l=>l.qualifies).length, "payable", feb.reduce((s,l)=>s+l.payable,0).toFixed(2));
console.log("Feb close check", JSON.stringify(closeChecks(db, "2027-02", now)));
const nimali = c.find(x=>x.givenName==="Nimali");
console.log("Nimali", nimali?.number, "team", c.filter(x=>x.sponsorId===nimali?.id).length, feb.find(l=>l.sponsorId===nimali?.id));
console.log("audit", db.audit.length, "outbox", db.outbox.length, "inbox", db.inbox.length, "movements", db.movements.length);
