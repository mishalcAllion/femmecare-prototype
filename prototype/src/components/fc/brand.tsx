// FemmeCare logo (redrawn from the deck until the client sends the files),
// product pack illustrations and avatars.

import { useId } from "react";
import { cn } from "@/lib/utils";
import { initials } from "@/domain/format";
import type { Product } from "@/domain/types";

export function HeartMark({ className }: { className?: string }) {
  // unique id per instance: a shared id breaks the stroke when the first copy is hidden
  const gid = `fc-heart-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0566a" />
          <stop offset="1" stopColor="#c8305a" />
        </linearGradient>
      </defs>
      <path
        d="M24 41.5c-1 0-2-.4-2.7-1.1L8.6 28.2C4.3 24 4 17.2 8 12.9c4-4.3 10.5-4.4 14.6-.4l1.4 1.4 1.4-1.4c4.1-4 10.6-3.9 14.6.4 4 4.3 3.7 11.1-.6 15.3L26.7 40.4c-.7.7-1.7 1.1-2.7 1.1z"
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      <path d="M29.5 17.5l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3z" fill="#e8475a" />
    </svg>
  );
}

export function Logo({ className, tagline = false, light = false }: { className?: string; tagline?: boolean; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <HeartMark className="size-8 shrink-0" />
      <span className="flex flex-col leading-none">
        <span className={cn("font-display text-[1.35rem] font-semibold", light ? "text-white" : "text-foreground")}>
          Femme<span className={light ? "text-white" : "text-primary"}>Care</span>
        </span>
        {tagline && (
          <span className={cn("mt-1 text-[0.62rem] uppercase tracking-[0.16em]", light ? "text-white/80" : "text-muted-foreground")}>
            Sustainable Hygiene. Dignified Care.
          </span>
        )}
      </span>
    </span>
  );
}

/** Pack illustration drawn in the product's colour. */
export function ProductPack({ product, className }: { product: Pick<Product, "id" | "name" | "color" | "packSize" | "category">; className?: string }) {
  const c = product.color;
  const tube = product.category === "Skin care";
  const bottle = product.id === "FC005";
  const gid = `pk-${product.id}`;
  return (
    <svg viewBox="0 0 160 160" className={cn("block", className)} role="img" aria-label={product.name}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="0.95" />
          <stop offset="1" stopColor={c} stopOpacity="0.72" />
        </linearGradient>
        <linearGradient id={`${gid}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="0.1" />
          <stop offset="1" stopColor={c} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="22" fill={`url(#${gid}-bg)`} />
      <ellipse cx="80" cy="136" rx="46" ry="6" fill="#000" opacity="0.07" />
      {bottle ? (
        <g>
          <rect x="66" y="22" width="28" height="16" rx="4" fill="#fff" stroke={c} strokeWidth="2" />
          <path d="M58 42h44c4 0 7 3 7 7v76c0 5-4 9-9 9H60c-5 0-9-4-9-9V49c0-4 3-7 7-7z" fill={`url(#${gid})`} />
          <rect x="60" y="64" width="40" height="40" rx="8" fill="#fff" opacity="0.93" />
        </g>
      ) : tube ? (
        <g>
          <path d="M52 30h56l-6 98c0 4-3 6-7 6H65c-4 0-7-2-7-6z" fill={`url(#${gid})`} />
          <rect x="64" y="20" width="32" height="12" rx="3" fill="#fff" stroke={c} strokeWidth="2" />
          <rect x="62" y="62" width="36" height="38" rx="8" fill="#fff" opacity="0.93" />
        </g>
      ) : (
        <g>
          <rect x="30" y="34" width="100" height="98" rx="16" fill={`url(#${gid})`} />
          <path d="M30 56h100" stroke="#fff" strokeOpacity="0.35" strokeWidth="2" />
          <rect x="44" y="66" width="72" height="46" rx="10" fill="#fff" opacity="0.93" />
          <circle cx="114" cy="46" r="5" fill="#fff" opacity="0.8" />
        </g>
      )}
      <g transform={bottle || tube ? "translate(80 83)" : "translate(80 89)"}>
        <path
          d="M0 9c-.4 0-.8-.2-1.1-.4L-6.2 3.6C-8 1.9-8.1-.9-6.5-2.6c1.6-1.7 4.2-1.8 5.9-.2l.6.6.6-.6c1.7-1.6 4.3-1.5 5.9.2 1.6 1.7 1.5 4.5-.3 6.2L1.1 8.6C.8 8.8.4 9 0 9z"
          fill="none"
          stroke={c}
          strokeWidth="1.6"
          transform="translate(0 -8) scale(1.4)"
        />
        <text y="11" textAnchor="middle" fontSize="7.5" fontWeight="700" fill={c} fontFamily="Inter Variable, sans-serif">
          FemmeCare
        </text>
      </g>
      <text x="80" y={bottle || tube ? 126 : 124} textAnchor="middle" fontSize="8" fill="#fff" fontWeight="600" fontFamily="Inter Variable, sans-serif">
        {product.packSize}
      </text>
    </svg>
  );
}

export function Avatar({ name, hue = 350, size = "md", className }: { name: string; hue?: number; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const s = { sm: "size-7 text-[0.65rem]", md: "size-9 text-xs", lg: "size-12 text-sm", xl: "size-16 text-lg" }[size];
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", s, className)}
      style={{ background: `linear-gradient(135deg, oklch(0.68 0.15 ${hue}), oklch(0.52 0.16 ${(hue + 30) % 360}))` }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
