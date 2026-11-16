// Date field that always shows day first (dd/mm/yyyy), whatever the computer's
// region setting. Typed dates are checked; the calendar button opens the
// browser's own date picker. The value stays an ISO date (yyyy-mm-dd).

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function toText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function toIso(text: string): string | undefined {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text.trim());
  if (!m) return undefined;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function DateInput({
  id,
  value,
  onChange,
  min,
  max,
  className,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  min?: string;
  max?: string;
  className?: string;
  disabled?: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(toText(value));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(toText(value));
    setBad(false);
  }, [value]);

  const commit = () => {
    if (!text.trim()) {
      setBad(false);
      if (value) onChange({ target: { value: "" } });
      return;
    }
    const iso = toIso(text);
    if (!iso || (min && iso < min) || (max && iso > max)) {
      setBad(true);
      return;
    }
    setBad(false);
    if (iso !== value) onChange({ target: { value: iso } });
    else setText(toText(iso));
  };

  return (
    <div className="relative">
      <Input
        id={id}
        value={text}
        disabled={disabled}
        placeholder="dd/mm/yyyy"
        inputMode="numeric"
        autoComplete="off"
        aria-invalid={bad || undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className={cn("pr-9 tabular", className)}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label="Choose a date"
        onClick={() => {
          const el = picker.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.focus();
          }
        }}
        className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <CalendarDays className="size-4" />
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange({ target: { value: e.target.value } })}
        className="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0"
      />
      {bad && <p className="mt-1 text-xs text-destructive">Enter a date as dd/mm/yyyy{min || max ? " within the allowed range" : ""}</p>}
    </div>
  );
}
