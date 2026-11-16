// Sample documents (signed delivery notes, bank slips), barcodes, QR codes and form controls.

import { useEffect, useRef, useState, type SelectHTMLAttributes } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";
import { lkr, date } from "@/domain/format";

export function Barcode({ value, height = 48, className, showText = true }: { value: string; height?: number; className?: string; showText?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: /^\d{13}$/.test(value) ? "EAN13" : "CODE128",
        height,
        width: 1.6,
        margin: 0,
        displayValue: showText,
        fontSize: 12,
        background: "transparent",
        lineColor: "currentColor",
      });
    } catch {
      /* invalid barcode text */
    }
  }, [value, height, showText]);
  return <svg ref={ref} className={cn("text-foreground", className)} />;
}

export function QrCode({ value, size = 160, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    QRCode.toDataURL(value, { width: size * 2, margin: 1, color: { dark: "#3a1020", light: "#ffffff" } }).then(setSrc).catch(() => undefined);
  }, [value, size]);
  return src ? <img src={src} width={size} height={size} alt={`QR code for ${value}`} className={cn("rounded-xl", className)} /> : <div style={{ width: size, height: size }} className="animate-pulse rounded-xl bg-muted" />;
}

/** A photographed signed delivery note. `difference` adds the outlet's handwritten note. */
export function SignedNoteImage({
  noteNo,
  outlet,
  lines,
  difference,
  className,
}: {
  noteNo: string;
  outlet: string;
  lines: { name: string; qty: number; received: number }[];
  difference?: boolean;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 420 300" className={cn("w-full rounded-xl shadow-soft", className)} role="img" aria-label={`Signed delivery note ${noteNo}`}>
      <defs>
        <filter id="paper">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n" />
          <feColorMatrix in="n" type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.05" />
          </feComponentTransfer>
          <feBlend in="SourceGraphic" mode="multiply" />
        </filter>
      </defs>
      <rect width="420" height="300" fill="#8a8178" />
      <g transform="rotate(-1.6 210 150)">
        <rect x="22" y="14" width="376" height="272" fill="#fbfaf6" filter="url(#paper)" />
        <text x="40" y="44" fontSize="15" fontWeight="700" fill="#c8305a" fontFamily="Georgia, serif">FemmeCare</text>
        <text x="40" y="58" fontSize="7.5" fill="#666">FemmeCare (Pvt) Ltd · Kurunegala</text>
        <text x="380" y="44" fontSize="11" fontWeight="700" textAnchor="end" fill="#222">DELIVERY NOTE</text>
        <text x="380" y="58" fontSize="9" textAnchor="end" fill="#222">{noteNo}</text>
        <text x="40" y="80" fontSize="8.5" fill="#333">Deliver to: {outlet}</text>
        <line x1="40" y1="90" x2="380" y2="90" stroke="#999" strokeWidth="0.6" />
        <text x="40" y="102" fontSize="8" fill="#555" fontWeight="700">Item</text>
        <text x="300" y="102" fontSize="8" fill="#555" fontWeight="700" textAnchor="end">Qty sent</text>
        <text x="372" y="102" fontSize="8" fill="#555" fontWeight="700" textAnchor="end">Received</text>
        {lines.slice(0, 5).map((l, i) => (
          <g key={i}>
            <text x="40" y={120 + i * 18} fontSize="8.5" fill="#222">{l.name}</text>
            <text x="300" y={120 + i * 18} fontSize="8.5" fill="#222" textAnchor="end">{l.qty}</text>
            <text x="372" y={121 + i * 18} fontSize="13" fill="#1d3fa8" textAnchor="end" fontFamily="'Segoe Script', 'Bradley Hand', cursive">
              {l.received}
            </text>
          </g>
        ))}
        {difference && (
          <text x="40" y="226" fontSize="12" fill="#1d3fa8" fontFamily="'Segoe Script', 'Bradley Hand', cursive" transform="rotate(-2 40 226)">
            2 packs damaged - box wet
          </text>
        )}
        <line x1="236" y1="258" x2="380" y2="258" stroke="#999" strokeWidth="0.6" />
        <text x="236" y="270" fontSize="7.5" fill="#666">Received by (signature and stamp)</text>
        <path d="M246 248c10-14 18 6 26-4s10-10 16 2 14-8 22-2" fill="none" stroke="#1d3fa8" strokeWidth="1.6" />
        <circle cx="350" cy="236" r="18" fill="none" stroke="#7a2e8c" strokeWidth="1.4" opacity="0.65" />
        <text x="350" y="239" fontSize="6" fill="#7a2e8c" textAnchor="middle" opacity="0.75">RECEIVED</text>
      </g>
    </svg>
  );
}

/** A photographed bank deposit or transfer slip. */
export function BankSlipImage({ variant, amount, reference, payer, when, className }: { variant: string; amount: number; reference: string; payer: string; when: string; className?: string }) {
  if (variant?.startsWith("data:") || variant?.startsWith("blob:"))
    return <img src={variant} alt={`Bank slip ${reference}`} className={cn("w-full rounded-xl object-contain shadow-soft", className)} />;
  const bank = variant === "slip-2" ? "People's Bank" : variant === "slip-3" ? "Commercial Bank" : "Bank of Ceylon";
  const color = variant === "slip-2" ? "#c8102e" : variant === "slip-3" ? "#0b4ea2" : "#f2b705";
  return (
    <svg viewBox="0 0 380 240" className={cn("w-full rounded-xl shadow-soft", className)} role="img" aria-label={`Bank slip ${reference}`}>
      <rect width="380" height="240" fill="#5d6670" />
      <g transform="rotate(1.2 190 120)">
        <rect x="18" y="16" width="344" height="208" rx="4" fill="#fdfdfb" />
        <rect x="18" y="16" width="344" height="30" rx="4" fill={color} />
        <text x="32" y="36" fontSize="12" fontWeight="700" fill="#fff">{bank}</text>
        <text x="348" y="36" fontSize="8" fill="#fff" textAnchor="end">Fund transfer receipt</text>
        {[
          ["Date and time", date(when)],
          ["From", payer],
          ["To account", "FemmeCare (Pvt) Ltd · 1000 4527 8812"],
          ["Reference", reference],
        ].map(([k, v], i) => (
          <g key={k}>
            <text x="32" y={70 + i * 24} fontSize="8" fill="#777">{k}</text>
            <text x="140" y={70 + i * 24} fontSize="9.5" fill="#222" fontWeight="600">{v}</text>
          </g>
        ))}
        <text x="32" y="184" fontSize="8" fill="#777">Amount</text>
        <text x="140" y="188" fontSize="17" fill="#111" fontWeight="700">{lkr(amount)}</text>
        <text x="348" y="212" fontSize="7" fill="#999" textAnchor="end">Status: SUCCESSFUL</text>
      </g>
    </svg>
  );
}

export function NativeSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50",
        className,
      )}
    >
      {children}
    </select>
  );
}
