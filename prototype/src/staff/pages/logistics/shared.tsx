// Pieces shared by the dispatch and signed-note screens.

import type { Db, Dispatch, DispatchStatus } from "@/domain/types";
import { outletName } from "@/domain/outlets";
import { consultantById, fullName } from "@/domain/consultants";
import { addressLine, consultantCode } from "@/domain/format";

export const DISPATCH_STEPS: { key: DispatchStatus; label: string }[] = [
  { key: "to_pick", label: "To pick" },
  { key: "packing", label: "Packing" },
  { key: "ready", label: "Ready" },
  { key: "dispatched", label: "Dispatched" },
  { key: "delivered", label: "Delivered" },
];

export const DISPATCH_LABEL: Record<DispatchStatus, string> = {
  to_pick: "To pick",
  packing: "Packing",
  ready: "Ready",
  dispatched: "Dispatched",
  delivered: "Delivered",
  failed: "Failed",
  returned: "Returned",
};

export function units(x: Pick<Dispatch, "lines">) {
  return x.lines.reduce((s, l) => s + l.qty, 0);
}

export function scannedUnits(x: Pick<Dispatch, "lines">) {
  return x.lines.reduce((s, l) => s + Math.min(l.scanned, l.qty), 0);
}

/** Who a dispatch goes to, with a link to its order. */
export function partyOf(db: Db, x: Pick<Dispatch, "channel" | "orderId">) {
  if (x.channel === "outlet") {
    const o = db.outletOrders.find((y) => y.id === x.orderId);
    const outlet = db.outlets.find((y) => y.id === o?.outletId);
    const addr = outlet?.deliveryAddresses.find((a) => a.id === o?.deliveryAddressId);
    return {
      name: o ? outletName(db, o.outletId) : x.orderId,
      sub: o ? `PO ${o.poNumber}${addr ? ` · ${addr.label}` : ""}` : "",
      orderHref: `/staff/outlet-orders/${x.orderId}`,
      partyHref: o ? `/staff/outlets/${o.outletId}` : undefined,
      city: addr?.city ?? outlet?.city ?? "",
      address: addr ? addressLine(addr.address, addr.city) : (outlet?.billingAddress ?? ""),
      phone: outlet?.mobile ?? "",
    };
  }
  const o = db.consultantOrders.find((y) => y.id === x.orderId);
  const c = consultantById(db, o?.consultantId);
  return {
    name: c ? fullName(c) : x.orderId,
    sub: c ? `${consultantCode(c.number)} · ${o?.city}` : "",
    orderHref: `/staff/consultant-orders/${x.orderId}`,
    partyHref: c ? `/staff/consultants/${c.id}` : undefined,
    city: o?.city ?? "",
    address: o ? addressLine(o.address, o.city) : "",
    phone: c?.mobile ?? "",
  };
}

let ctx: AudioContext | undefined;

/** Short scanner beep: a high blip for a good scan, a low buzz for a refused one. */
export function beep(kind: "ok" | "error") {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    const tones = kind === "ok" ? [{ f: 1760, at: 0, d: 0.06 }] : [{ f: 220, at: 0, d: 0.14 }, { f: 165, at: 0.17, d: 0.2 }];
    for (const tone of tones) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = kind === "ok" ? "sine" : "square";
      o.frequency.value = tone.f;
      g.gain.setValueAtTime(0.0001, t + tone.at);
      g.gain.exponentialRampToValueAtTime(kind === "ok" ? 0.12 : 0.09, t + tone.at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + tone.at + tone.d);
      o.connect(g).connect(ctx.destination);
      o.start(t + tone.at);
      o.stop(t + tone.at + tone.d + 0.02);
    }
  } catch {
    /* sound not available */
  }
}
