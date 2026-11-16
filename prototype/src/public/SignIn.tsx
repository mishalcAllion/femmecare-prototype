// W6 Consultant sign-in: number (FC00006 or 6) or email, and password.
// Forgot password emails a link and code (to the Outbox) and lets them choose a new one.
// Suspended accounts go to /app/blocked; pending, rejected and closed accounts see why here.

import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, CircleCheck, Eye, EyeOff, KeyRound, Loader2, MailCheck, Phone, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/fc/brand";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { consultantCode } from "@/domain/format";
import { checkSignIn, labels, maskEmail, parseConsultantNumber, passwordProblem, resetCodeValid, sendPasswordReset, setNewPassword } from "@/domain/ext/consultant-app";
import { consultantByNumber } from "@/domain/consultants";
import { useConsultant } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";

type Mode = "signin" | "forgot" | "sent" | "new" | "done";

export function SignIn() {
  const db = useDb();
  const L = labels(db);
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const me = useConsultant();
  const from = (location.state as { from?: string } | null)?.from;

  // a reset link opened from the email: /signin/reset?u=6&code=123456
  const linkCode = params.get("code") ?? "";
  const linkUser = parseConsultantNumber(params.get("u") ?? "");
  const linkAccount = linkUser !== undefined ? consultantByNumber(db, linkUser) : undefined;

  const [mode, setMode] = useState<Mode>(linkCode ? "new" : "signin");
  const [login, setLogin] = useState(params.get("login") ?? "");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<{ field?: "login" | "password"; text: string }>();
  const [notice, setNotice] = useState<{ title: string; body: string; action?: "apply" | "call" }>();
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState<{ consultantId: string; to: string; code?: string } | undefined>(
    linkAccount ? { consultantId: linkAccount.id, to: maskEmail(linkAccount.email) } : undefined,
  );
  const [code, setCode] = useState(linkCode);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");

  usePageTitle(mode === "signin" ? `${L.one} sign-in` : "Reset your password");

  useEffect(() => {
    if (me && mode === "signin" && !busy) navigate(me.status === "active" ? from ?? "/app" : "/app/blocked", { replace: true });
  }, [me, mode, busy, from, navigate]);

  const signIn = () => {
    setErr(undefined);
    setNotice(undefined);
    const r = checkSignIn(db, login, password);
    if (!r.ok) {
      if (r.notice) setNotice(r.notice);
      else setErr({ field: r.field, text: r.error });
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      actions.signInConsultant(r.consultant.id);
      setBusy(false);
      navigate(r.blocked ? "/app/blocked" : from && from.startsWith("/app") ? from : "/app", { replace: true });
    }, 450);
  };

  const sendReset = () => {
    setErr(undefined);
    if (!login.trim()) return setErr({ field: "login", text: `Enter your ${L.lower} number or email` });
    setBusy(true);
    window.setTimeout(() => {
      setBusy(false);
      const r = sendPasswordReset(login);
      if (!r.ok) return setErr({ field: "login", text: r.error });
      setReset(r.value);
      setCode("");
      setMode("sent");
      if (db.meta.presenterMode) window.setTimeout(() => setCode(r.value.code), 700);
    }, 600);
  };

  const checkCode = () => {
    setErr(undefined);
    if (!reset) return;
    if (!resetCodeValid(db, reset.consultantId, code)) return setErr({ text: "That code isn't right, or it has expired. Check the latest email." });
    setMode("new");
  };

  const savePassword = () => {
    setErr(undefined);
    if (!reset) return setErr({ text: "This reset link has expired. Ask for a new one." });
    const p = passwordProblem(pw1);
    if (p) return setErr({ field: "password", text: p });
    if (pw1 !== pw2) return setErr({ text: "The passwords don't match" });
    const r = setNewPassword(reset.consultantId, code, pw1);
    if (!r.ok) return setErr({ text: r.error });
    const acc = db.consultants.find((c) => c.id === reset.consultantId);
    if (acc) setLogin(acc.number ? consultantCode(acc.number) : acc.email);
    setPassword("");
    setMode("done");
  };

  const linkInvalid = mode === "new" && !!linkCode && (!reset || !resetCodeValid(db, reset.consultantId, linkCode));

  return (
    <div className="grid min-h-[calc(100svh-4rem)] lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden overflow-hidden bg-brand-gradient p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo light tagline />
        <div className="max-w-md">
          <h1 className="font-display text-4xl font-semibold leading-tight">Your FemmeCare business, in your pocket.</h1>
          <p className="mt-4 text-white/85">Order at your price, pay securely, track every delivery and see what your team earns you this month.</p>
        </div>
        <div className="text-sm text-white/70">Need help? Call {db.settings.company.phone}</div>
        <svg className="pointer-events-none absolute -right-24 -top-24 size-[420px] opacity-15" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M24 41.5c-1 0-2-.4-2.7-1.1L8.6 28.2C4.3 24 4 17.2 8 12.9c4-4.3 10.5-4.4 14.6-.4l1.4 1.4 1.4-1.4c4.1-4 10.6-3.9 14.6.4 4 4.3 3.7 11.1-.6 15.3L26.7 40.4c-.7.7-1.7 1.1-2.7 1.1z" fill="none" stroke="white" strokeWidth="2" />
        </svg>
      </div>
      <div className="flex items-start justify-center bg-blush px-4 py-10 sm:items-center sm:px-6">
        <div className="w-full max-w-sm animate-rise">
          {mode === "signin" && (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                signIn();
              }}
              className="space-y-5"
            >
              <div>
                <h2 className="font-display text-3xl font-semibold">Welcome back</h2>
                <p className="mt-1 text-sm text-muted-foreground">Sign in to your {L.lower} account.</p>
              </div>
              {notice && <NoticeCard notice={notice} phone={db.settings.company.phone} />}
              <div className="grid gap-2">
                <Label htmlFor="login">{L.one} number or email</Label>
                <Input
                  id="login"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="FC00006 or name@example.com"
                  autoComplete="username"
                  autoCapitalize="none"
                  className="h-12 bg-card"
                  aria-invalid={err?.field === "login"}
                  autoFocus
                />
                {err?.field === "login" && <p className="text-sm text-destructive">{err.text}</p>}
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline"
                    onClick={() => {
                      setErr(undefined);
                      setNotice(undefined);
                      setMode("forgot");
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="h-12 bg-card pr-11"
                    aria-invalid={err?.field === "password"}
                  />
                  <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={showPw ? "Hide password" : "Show password"}>
                    {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {err?.field === "password" && <p className="text-sm text-destructive">{err.text}</p>}
              </div>
              <Button type="submit" className="h-12 w-full rounded-full text-base" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />} Sign in
              </Button>
              <div className="space-y-2 pt-2 text-center text-sm text-muted-foreground">
                <p>
                  Not {L.a} yet?{" "}
                  <Link to="/join" className="font-medium text-primary hover:underline">
                    Apply to join
                  </Link>
                </p>
                <p>
                  FemmeCare staff?{" "}
                  <Link to="/staff/login" className="font-medium text-primary hover:underline">
                    Staff sign-in
                  </Link>
                </p>
              </div>
            </form>
          )}

          {mode === "forgot" && (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                sendReset();
              }}
              className="space-y-5"
            >
              <BackLink onClick={() => setMode("signin")} />
              <IconBubble>
                <KeyRound className="size-5" />
              </IconBubble>
              <div>
                <h2 className="font-display text-2xl font-semibold">Reset your password</h2>
                <p className="mt-1 text-sm text-muted-foreground">Enter your {L.lower} number or email. We'll email you a link to choose a new password.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="login2">{L.one} number or email</Label>
                <Input id="login2" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="FC00006 or name@example.com" autoComplete="username" autoCapitalize="none" className="h-12 bg-card" aria-invalid={!!err} autoFocus />
                {err && <p className="text-sm text-destructive">{err.text}</p>}
              </div>
              <Button type="submit" className="h-12 w-full rounded-full text-base" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />} Send reset link
              </Button>
            </form>
          )}

          {mode === "sent" && reset && (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                checkCode();
              }}
              className="space-y-5"
            >
              <BackLink onClick={() => setMode("forgot")} label="Use another number or email" />
              <IconBubble>
                <MailCheck className="size-5" />
              </IconBubble>
              <div>
                <h2 className="font-display text-2xl font-semibold">Check your email</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We sent a reset link to <span className="font-medium text-foreground">{reset.to}</span>. Open it on this device, or type the 6-digit code from the email.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="code">Code from the email</Label>
                <Input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" maxLength={7} className="h-12 bg-card text-center font-mono text-xl tracking-[0.5em]" autoFocus />
                {err && <p className="text-sm text-destructive">{err.text}</p>}
              </div>
              <Button type="submit" className="h-12 w-full rounded-full text-base" disabled={code.replace(/\s/g, "").length < 6}>
                Continue
              </Button>
              <button type="button" onClick={sendReset} className="w-full text-center text-sm text-primary hover:underline">
                Send the email again
              </button>
            </form>
          )}

          {mode === "new" &&
            (linkInvalid ? (
              <div className="space-y-5">
                <IconBubble tone="warning">
                  <ShieldAlert className="size-5" />
                </IconBubble>
                <div>
                  <h2 className="font-display text-2xl font-semibold">This link has expired</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Reset links work for 30 minutes and only the latest one is valid. Ask for a new one.</p>
                </div>
                <Button
                  className="h-12 w-full rounded-full text-base"
                  onClick={() => {
                    navigate("/signin", { replace: true });
                    setCode("");
                    setMode("forgot");
                  }}
                >
                  Send a new link
                </Button>
              </div>
            ) : (
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  savePassword();
                }}
                className="space-y-5"
              >
                <IconBubble>
                  <KeyRound className="size-5" />
                </IconBubble>
                <div>
                  <h2 className="font-display text-2xl font-semibold">Choose a new password</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    For {(() => {
                      const a = reset ? db.consultants.find((c) => c.id === reset.consultantId) : undefined;
                      return a ? `${a.givenName} ${a.surname}${a.number ? `, ${consultantCode(a.number)}` : ""}` : "your account";
                    })()}
                    .
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pw1">New password</Label>
                  <Input id="pw1" type={showPw ? "text" : "password"} value={pw1} onChange={(e) => setPw1(e.target.value)} autoComplete="new-password" className="h-12 bg-card" autoFocus />
                  <p className="text-xs text-muted-foreground">At least 8 characters, with a number.</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pw2">Type it again</Label>
                  <Input id="pw2" type={showPw ? "text" : "password"} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" className="h-12 bg-card" />
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} className="size-4 accent-[var(--primary)]" /> Show passwords
                </label>
                {err && <p className="text-sm text-destructive">{err.text}</p>}
                <Button type="submit" className="h-12 w-full rounded-full text-base">
                  Save new password
                </Button>
              </form>
            ))}

          {mode === "done" && (
            <div className="space-y-5 text-center">
              <div className="animate-pop mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
                <CircleCheck className="size-8" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-semibold">Password changed</h2>
                <p className="mt-1 text-sm text-muted-foreground">Sign in with your new password.</p>
              </div>
              <Button
                className="h-12 w-full rounded-full text-base"
                onClick={() => {
                  navigate("/signin", { replace: true });
                  setMode("signin");
                }}
              >
                Sign in
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BackLink({ onClick, label = "Back to sign-in" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> {label}
    </button>
  );
}

function IconBubble({ children, tone = "brand" }: { children: React.ReactNode; tone?: "brand" | "warning" }) {
  return <div className={`flex size-12 items-center justify-center rounded-2xl ${tone === "warning" ? "bg-warning-soft text-warning" : "bg-brand-soft text-primary"}`}>{children}</div>;
}

function NoticeCard({ notice, phone }: { notice: { title: string; body: string; action?: "apply" | "call" }; phone: string }) {
  return (
    <div className="rounded-2xl border border-warning/30 bg-warning-soft/70 p-4 text-sm">
      <div className="flex items-center gap-2 font-semibold">
        <ShieldAlert className="size-4 text-warning" /> {notice.title}
      </div>
      <p className="mt-1 text-muted-foreground">{notice.body}</p>
      {notice.action === "apply" && (
        <Link to="/join" className="mt-2 inline-block font-medium text-primary hover:underline">
          Apply again
        </Link>
      )}
      {notice.action === "call" && (
        <a href={`tel:${phone.replace(/\s/g, "")}`} className="mt-2 inline-flex items-center gap-1 font-medium text-primary hover:underline">
          <Phone className="size-3.5" /> Call {phone}
        </a>
      )}
    </div>
  );
}

