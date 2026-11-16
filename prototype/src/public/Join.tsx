// W4 Join form (five steps, PRD M8) and W5 Application received.
// Each field is checked the same way submitApplication checks it, so the
// applicant sees a problem next to the field before sending.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, ArrowRight, Check, CircleCheck, Eye, EyeOff, FileText, Info, Loader2, Mail, MessageSquare, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/fc/docs";
import { getDb, useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { consultantByNumber, duplicateCheck, parseNic, sponsorCheck, validMobile } from "@/domain/consultants";
import { consultantCode, date, lkIso, lkr } from "@/domain/format";
import { labels, parseConsultantNumber, passwordProblem } from "@/domain/ext/consultant-app";
import type { Db } from "@/domain/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/lib/title";
import { SponsorCard } from "./Invite";
import { earningExample } from "./earn";

const STEPS = ["Sponsor", "Personal details", "Contact", "Bank details", "Declaration"] as const;

export const SL_BANKS = [
  "Bank of Ceylon",
  "People's Bank",
  "Commercial Bank",
  "Hatton National Bank",
  "Sampath Bank",
  "Seylan Bank",
  "National Savings Bank",
  "Nations Trust Bank",
  "DFCC Bank",
  "NDB Bank",
  "Pan Asia Bank",
  "Union Bank",
  "Amana Bank",
  "Cargills Bank",
  "HSBC",
  "Standard Chartered",
];

interface Form {
  sponsorMode: "link" | "number" | "none";
  sponsorInput: string;
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
  officePhone: string;
  homePhone: string;
  accountName: string;
  accountNumber: string;
  bank: string;
  branch: string;
  acceptTerms: boolean;
  acceptPlan: boolean;
  truthful: boolean;
  consent: boolean;
  password: string;
  password2: string;
}

const EMPTY: Form = {
  sponsorMode: "number",
  sponsorInput: "",
  title: "Ms",
  givenName: "",
  surname: "",
  nic: "",
  dob: "",
  address: "",
  city: "",
  postalCode: "",
  mobile: "",
  email: "",
  officePhone: "",
  homePhone: "",
  accountName: "",
  accountNumber: "",
  bank: "",
  branch: "",
  acceptTerms: false,
  acceptPlan: false,
  truthful: false,
  consent: false,
  password: "",
  password2: "",
};

const DRAFT_KEY = "fc:join-draft";

export function normMobile(s: string) {
  let v = s.replace(/[\s-]/g, "");
  if (v.startsWith("+94")) v = `0${v.slice(3)}`;
  else if (/^94\d{9}$/.test(v)) v = `0${v.slice(2)}`;
  return v;
}

function validPhone(s: string) {
  return /^0\d{9}$/.test(normMobile(s));
}

type Errors = Partial<Record<keyof Form | "sponsor", string>>;

function validate(db: Db, f: Form, step: number, refNumber?: number): Errors {
  const e: Errors = {};
  const L = labels(db);
  if (step === 0) {
    if (f.sponsorMode === "link") {
      const c = sponsorCheck(db, refNumber);
      if (!c.ok) e.sponsor = c.message;
    } else if (f.sponsorMode === "number") {
      if (!f.sponsorInput.trim()) e.sponsorInput = `Enter your sponsor's ${L.lower} number, or choose "I don't have a sponsor"`;
      else {
        const n = parseConsultantNumber(f.sponsorInput);
        if (n === undefined) e.sponsorInput = "Enter a number like FC00006, or just 6";
        else {
          const c = sponsorCheck(db, n);
          if (!c.ok) e.sponsorInput = c.message;
        }
      }
    }
  }
  if (step === 1) {
    if (!f.givenName.trim()) e.givenName = "Enter your given name";
    if (!f.surname.trim()) e.surname = "Enter your surname";
    if (!f.nic.trim()) e.nic = "Enter your NIC number";
    else {
      const p = parseNic(f.nic);
      if (!p.valid) e.nic = p.message;
      else {
        const dup = duplicateCheck(db, { nic: f.nic.trim().toUpperCase() });
        if (dup) e.nic = dup;
      }
    }
    if (!f.address.trim()) e.address = "Enter your home address";
    if (f.postalCode.trim() && !/^\d{5}$/.test(f.postalCode.trim())) e.postalCode = "Postal codes have 5 digits";
  }
  if (step === 2) {
    if (!f.mobile.trim()) e.mobile = "Enter your mobile number";
    else if (!validMobile(normMobile(f.mobile))) e.mobile = "Enter a mobile number like 077 123 4567";
    else {
      const dup = duplicateCheck(db, { mobile: normMobile(f.mobile) });
      if (dup) e.mobile = dup;
    }
    if (!f.email.trim()) e.email = "Enter your email address";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = "Enter an email address like name@example.com";
    else {
      const dup = duplicateCheck(db, { email: f.email.trim().toLowerCase() });
      if (dup) e.email = dup;
    }
    if (f.officePhone.trim() && !validPhone(f.officePhone)) e.officePhone = "Enter a 10-digit number like 011 234 5678";
    if (f.homePhone.trim() && !validPhone(f.homePhone)) e.homePhone = "Enter a 10-digit number like 011 234 5678";
  }
  if (step === 3) {
    if (!f.accountName.trim()) e.accountName = "Enter the name on the account";
    if (!f.accountNumber.trim()) e.accountNumber = "Enter the account number";
    else if (!/^\d{6,18}$/.test(f.accountNumber.replace(/[\s-]/g, ""))) e.accountNumber = "Account numbers have 6 to 18 digits";
    if (!f.bank) e.bank = "Choose your bank";
    if (!f.branch.trim()) e.branch = "Enter the branch";
  }
  if (step === 4) {
    if (!f.acceptTerms) e.acceptTerms = "Please accept the terms and conditions";
    if (!f.acceptPlan) e.acceptPlan = "Please accept the benefit plan and policy manual";
    if (!f.truthful) e.truthful = "Please confirm your details are true";
    if (!f.consent) e.consent = "Needed so your sponsor can see your sales";
    const p = passwordProblem(f.password);
    if (!f.password) e.password = "Choose a password";
    else if (p) e.password = p;
    if (f.password && f.password2 !== f.password) e.password2 = "The passwords don't match";
  }
  return e;
}

function loadDraft(): Partial<Form> {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Partial<Form>) : {};
  } catch {
    return {};
  }
}

/** Remount the form when the invite or sponsor choice in the address changes. */
export function JoinPage() {
  const [params] = useSearchParams();
  return <JoinForm key={`${params.get("ref") ?? ""}|${params.get("sponsor") ?? ""}`} />;
}

function JoinForm() {
  const db = useDb();
  const L = labels(db);
  usePageTitle(`Apply to become ${L.a}`);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const refNumber = parseConsultantNumber(params.get("ref") ?? "");
  const refCheck = refNumber !== undefined ? sponsorCheck(db, refNumber) : undefined;
  const refSponsor = refNumber !== undefined && refCheck?.ok ? consultantByNumber(db, refNumber) : undefined;
  const linkInvalid = params.has("ref") && !refSponsor;

  const [f, setF] = useState<Form>(() => {
    const draft = loadDraft();
    const base = { ...EMPTY, ...draft, password: "", password2: "" };
    if (refSponsor) return { ...base, sponsorMode: "link" };
    if (params.get("sponsor") === "none") return { ...base, sponsorMode: "none" };
    return { ...base, sponsorMode: base.sponsorMode === "link" ? "number" : base.sponsorMode };
  });
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>({});
  const [tried, setTried] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState<"terms" | "plan" | "policy">();
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    try {
      const { password: _p, password2: _q, ...rest } = f;
      void _p;
      void _q;
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(rest));
    } catch {
      /* storage blocked */
    }
  }, [f]);

  const errors = useMemo(() => validate(db, f, step, refNumber), [db, f, step, refNumber]);
  const show = (k: keyof Form | "sponsor") => (tried[step] || (k !== "sponsor" && touched[k as keyof Form]) ? errors[k] : undefined);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const blur = (k: keyof Form) => () => setTouched((t) => ({ ...t, [k]: true }));

  const nic = parseNic(f.nic);
  const dobFromNic = nic.valid ? nic.dob : undefined;
  const typedSponsorN = parseConsultantNumber(f.sponsorInput);
  const typedSponsor = f.sponsorMode === "number" && typedSponsorN !== undefined ? sponsorCheck(db, typedSponsorN) : undefined;

  const next = () => {
    setTried((t) => ({ ...t, [step]: true }));
    if (Object.keys(errors).length) {
      const first = Object.keys(errors)[0];
      window.setTimeout(() => document.getElementById(`f-${first}`)?.focus(), 30);
      return;
    }
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    submit();
  };

  const submit = () => {
    // check every step once more before sending
    for (let i = 0; i < STEPS.length; i++) {
      if (Object.keys(validate(db, f, i, refNumber)).length) {
        setStep(i);
        setTried((t) => ({ ...t, [i]: true }));
        return;
      }
    }
    setBusy(true);
    window.setTimeout(() => {
      const sponsorNumber = f.sponsorMode === "link" ? refNumber : f.sponsorMode === "number" ? parseConsultantNumber(f.sponsorInput) : undefined;
      const r = actions.submitApplication({
        title: f.title,
        givenName: f.givenName,
        surname: f.surname,
        nic: f.nic.trim().toUpperCase(),
        dob: dobFromNic ?? f.dob,
        address: f.address.trim(),
        city: f.city.trim(),
        postalCode: f.postalCode.trim(),
        mobile: normMobile(f.mobile),
        email: f.email.trim(),
        officePhone: f.officePhone.trim() ? normMobile(f.officePhone) : undefined,
        homePhone: f.homePhone.trim() ? normMobile(f.homePhone) : undefined,
        bank: { accountName: f.accountName.trim(), accountNumber: f.accountNumber.replace(/[\s-]/g, ""), bank: f.bank, branch: f.branch.trim() },
        sponsorNumber,
        joinedVia: f.sponsorMode,
        consentShareWithSponsor: f.consent,
        acceptedTerms: f.acceptTerms && f.acceptPlan && f.truthful,
        password: f.password,
      });
      setBusy(false);
      if (!r.ok) {
        // send the applicant back to the field the problem is about
        const msg = r.error;
        const where = /NIC/i.test(msg) ? 1 : /mobile|email/i.test(msg) ? 2 : /sponsor|number/i.test(msg) ? 0 : 4;
        setStep(where);
        setTried((t) => ({ ...t, [where]: true }));
        toast.error(msg);
        return;
      }
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* storage blocked */
      }
      const app = getDb().consultants.find((c) => c.id === r.value);
      navigate(`/join/done?ref=${app?.appRef ?? ""}`, { replace: true });
    }, 900);
  };

  const sponsorForSummary =
    f.sponsorMode === "link" ? refSponsor : f.sponsorMode === "number" ? (typedSponsor?.ok ? typedSponsor.sponsor : undefined) : consultantByNumber(db, 1);

  return (
    <div className="animate-rise bg-blush px-4 pb-16 pt-8 sm:px-6 md:pt-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{L.one} registration</div>
          <h1 className="mt-1 font-display text-3xl font-semibold md:text-4xl">Apply to become {L.a}</h1>
          <p className="mt-2 text-muted-foreground">Five short steps. We check every application within two working days.</p>
        </div>

        <Progress step={step} />

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
          className="mt-5 rounded-3xl bg-card p-5 shadow-lift ring-1 ring-inset ring-border/60 sm:p-8"
        >
          <h2 className="font-display text-xl font-semibold">{STEPS[step]}</h2>

          {step === 0 && (
            <div className="mt-5 space-y-4">
              {linkInvalid && (
                <Notice tone="warning">
                  The invitation link you used is no longer active. Enter another {L.lower}'s number, or join FemmeCare's own team.
                </Notice>
              )}
              {f.sponsorMode === "link" && refSponsor ? (
                <>
                  <SponsorCard c={refSponsor} note="Set by your invitation link" />
                  {show("sponsor") && <p className="text-sm text-destructive">{show("sponsor")}</p>}
                  <p className="text-sm text-muted-foreground">
                    {refSponsor.givenName} will be your sponsor: you join {refSponsor.givenName}'s team. Not the right person?{" "}
                    <Link to="/join" className="text-primary hover:underline" onClick={() => set("sponsorMode", "number")}>
                      Apply without this link
                    </Link>
                    .
                  </p>
                </>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Choice active={f.sponsorMode === "number"} onClick={() => set("sponsorMode", "number")} title="I have a sponsor" body={`The ${L.lower} who introduced me`} />
                    <Choice active={f.sponsorMode === "none"} onClick={() => set("sponsorMode", "none")} title="I don't have a sponsor" body="Join FemmeCare's own team" />
                  </div>
                  {f.sponsorMode === "number" ? (
                    <div className="space-y-3">
                      <Field id="sponsorInput" label={`Sponsor's ${L.lower} number`} required error={show("sponsorInput")} hint="For example FC00006, or just 6. Ask your sponsor if you're not sure.">
                        <Input
                          id="f-sponsorInput"
                          value={f.sponsorInput}
                          onChange={(e) => set("sponsorInput", e.target.value)}
                          onBlur={blur("sponsorInput")}
                          placeholder="FC00006"
                          autoComplete="off"
                          aria-invalid={!!show("sponsorInput")}
                          className="h-11 uppercase"
                        />
                      </Field>
                      {typedSponsor?.ok && typedSponsor.sponsor && <SponsorCard c={typedSponsor.sponsor} note="Is this your sponsor? Continue to confirm." />}
                    </div>
                  ) : (
                    <SponsorCard c={consultantByNumber(db, 1)!} note={`You can still introduce your own team once you're ${L.a}.`} />
                  )}
                </>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="mt-5 grid gap-4 sm:grid-cols-6">
              <Field id="title" label="Title" className="sm:col-span-2">
                <NativeSelect id="f-title" value={f.title} onChange={(e) => set("title", e.target.value)} className="h-11">
                  {["Ms", "Mrs", "Miss", "Mr", "Dr"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field id="givenName" label="Given name" required error={show("givenName")} className="sm:col-span-4">
                <Input id="f-givenName" value={f.givenName} onChange={(e) => set("givenName", e.target.value)} onBlur={blur("givenName")} autoComplete="given-name" aria-invalid={!!show("givenName")} className="h-11" />
              </Field>
              <Field id="surname" label="Surname" required error={show("surname")} className="sm:col-span-6">
                <Input id="f-surname" value={f.surname} onChange={(e) => set("surname", e.target.value)} onBlur={blur("surname")} autoComplete="family-name" aria-invalid={!!show("surname")} className="h-11" />
              </Field>
              <Field id="nic" label="NIC number" required error={show("nic")} hint="Old format, 9 digits and V or X, or the new 12-digit format" className="sm:col-span-3">
                <Input id="f-nic" value={f.nic} onChange={(e) => set("nic", e.target.value.toUpperCase())} onBlur={blur("nic")} placeholder="925431234V" autoComplete="off" aria-invalid={!!show("nic")} className="h-11 uppercase" maxLength={12} />
              </Field>
              <Field id="dob" label="Date of birth" hint="Filled in from your NIC number" className="sm:col-span-3">
                <Input id="f-dob" value={dobFromNic ? date(lkIso(dobFromNic, "12:00")) : ""} readOnly placeholder="From your NIC" className="h-11 bg-muted/50" tabIndex={-1} />
              </Field>
              <Field id="address" label="Home address" required error={show("address")} className="sm:col-span-6">
                <Textarea id="f-address" value={f.address} onChange={(e) => set("address", e.target.value)} onBlur={blur("address")} rows={2} autoComplete="street-address" aria-invalid={!!show("address")} />
              </Field>
              <Field id="city" label="City" className="sm:col-span-4">
                <Input id="f-city" value={f.city} onChange={(e) => set("city", e.target.value)} autoComplete="address-level2" className="h-11" />
              </Field>
              <Field id="postalCode" label="Postal code" error={show("postalCode")} className="sm:col-span-2">
                <Input id="f-postalCode" value={f.postalCode} onChange={(e) => set("postalCode", e.target.value)} onBlur={blur("postalCode")} inputMode="numeric" maxLength={5} autoComplete="postal-code" aria-invalid={!!show("postalCode")} className="h-11" />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field id="mobile" label="Mobile number" required error={show("mobile")} hint="We text you about your application and orders">
                <Input id="f-mobile" type="tel" value={f.mobile} onChange={(e) => set("mobile", e.target.value)} onBlur={blur("mobile")} placeholder="077 123 4567" autoComplete="tel" inputMode="tel" aria-invalid={!!show("mobile")} className="h-11" />
              </Field>
              <Field id="email" label="Email" required error={show("email")} hint="Your sign-in and statements come here">
                <Input id="f-email" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} onBlur={blur("email")} placeholder="name@example.com" autoComplete="email" aria-invalid={!!show("email")} className="h-11" />
              </Field>
              <Field id="officePhone" label="Office number" error={show("officePhone")}>
                <Input id="f-officePhone" type="tel" value={f.officePhone} onChange={(e) => set("officePhone", e.target.value)} onBlur={blur("officePhone")} placeholder="Optional" inputMode="tel" aria-invalid={!!show("officePhone")} className="h-11" />
              </Field>
              <Field id="homePhone" label="Home number" error={show("homePhone")}>
                <Input id="f-homePhone" type="tel" value={f.homePhone} onChange={(e) => set("homePhone", e.target.value)} onBlur={blur("homePhone")} placeholder="Optional" inputMode="tel" aria-invalid={!!show("homePhone")} className="h-11" />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="mt-5 space-y-4">
              <Notice tone="info">Your commission is paid into this account each month. It must be in your own name; we check it before the first payment.</Notice>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="accountName" label="Account name" required error={show("accountName")} className="sm:col-span-2">
                  <Input
                    id="f-accountName"
                    value={f.accountName}
                    onChange={(e) => set("accountName", e.target.value)}
                    onFocus={() => !f.accountName && f.givenName && set("accountName", `${f.givenName} ${f.surname}`.trim())}
                    onBlur={blur("accountName")}
                    aria-invalid={!!show("accountName")}
                    className="h-11"
                  />
                </Field>
                <Field id="accountNumber" label="Account number" required error={show("accountNumber")}>
                  <Input id="f-accountNumber" value={f.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} onBlur={blur("accountNumber")} inputMode="numeric" autoComplete="off" aria-invalid={!!show("accountNumber")} className="h-11" />
                </Field>
                <Field id="bank" label="Bank" required error={show("bank")}>
                  <NativeSelect id="f-bank" value={f.bank} onChange={(e) => set("bank", e.target.value)} onBlur={blur("bank")} aria-invalid={!!show("bank")} className="h-11">
                    <option value="">Choose your bank</option>
                    {SL_BANKS.map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field id="branch" label="Branch" required error={show("branch")} className="sm:col-span-2">
                  <Input id="f-branch" value={f.branch} onChange={(e) => set("branch", e.target.value)} onBlur={blur("branch")} placeholder="e.g. Maharagama" aria-invalid={!!show("branch")} className="h-11" />
                </Field>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="mt-5 space-y-5">
              {sponsorForSummary && (
                <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-sm">
                  <UserCheck className="size-4 text-primary" />
                  Sponsor:{" "}
                  <span className="font-medium">{sponsorForSummary.number === 1 ? "FemmeCare (No. 1)" : `${sponsorForSummary.givenName} ${sponsorForSummary.surname}, ${consultantCode(sponsorForSummary.number)}`}</span>
                </div>
              )}
              <div className="space-y-3">
                <Tick id="acceptTerms" checked={f.acceptTerms} onChange={(v) => set("acceptTerms", v)} error={show("acceptTerms")}>
                  I accept the{" "}
                  <DocLink onClick={() => setDoc("terms")}>terms and conditions</DocLink>
                </Tick>
                <Tick id="acceptPlan" checked={f.acceptPlan} onChange={(v) => set("acceptPlan", v)} error={show("acceptPlan")}>
                  I have read and accept the <DocLink onClick={() => setDoc("plan")}>benefit plan</DocLink> and the <DocLink onClick={() => setDoc("policy")}>policy manual</DocLink>
                </Tick>
                <Tick id="truthful" checked={f.truthful} onChange={(v) => set("truthful", v)} error={show("truthful")}>
                  The details I have given are true and complete
                </Tick>
                <Tick id="consent" checked={f.consent} onChange={(v) => set("consent", v)} error={show("consent")}>
                  I agree that my sponsor can see my name, joining date, status and monthly sales. They never see my NIC, contact or bank details.
                </Tick>
              </div>
              <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
                <Field id="password" label="Choose a password" required error={show("password")} hint="At least 8 characters, with a number">
                  <div className="relative">
                    <Input id="f-password" type={showPw ? "text" : "password"} value={f.password} onChange={(e) => set("password", e.target.value)} onBlur={blur("password")} autoComplete="new-password" aria-invalid={!!show("password")} className="h-11 pr-10" />
                    <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={showPw ? "Hide password" : "Show password"}>
                      {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </Field>
                <Field id="password2" label="Type it again" required error={show("password2")}>
                  <Input id="f-password2" type={showPw ? "text" : "password"} value={f.password2} onChange={(e) => set("password2", e.target.value)} onBlur={blur("password2")} autoComplete="new-password" aria-invalid={!!show("password2")} className="h-11" />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">You sign in with your {L.lower} number or email and this password once your application is approved.</p>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
            {step > 0 ? (
              <Button type="button" variant="ghost" className="h-11 rounded-full px-4" onClick={() => setStep(step - 1)} disabled={busy}>
                <ArrowLeft className="size-4" /> Back
              </Button>
            ) : (
              <Button type="button" variant="ghost" className="h-11 rounded-full px-4" nativeButton={false} render={<Link to="/" />}>
                Cancel
              </Button>
            )}
            <Button type="submit" className="h-11 min-w-36 rounded-full px-6" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Sending
                </>
              ) : step === STEPS.length - 1 ? (
                <>
                  Send application <Check className="size-4" />
                </>
              ) : (
                <>
                  Next <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </div>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Your details are kept private and used only to run your {L.lower} account. Questions? Call {db.settings.company.phone}.
        </p>
      </div>
      <DocDialog doc={doc} onClose={() => setDoc(undefined)} />
    </div>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm sm:hidden">
        <span className="font-medium">
          Step {step + 1} of {STEPS.length}
        </span>
        <span className="text-muted-foreground">{STEPS[step]}</span>
      </div>
      <div className="mt-2 flex gap-1.5 sm:hidden" aria-hidden="true">
        {STEPS.map((s, i) => (
          <div key={s} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-border")} />
        ))}
      </div>
      <ol className="hidden items-center sm:flex" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("flex items-center", i < STEPS.length - 1 && "flex-1")}>
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary text-primary-foreground ring-4 ring-primary/20" : "bg-card text-muted-foreground ring-1 ring-border",
                )}
                aria-current={i === step ? "step" : undefined}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn("whitespace-nowrap text-xs", i === step ? "font-semibold text-foreground" : "text-muted-foreground")}>{s}</span>
            </span>
            {i < STEPS.length - 1 && <span className={cn("mx-2 h-px flex-1", i < step ? "bg-primary" : "bg-border")} />}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Field({ id, label, required, error, hint, className, children }: { id: string; label: string; required?: boolean; error?: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={`f-${id}`}>
        {label}
        {required && <span className="text-primary">*</span>}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Choice({ active, onClick, title, body }: { active: boolean; onClick: () => void; title: string; body: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("flex items-start gap-3 rounded-2xl border p-4 text-left transition", active ? "border-primary bg-brand-soft/60 ring-1 ring-primary" : "border-border hover:border-primary/40")}
    >
      <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2", active ? "border-primary" : "border-muted-foreground/40")}>
        {active && <span className="size-2.5 rounded-full bg-primary" />}
      </span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}

function Tick({ id, checked, onChange, error, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; error?: string; children: ReactNode }) {
  return (
    <div>
      <div
        onClick={(e) => {
          // the whole row ticks the box, except the box itself and links inside the text
          if ((e.target as HTMLElement).closest("[data-slot=checkbox], button, a, input")) return;
          onChange(!checked);
        }}
        className={cn("flex cursor-pointer select-none items-start gap-3 rounded-xl border p-3 text-sm leading-relaxed transition", error ? "border-destructive/50 bg-danger-soft/40" : "border-border hover:bg-muted/40")}
      >
        <Checkbox id={`f-${id}`} checked={checked} onCheckedChange={(v) => onChange(!!v)} className="mt-0.5" aria-invalid={!!error} aria-labelledby={`t-${id}`} />
        <span id={`t-${id}`}>{children}</span>
      </div>
      {error && <p className="mt-1 pl-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function DocLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className="font-medium text-primary underline-offset-2 hover:underline"
    >
      {children}
    </button>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warning" | "success"; children: ReactNode }) {
  return (
    <div className={cn("flex gap-2.5 rounded-xl px-3.5 py-3 text-sm", tone === "warning" ? "bg-warning-soft text-[oklch(0.42_0.1_65)]" : tone === "success" ? "bg-success-soft text-success" : "bg-info-soft text-[oklch(0.4_0.1_245)]")}>
      <Info className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function DocDialog({ doc, onClose }: { doc?: "terms" | "plan" | "policy"; onClose: () => void }) {
  const db = useDb();
  const L = labels(db);
  const x = earningExample(db);
  const s = db.settings.commission;
  const content: Record<"terms" | "plan" | "policy", { title: string; version: string; points: string[] }> = {
    terms: {
      title: "Terms and conditions",
      version: "Version 1.0, January 2027",
      points: [
        `You join as an independent ${L.lower}, not an employee of ${db.settings.company.name}.`,
        "There is no joining fee and no minimum order. You buy only what you need.",
        "Orders are dispatched once fully paid. Cancellations are possible until the order leaves the warehouse.",
        "FemmeCare may suspend or close an account that breaks the policy manual, after telling you why.",
        "Your sponsor can only be changed by FemmeCare.",
        "We keep your details private and use them only to run your account, as described in our privacy notice.",
      ],
    },
    plan: {
      title: "Benefit plan",
      version: "Version 1.0, January 2027",
      points: [
        `You buy at ${x.marginPct}% below the MRP and keep the difference when you sell at the MRP. FemmeCare does not pay this margin; it is yours at the point of sale.`,
        `Each month, FemmeCare pays you ${s.rate}% of your direct team's ${s.base === "mrp" ? "sales at MRP value" : "purchases (net of the margin)"}.`,
        `Commission is paid when your team's sales${s.thresholdCounts === "team_plus_own" ? " plus your own" : ""} reach ${lkr(s.threshold, { decimals: false })} in the month.`,
        "Commission is single level: you earn on the people you introduce, not on the people they introduce.",
        "Sales count in the month they are paid. Cancelled and refunded orders, tax and delivery charges don't count.",
        "Commission is paid by bank transfer after the month is closed, usually by the 5th. A refund after the close is taken off your next payment.",
      ],
    },
    policy: {
      title: "Policy manual",
      version: "Version 1.0, January 2027",
      points: [
        "Sell at or below the printed MRP. Don't sell on public marketplaces.",
        "Describe products honestly. Don't make medical claims.",
        "Keep customers' details private.",
        "Use your own name and bank account. One account per person.",
        "Tell FemmeCare about damaged or short deliveries within 3 days of receiving them.",
      ],
    },
  };
  const c = doc ? content[doc] : undefined;
  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        {c && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="size-4 text-primary" /> {c.title}
              </DialogTitle>
              <DialogDescription>{c.version}. A summary of the key points.</DialogDescription>
            </DialogHeader>
            <ol className="grid list-decimal gap-2 pl-5 text-sm leading-relaxed">
              {c.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
            <Button onClick={onClose} className="h-10 rounded-full">
              Close
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- W5 ----------

export function JoinDone() {
  const db = useDb();
  const L = labels(db);
  const [params] = useSearchParams();
  const ref = params.get("ref") ?? "";
  const app = db.consultants.find((c) => c.appRef === ref);
  usePageTitle(app ? "Application received" : "Application");
  const sponsor = app ? db.consultants.find((c) => c.id === app.sponsorId) : undefined;
  if (!app) {
    return (
      <div className="px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">We couldn't find that application</h1>
        <p className="mt-2 text-muted-foreground">If you applied, check your email for the reference number.</p>
        <Button nativeButton={false} render={<Link to="/join" />} className="mt-6 h-11 rounded-full px-6">
          Apply to join
        </Button>
      </div>
    );
  }
  return (
    <div className="animate-rise bg-blush px-4 py-12 sm:px-6 md:py-20">
      <div className="mx-auto max-w-xl rounded-3xl bg-card p-6 shadow-lift ring-1 ring-inset ring-border/60 sm:p-10">
        <div className="animate-pop mx-auto flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
          <CircleCheck className="size-9" />
        </div>
        <h1 className="mt-5 text-center font-display text-3xl font-semibold">Application received</h1>
        <p className="mt-2 text-center text-muted-foreground">
          Thank you, {app.givenName}. Your reference is <span className="font-semibold text-foreground">{app.appRef}</span>.
        </p>
        <div className="mt-6 grid gap-2 rounded-2xl bg-muted/50 p-4 text-sm">
          <div className="flex items-start gap-2">
            <Mail className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="min-w-0 break-words">
              We emailed a copy to <span className="font-medium">{app.email}</span>
            </span>
          </div>
          {sponsor && (
            <div className="flex items-start gap-2">
              <UserCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Sponsor: <span className="font-medium">{sponsor.number === 1 ? "FemmeCare (No. 1)" : `${sponsor.givenName} ${sponsor.surname}`}</span>
              </span>
            </div>
          )}
        </div>
        <h2 className="mt-8 font-semibold">What happens next</h2>
        <ol className="mt-3 space-y-4">
          {[
            ["We check your details", "Your NIC, contact and bank details. This takes up to two working days."],
            [`You get your ${L.lower} number`, "By email and SMS, with a link to sign in. If we need anything else, we'll call you."],
            ["Sign in and start", "Order at your price, track deliveries and share your own invite link."],
          ].map(([t, b], i) => (
            <li key={t} className="flex gap-3">
              <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{i + 1}</span>
              <div>
                <div className="font-medium">{t}</div>
                <div className="text-sm text-muted-foreground">{b}</div>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-8 grid gap-2 sm:grid-cols-2">
          <Button nativeButton={false} render={<Link to="/products" />} className="h-11 rounded-full">
            See the products
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link to="/" />} className="h-11 rounded-full">
            Back to home
          </Button>
        </div>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <MessageSquare className="size-3.5" /> Questions? Call {db.settings.company.phone}
        </p>
      </div>
    </div>
  );
}
