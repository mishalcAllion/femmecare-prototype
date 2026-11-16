// The consultant's cart: React context, kept in sessionStorage per consultant so a
// refresh doesn't empty it.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface CartLine {
  productId: string;
  qty: number;
}

interface CartApi {
  lines: CartLine[];
  count: number;
  qtyOf: (productId: string) => number;
  add: (productId: string, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const Ctx = createContext<CartApi | null>(null);
const MAX_QTY = 999;

function read(key: string): CartLine[] {
  try {
    const raw = sessionStorage.getItem(key);
    const v = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return Array.isArray(v) ? v.filter((l) => l && typeof l.productId === "string" && l.qty > 0) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ consultantId, children }: { consultantId: string; children: ReactNode }) {
  const key = `fc:cart:${consultantId}`;
  const [lines, setLines] = useState<CartLine[]>(() => read(key));
  useEffect(() => {
    setLines(read(key));
  }, [key]);
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(lines));
    } catch {
      /* storage blocked: the cart still works for this visit */
    }
  }, [key, lines]);

  const setQty = useCallback((productId: string, qty: number) => {
    const q = Math.max(0, Math.min(MAX_QTY, Math.floor(qty || 0)));
    setLines((ls) => {
      const has = ls.some((l) => l.productId === productId);
      if (q === 0) return ls.filter((l) => l.productId !== productId);
      return has ? ls.map((l) => (l.productId === productId ? { ...l, qty: q } : l)) : [...ls, { productId, qty: q }];
    });
  }, []);

  const api = useMemo<CartApi>(
    () => ({
      lines,
      count: lines.reduce((a, l) => a + l.qty, 0),
      qtyOf: (id) => lines.find((l) => l.productId === id)?.qty ?? 0,
      add: (id, qty = 1) => setQty(id, (lines.find((l) => l.productId === id)?.qty ?? 0) + qty),
      setQty,
      remove: (id) => setQty(id, 0),
      clear: () => setLines([]),
    }),
    [lines, setQty],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart(): CartApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart outside CartProvider");
  return c;
}
