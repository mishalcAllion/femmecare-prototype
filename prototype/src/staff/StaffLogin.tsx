// Staff sign-in: email, then a one-time code sent by email (ADM-02).
// The code lands in the demo Outbox; presenter mode fills it in.

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/fc/brand";
import { mutate, sendMessage, useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { act } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";

export function StaffLogin() {
  usePageTitle("Staff sign-in");
  const db = useDb();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (db.meta.session.kind === "staff") navigate(params.get("next") || "/staff", { replace: true });
  }, [db.meta.session, navigate, params]);

  const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());

  const sendCode = () => {
    setError("");
    if (!user) return setError("We don't recognise that email address. Use your work email.");
    if (user.status !== "active") return setError("This account has been deactivated. Contact your administrator.");
    const c = String(100000 + Math.floor(Math.random() * 900000));
    setSent(c);
    mutate(
      (d) =>
        sendMessage(d, {
          channel: "email",
          to: user.email,
          toName: user.name,
          subject: `Your FemmeCare sign-in code: ${c}`,
          body: `Hello ${user.name.split(" ")[0]},\n\nYour sign-in code is ${c}. It expires in 10 minutes.\n\nIf you didn't try to sign in, tell your administrator.`,
        }),
      { silent: true },
    );
    setStep("code");
    if (db.meta.presenterMode) setTimeout(() => setCode(c), 600);
  };

  const verify = () => {
    if (code.replace(/\s/g, "") !== sent) return setError("That code is not right. Check the latest email.");
    setBusy(true);
    setTimeout(() => {
      if (user && act(actions.signInStaff(user.id)) !== undefined) navigate(params.get("next") || "/staff", { replace: true });
      setBusy(false);
    }, 450);
  };

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-brand-gradient p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo light tagline />
        <div className="max-w-md">
          <h1 className="font-display text-4xl font-semibold leading-tight">Everything FemmeCare sells, in one place.</h1>
          <p className="mt-4 text-white/85">Retail outlet orders, consultant orders, stock, deliveries, invoices and commission, for every team.</p>
        </div>
        <div className="text-sm text-white/70">{db.settings.company.name}</div>
        <svg className="pointer-events-none absolute -right-24 -top-24 size-[420px] opacity-15" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M24 41.5c-1 0-2-.4-2.7-1.1L8.6 28.2C4.3 24 4 17.2 8 12.9c4-4.3 10.5-4.4 14.6-.4l1.4 1.4 1.4-1.4c4.1-4 10.6-3.9 14.6.4 4 4.3 3.7 11.1-.6 15.3L26.7 40.4c-.7.7-1.7 1.1-2.7 1.1z" fill="none" stroke="white" strokeWidth="2" />
        </svg>
      </div>
      <div className="flex items-center justify-center bg-blush p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo tagline />
          </div>
          {step === "email" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendCode();
              }}
              className="space-y-5"
            >
              <div>
                <h2 className="font-display text-2xl font-semibold">Staff sign-in</h2>
                <p className="mt-1 text-sm text-muted-foreground">We'll email you a one-time code.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@femmecare.lk" className="h-11" autoFocus />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="h-11 w-full" disabled={!email.trim()}>
                Send code
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {db.settings.labels.consultant}s sign in at <a className="text-primary hover:underline" href={`${import.meta.env.BASE_URL}signin`}>femmecare.lk/signin</a>
              </p>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                verify();
              }}
              className="space-y-5"
            >
              <button type="button" onClick={() => setStep("email")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="size-4" /> Use another email
              </button>
              <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-primary">
                <MailCheck className="size-5" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-semibold">Check your email</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We sent a 6-digit code to <span className="font-medium text-foreground">{user?.email}</span>.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="code">Code</Label>
                <Input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" className="h-12 text-center font-mono text-xl tracking-[0.5em]" maxLength={7} autoFocus />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="h-11 w-full" disabled={code.replace(/\s/g, "").length < 6 || busy}>
                {busy && <Loader2 className="size-4 animate-spin" />} Sign in
              </Button>
              <button type="button" onClick={sendCode} className="w-full text-center text-sm text-primary hover:underline">
                Send a new code
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
