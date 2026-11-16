// C9 Profile: contact details (editable), personal details, bank details masked
// with "Change bank details" (waits for Finance to verify), sponsor read-only.

import { useState } from "react";
import { useNavigate } from "react-router";
import { Clock, Landmark, Lock, LogOut, Pencil, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar } from "@/components/fc/brand";
import { NativeSelect } from "@/components/fc/docs";
import { PageHeader, Status, StatusBadge } from "@/components/fc/ui";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { consultantById, fullName, STATUS_LABEL, validMobile } from "@/domain/consultants";
import { consultantCode, date, lkIso, maskTail } from "@/domain/format";
import { labels } from "@/domain/ext/consultant-app";
import { useConsultant } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { normMobile, SL_BANKS } from "@/public/Join";
import { SponsorCard } from "@/public/Invite";
import { Card, done, phone, SectionTitle } from "./bits";
import { signOut } from "./shell";

export function Profile() {
  usePageTitle("Profile");
  const c = useConsultant()!;
  const db = useDb();
  const L = labels(db);
  const navigate = useNavigate();
  const sponsor = consultantById(db, c.sponsorId);
  const [editing, setEditing] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);

  return (
    <div>
      <PageHeader title="Profile" />
      <Card className="flex items-center gap-4">
        <Avatar name={fullName(c)} hue={c.avatarHue} size="xl" />
        <div className="min-w-0">
          <div className="truncate font-display text-xl font-semibold">{fullName(c)}</div>
          <div className="text-sm text-muted-foreground">
            {L.one} {consultantCode(c.number)}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Status>{STATUS_LABEL[c.status]}</Status> Joined {date(c.joinedAt)}
          </div>
        </div>
      </Card>

      <SectionTitle
        action={
          !editing && (
            <Button size="sm" variant="ghost" className="rounded-full text-primary hover:text-primary" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" /> Edit
            </Button>
          )
        }
      >
        Contact details
      </SectionTitle>
      {editing ? (
        <ContactForm onDone={() => setEditing(false)} />
      ) : (
        <Card>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <KV k="Mobile" v={phone(c.mobile)} />
            <KV k="Email" v={c.email} />
            <KV k="Office number" v={phone(c.officePhone)} />
            <KV k="Home number" v={phone(c.homePhone)} />
            <KV k="Home address" v={[c.address, c.city, c.postalCode].filter(Boolean).join(", ")} wide />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">Orders are delivered to this address unless you choose another one at checkout.</p>
        </Card>
      )}

      <SectionTitle>Personal details</SectionTitle>
      <Card>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <KV k="Name" v={`${c.title} ${fullName(c)}`} />
          <KV k="NIC number" v={maskTail(c.nic, 3)} />
          <KV k="Date of birth" v={c.dob ? date(lkIso(c.dob, "12:00")) : undefined} />
          <KV k="Application" v={`${c.appRef}, ${date(c.appliedAt)}`} />
        </dl>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" /> To correct your name or NIC, call FemmeCare on {db.settings.company.phone}.
        </p>
      </Card>

      <SectionTitle
        action={
          <Button size="sm" variant="ghost" className="rounded-full text-primary hover:text-primary" onClick={() => setBankOpen(true)}>
            Change bank details
          </Button>
        }
      >
        Bank details
      </SectionTitle>
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Landmark className="size-5" />
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{c.bank.bank}</span>
              {c.bankVerified ? (
                <StatusBadge tone="success">
                  <ShieldCheck className="size-3" /> Verified
                </StatusBadge>
              ) : (
                <StatusBadge tone="warning">Not verified yet</StatusBadge>
              )}
            </div>
            <div className="mt-0.5 font-mono text-muted-foreground">{maskTail(c.bank.accountNumber)}</div>
            <div className="text-muted-foreground">
              {c.bank.accountName} · {c.bank.branch} branch
            </div>
          </div>
        </div>
        {c.pendingBank && (
          <div className="mt-4 rounded-xl bg-warning-soft p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="size-4 text-warning" /> New details sent
              </span>
              <Status>Pending verification</Status>
            </div>
            <div className="mt-1 text-muted-foreground">
              {c.pendingBank.bank}, account {maskTail(c.pendingBank.accountNumber)}, sent {date(c.pendingBank.requestedAt)}. FemmeCare checks them before your next payout; until then we pay into the account above.
            </div>
          </div>
        )}
        {!c.bankVerified && !c.pendingBank && <p className="mt-3 text-xs text-muted-foreground">Commission payouts are held until FemmeCare verifies these details.</p>}
      </Card>

      <SectionTitle>Sponsor</SectionTitle>
      {sponsor ? <SponsorCard c={sponsor} note={`Only FemmeCare can change your sponsor. Call ${db.settings.company.phone} if something is wrong.`} /> : <Card className="text-sm text-muted-foreground">No sponsor.</Card>}

      <Button variant="outline" className="mt-8 h-11 w-full rounded-full" onClick={() => signOut(navigate)}>
        <LogOut className="size-4" /> Sign out
      </Button>

      <BankDialog open={bankOpen} onOpenChange={setBankOpen} />
    </div>
  );
}

function KV({ k, v, wide }: { k: string; v?: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="mt-0.5 break-words font-medium">{v || <span className="font-normal text-muted-foreground">Not given</span>}</dd>
    </div>
  );
}

function ContactForm({ onDone }: { onDone: () => void }) {
  const c = useConsultant()!;
  const [f, setF] = useState({
    mobile: c.mobile,
    email: c.email,
    officePhone: c.officePhone ?? "",
    homePhone: c.homePhone ?? "",
    address: c.address,
    city: c.city,
    postalCode: c.postalCode,
  });
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const errors: Partial<Record<keyof typeof f, string>> = {
    mobile: !validMobile(normMobile(f.mobile)) ? "Enter a mobile number like 077 123 4567" : undefined,
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim()) ? "Enter a valid email address" : undefined,
    address: !f.address.trim() ? "Enter your home address" : undefined,
    postalCode: f.postalCode.trim() && !/^\d{5}$/.test(f.postalCode.trim()) ? "Postal codes have 5 digits" : undefined,
  };
  const err = (k: keyof typeof f) => (tried ? errors[k] : undefined);
  const save = () => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    const ok = done(
      actions.updateContact(c.id, {
        mobile: normMobile(f.mobile),
        email: f.email.trim().toLowerCase(),
        officePhone: f.officePhone.trim() ? normMobile(f.officePhone) : undefined,
        homePhone: f.homePhone.trim() ? normMobile(f.homePhone) : undefined,
        address: f.address.trim(),
        city: f.city.trim(),
        postalCode: f.postalCode.trim(),
      }),
      "Contact details saved",
    );
    if (ok) onDone();
  };
  return (
    <Card className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <F label="Mobile" error={err("mobile")}>
          <Input type="tel" value={f.mobile} onChange={set("mobile")} className="h-11" aria-invalid={!!err("mobile")} />
        </F>
        <F label="Email" error={err("email")}>
          <Input type="email" value={f.email} onChange={set("email")} className="h-11" aria-invalid={!!err("email")} />
        </F>
        <F label="Office number">
          <Input type="tel" value={f.officePhone} onChange={set("officePhone")} className="h-11" placeholder="Optional" />
        </F>
        <F label="Home number">
          <Input type="tel" value={f.homePhone} onChange={set("homePhone")} className="h-11" placeholder="Optional" />
        </F>
      </div>
      <F label="Home address" error={err("address")}>
        <Textarea rows={2} value={f.address} onChange={set("address")} aria-invalid={!!err("address")} />
      </F>
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <F label="City">
          <Input value={f.city} onChange={set("city")} className="h-11" />
        </F>
        <F label="Postal code" error={err("postalCode")}>
          <Input value={f.postalCode} onChange={set("postalCode")} inputMode="numeric" maxLength={5} className="h-11" aria-invalid={!!err("postalCode")} />
        </F>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" className="rounded-full" onClick={onDone}>
          Cancel
        </Button>
        <Button className="rounded-full px-5" onClick={save}>
          Save
        </Button>
      </div>
    </Card>
  );
}

function F({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  // the label wraps the field so the two are tied together for screen readers
  return (
    <div className="grid gap-1.5">
      <label className="grid gap-1.5 text-sm font-medium [&_input]:font-normal [&_select]:font-normal [&_textarea]:font-normal">
        <span>{label}</span>
        {children}
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function BankDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const c = useConsultant()!;
  const [f, setF] = useState({ accountName: fullName(c), accountNumber: "", bank: "", branch: "" });
  const [tried, setTried] = useState(false);
  const errors = {
    accountName: !f.accountName.trim() ? "Enter the name on the account" : "",
    accountNumber: !/^\d{6,18}$/.test(f.accountNumber.replace(/[\s-]/g, "")) ? "Account numbers have 6 to 18 digits" : "",
    bank: !f.bank ? "Choose the bank" : "",
    branch: !f.branch.trim() ? "Enter the branch" : "",
  };
  const save = () => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    const ok = done(
      actions.requestBankChange(c.id, { accountName: f.accountName.trim(), accountNumber: f.accountNumber.replace(/[\s-]/g, ""), bank: f.bank, branch: f.branch.trim() }),
      "Sent for verification",
    );
    if (ok) {
      onOpenChange(false);
      setTried(false);
      setF({ accountName: fullName(c), accountNumber: "", bank: "", branch: "" });
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change bank details</DialogTitle>
          <DialogDescription>FemmeCare's Finance team checks new details before the next payout. Until then, commission goes to your current account.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <F label="Account name" error={tried ? errors.accountName : undefined}>
            <Input value={f.accountName} onChange={(e) => setF({ ...f, accountName: e.target.value })} className="h-11" />
          </F>
          <F label="Account number" error={tried ? errors.accountNumber : undefined}>
            <Input value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value })} inputMode="numeric" className="h-11" />
          </F>
          <F label="Bank" error={tried ? errors.bank : undefined}>
            <NativeSelect value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} className="h-11">
              <option value="">Choose the bank</option>
              {SL_BANKS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </NativeSelect>
          </F>
          <F label="Branch" error={tried ? errors.branch : undefined}>
            <Input value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} className="h-11" />
          </F>
          {c.pendingBank && <p className="text-xs text-muted-foreground">This replaces the details you sent on {date(c.pendingBank.requestedAt)}.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Send for verification</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
