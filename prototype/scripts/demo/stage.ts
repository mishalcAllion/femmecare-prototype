// The recording stage: one 1440 x 900 browser page that holds the staff console
// (full screen) and the consultant app (a 390 x 844 phone in the middle of a blush
// background), with the overlays drawn on top: lower-third captions, title cards,
// a visible cursor with a click ripple and an SMS banner on the phone.
//
// Both apps run in iframes on the same origin as the app, so they share the demo
// data (IndexedDB) and see each other's changes straight away, like two devices.
// Frames are captured with the Chrome screencast and written as JPEG files with
// their timestamps; encode.ts turns them into an H.264 video.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext, CDPSession, Frame, Locator, Page } from "playwright";

export const BASE = process.env.FEMMECARE_URL ?? "http://localhost:5190";
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROTO = path.resolve(HERE, "../..");
export const PLAYBOOK = path.resolve(PROTO, "../playbook");
export const IMG_DIR = path.join(PLAYBOOK, "img");
export const VIDEO_DIR = path.join(PLAYBOOK, "video");

export const W = 1440;
export const H = 900;
export const PHONE = { w: 390, h: 844, x: Math.round((W - 390) / 2), y: Math.round((H - 844) / 2) };

const STAGE_URL = `${BASE}/__demo-stage`;
const FONT_DIR = path.join(PROTO, "node_modules");
const FONTS: Record<string, string> = {
  "fraunces-600.woff2": "@fontsource/fraunces/files/fraunces-latin-600-normal.woff2",
  "fraunces-700.woff2": "@fontsource/fraunces/files/fraunces-latin-700-normal.woff2",
  "inter.woff2": "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
};

const HEART = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 41.5c-1 0-2-.4-2.7-1.1L8.6 28.2C4.3 24 4 17.2 8 12.9c4-4.3 10.5-4.4 14.6-.4l1.4 1.4 1.4-1.4c4.1-4 10.6-3.9 14.6.4 4 4.3 3.7 11.1-.6 15.3L26.7 40.4c-.7.7-1.7 1.1-2.7 1.1z" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

export function stageHtml() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>FemmeCare walkthrough</title>
<style>
@font-face { font-family: "Fraunces"; font-weight: 600; src: url(/__demo-fonts/fraunces-600.woff2) format("woff2"); }
@font-face { font-family: "Fraunces"; font-weight: 700; src: url(/__demo-fonts/fraunces-700.woff2) format("woff2"); }
@font-face { font-family: "Inter"; font-weight: 100 900; src: url(/__demo-fonts/inter.woff2) format("woff2"); }
:root { --coral: #e0465a; --coral-deep: #b9324a; --plum: #5b2a4e; --ink: #2a1d24; --blush: #fdeef0; }
* { box-sizing: border-box; }
html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: var(--blush); font-family: "Inter", system-ui, sans-serif; color: var(--ink); }
#laptop { position: absolute; inset: 0; background: #fff; }
#laptop iframe { width: ${W}px; height: ${H}px; border: 0; display: block; }
#phoneStage { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 40%, #fff6f7 0%, #fde9ec 55%, #f9d9de 100%); }
.hide { visibility: hidden !important; }
#bezel { position: absolute; left: ${PHONE.x - 12}px; top: ${PHONE.y - 12}px; width: ${PHONE.w + 24}px; height: ${PHONE.h + 24}px; border-radius: 54px; background: #221a20; box-shadow: 0 30px 70px rgba(91, 42, 78, .28), 0 6px 18px rgba(0,0,0,.18), inset 0 0 0 2px #3a2f36; }
#screen { position: absolute; left: ${PHONE.x}px; top: ${PHONE.y}px; width: ${PHONE.w}px; height: ${PHONE.h}px; border-radius: 42px; overflow: hidden; background: #fff; }
#screen iframe { width: ${PHONE.w}px; height: ${PHONE.h}px; border: 0; display: block; }
#phoneSide { position: absolute; left: 72px; top: 92px; width: 360px; }
#phoneSide .brand { display: flex; align-items: center; gap: 10px; color: var(--coral); font-family: "Fraunces", Georgia, serif; font-weight: 700; font-size: 26px; }
#phoneSide .brand svg { width: 30px; height: 30px; }
#phoneSide .who { margin-top: 42px; font-family: "Fraunces", Georgia, serif; font-weight: 600; font-size: 34px; line-height: 1.15; }
#phoneSide .role { margin-top: 8px; font-size: 17px; color: #7a5a6a; }
#phoneSide .device { margin-top: 18px; display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; background: #fff; box-shadow: 0 2px 8px rgba(91,42,78,.08); font-size: 14px; color: var(--plum); }
#phoneRight { position: absolute; right: 72px; top: 92px; width: 330px; text-align: right; font-size: 15px; color: #8a6a7a; line-height: 1.5; }
#phoneRight b { display: block; font-family: "Fraunces", Georgia, serif; font-weight: 600; font-size: 20px; color: var(--ink); margin-bottom: 6px; }

/* lower-third caption */
#cap { position: absolute; left: 24px; bottom: 24px; max-width: 720px; display: flex; gap: 14px; align-items: stretch; padding: 14px 20px 14px 14px; border-radius: 18px; background: rgba(255,255,255,.96); box-shadow: 0 12px 34px rgba(42,29,36,.22), 0 0 0 1px rgba(224,70,90,.18); transform: translateY(16px); opacity: 0; transition: opacity .35s ease, transform .35s ease; pointer-events: none; z-index: 50; }
#cap.on { opacity: 1; transform: none; }
#cap .num { flex: none; width: 40px; border-radius: 12px; background: var(--coral); color: #fff; display: flex; align-items: center; justify-content: center; font-family: "Fraunces", Georgia, serif; font-weight: 700; font-size: 20px; }
#cap .who { font-size: 13px; font-weight: 600; letter-spacing: .02em; color: var(--coral-deep); text-transform: uppercase; }
#cap .what { margin-top: 3px; font-size: 19px; font-weight: 500; line-height: 1.3; color: var(--ink); }
body.phone #cap { left: 72px; bottom: 150px; max-width: 380px; }
body.phone #cap .what { font-size: 21px; }

/* title card */
#tc { position: absolute; inset: 0; z-index: 80; background: linear-gradient(135deg, #e0465a 0%, #c8364f 60%, #a82a48 100%); color: #fff; display: flex; align-items: center; padding: 0 120px; opacity: 0; transition: opacity .45s ease; pointer-events: none; overflow: hidden; }
#tc.on { opacity: 1; }
#tc .heart { position: absolute; right: -90px; top: -110px; width: 520px; height: 520px; opacity: .14; color: #fff; }
#tc .heart svg { width: 100%; height: 100%; }
#tc .logo { position: absolute; left: 120px; top: 70px; display: flex; align-items: center; gap: 10px; font-family: "Fraunces", Georgia, serif; font-weight: 700; font-size: 26px; }
#tc .logo svg { width: 30px; height: 30px; }
#tc .eyebrow { font-size: 16px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; opacity: .85; }
#tc .title { margin-top: 18px; font-family: "Fraunces", Georgia, serif; font-weight: 600; font-size: 64px; line-height: 1.08; max-width: 1050px; }
#tc .sub { margin-top: 20px; font-size: 26px; line-height: 1.4; opacity: .92; max-width: 980px; }
#tc .foot { position: absolute; left: 120px; bottom: 64px; font-size: 15px; opacity: .8; }

/* cursor */
#cur { position: absolute; left: 0; top: 0; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%; background: rgba(224,70,90,.30); border: 2.5px solid var(--coral); box-shadow: 0 0 0 3px rgba(255,255,255,.75), 0 4px 12px rgba(0,0,0,.22); z-index: 90; pointer-events: none; transform: translate(${W / 2}px, ${H + 40}px); transition-property: transform; transition-timing-function: cubic-bezier(.45,.05,.25,1); }
.rip { position: absolute; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%; border: 3px solid var(--coral); z-index: 89; pointer-events: none; animation: rip .55s ease-out forwards; }
@keyframes rip { from { transform: scale(.8); opacity: .95; } to { transform: scale(3.2); opacity: 0; } }

/* SMS banner on the phone */
#sms { position: absolute; left: ${PHONE.x + 10}px; top: ${PHONE.y + 12}px; width: ${PHONE.w - 20}px; z-index: 60; padding: 12px 14px; border-radius: 20px; background: rgba(250,248,249,.97); box-shadow: 0 14px 34px rgba(0,0,0,.25); transform: translateY(-140%); opacity: 0; transition: transform .45s cubic-bezier(.2,.9,.3,1.1), opacity .3s; pointer-events: none; font-size: 14px; }
#sms.on { transform: none; opacity: 1; }
#sms .app { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #6b5a63; }
#sms .app i { width: 20px; height: 20px; border-radius: 6px; background: #34c759; display: inline-block; }
#sms .app span:last-child { margin-left: auto; }
#sms .from { margin-top: 6px; font-weight: 600; }
#sms .body { margin-top: 2px; line-height: 1.35; color: #2a1d24; }

body.clean #cur, body.clean .rip, body.clean #cap { visibility: hidden !important; }
</style></head>
<body>
<div id="laptop"><iframe id="laptopFrame" name="laptop" title="Staff console"></iframe></div>
<div id="phoneStage" class="hide">
  <div id="phoneSide"><div class="brand">${HEART}<span>FemmeCare</span></div><div class="who"></div><div class="role"></div><div class="device">On her phone</div></div>
  <div id="phoneRight"></div>
  <div id="bezel"></div>
  <div id="screen"><iframe id="phoneFrame" name="phone" title="Consultant app"></iframe></div>
</div>
<div id="sms"><div class="app"><i></i><span>Messages</span><span>now</span></div><div class="from">FemmeCare</div><div class="body"></div></div>
<div id="cap"><div class="num"></div><div><div class="who"></div><div class="what"></div></div></div>
<div id="tc"><div class="heart">${HEART}</div><div class="logo">${HEART}<span>FemmeCare</span></div><div><div class="eyebrow"></div><div class="title"></div><div class="sub"></div></div><div class="foot"></div></div>
<div id="cur"></div>
<script>
const $ = (id) => document.getElementById(id);
window.__stage = {
  cursorTo(x, y, ms) { const c = $("cur"); c.style.transitionDuration = ms + "ms"; c.style.transform = "translate(" + x + "px," + y + "px)"; },
  ripple(x, y) { const r = document.createElement("div"); r.className = "rip"; r.style.left = x + "px"; r.style.top = y + "px"; document.body.appendChild(r); setTimeout(() => r.remove(), 700); },
  caption(step, who, what) { const c = $("cap"); c.querySelector(".num").textContent = step == null ? "" : String(step); c.querySelector(".num").style.display = step == null ? "none" : "flex"; c.querySelector(".who").textContent = who; c.querySelector(".what").textContent = what; c.classList.add("on"); },
  clearCaption() { $("cap").classList.remove("on"); },
  title(t) { const c = $("tc"); c.querySelector(".eyebrow").textContent = t.eyebrow || ""; c.querySelector(".title").textContent = t.title; c.querySelector(".sub").textContent = t.sub || ""; c.querySelector(".foot").textContent = t.foot || ""; c.classList.add("on"); },
  hideTitle() { $("tc").classList.remove("on"); },
  view(v, person) {
    document.body.classList.toggle("phone", v === "phone");
    $("phoneStage").classList.toggle("hide", v !== "phone");
    $("laptop").classList.toggle("hide", v === "phone");
    if (person) { const s = $("phoneSide"); s.querySelector(".who").textContent = person.name; s.querySelector(".role").textContent = person.role; $("phoneRight").innerHTML = person.right || ""; }
  },
  sms(text) { $("sms").querySelector(".body").textContent = text; $("sms").classList.add("on"); },
  hideSms() { $("sms").classList.remove("on"); },
  clean(on) { document.body.classList.toggle("clean", !!on); },
};
</script>
</body></html>`;
}

/** Serve the stage page and its fonts on the app's own origin (nothing is added to the app). */
export async function installStageRoutes(ctx: BrowserContext) {
  await ctx.route(`${BASE}/__demo-fonts/*`, async (route) => {
    const name = route.request().url().split("/").pop() ?? "";
    const rel = FONTS[name];
    if (!rel) return route.fulfill({ status: 404 });
    await route.fulfill({ status: 200, contentType: "font/woff2", body: fs.readFileSync(path.join(FONT_DIR, rel)) });
  });
  await ctx.route(STAGE_URL, (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: stageHtml() }));
}

export { STAGE_URL };

// ---------- screencast recorder ----------

export interface Shot {
  name: string;
  file: string;
  note: string;
}

export class Recorder {
  frames: { file: string; t: number }[] = [];
  private session?: CDPSession;
  private holding = false;
  private holdStart = 0;
  private holds: [number, number][] = [];
  private browserClock: boolean | undefined;
  /** Browser frame time minus this process's clock when the frame arrived, per frame. */
  private skews: number[] = [];
  startedAt = 0;
  stoppedAt = 0;

  constructor(readonly dir: string) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }

  async start(page: Page) {
    this.session = await page.context().newCDPSession(page);
    this.session.on("Page.screencastFrame", (ev: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
      void this.session?.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => undefined);
      const now = Date.now();
      // use the browser's frame time when it is on the same clock as this process
      const browserMs = ev.metadata.timestamp ? ev.metadata.timestamp * 1000 : undefined;
      if (this.browserClock === undefined) this.browserClock = browserMs !== undefined && Math.abs(browserMs - now) < 5000;
      const t = this.browserClock && browserMs !== undefined ? browserMs : now;
      if (this.skews.length < 2000) this.skews.push(t - now);
      if (this.holding) return;
      if (this.holds.some(([a, b]) => t >= a && t <= b)) return;
      const file = path.join(this.dir, `${String(this.frames.length).padStart(6, "0")}.jpg`);
      fs.writeFileSync(file, Buffer.from(ev.data, "base64"));
      this.frames.push({ file, t });
    });
    this.startedAt = Date.now();
    await this.session.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  }

  /** Stop keeping frames for a moment (while overlays are hidden for a screenshot). */
  hold(on: boolean) {
    if (on) {
      this.holding = true;
      this.holdStart = Date.now();
    } else {
      this.holds.push([this.holdStart - 40, Date.now()]);
      this.holding = false;
    }
  }

  async stop() {
    this.stoppedAt = Date.now();
    await this.session?.send("Page.stopScreencast").catch(() => undefined);
    await new Promise((r) => setTimeout(r, 300));
    this.frames.sort((a, b) => a.t - b.t);
  }

  /** Seconds into the video for a time taken with Date.now() in this process. */
  videoTime(ms: number) {
    const s = [...this.skews].sort((a, b) => a - b);
    const skew = s.length ? s[Math.floor(s.length / 2)] : 0;
    return (ms + skew - this.frames[0].t) / 1000;
  }
}

// ---------- narration ----------

/** A recorded voice clip for one narration line (see narration.ts and voice.ts). */
export interface VoiceClip {
  file: string;
  dur: number;
}

/** One narration line as it happened during a recording. `at` is Date.now() when it started. */
export interface Cue {
  line: string;
  at: number;
  dur: number;
  file: string;
  onScreen: string;
}

/** Silence after each line before the next step may start. */
export const LINE_GAP_MS = 400;

// ---------- the stage ----------

type View = "laptop" | "phone";

export interface Person {
  name: string;
  role: string;
  right?: string;
}

export class Stage {
  laptop!: Frame;
  phone!: Frame;
  view: View = "laptop";
  shots: Shot[] = [];
  private cx = W / 2;
  private cy = H + 40;
  log: string[] = [];
  /** Voice clips by narration line id. Empty when recording without a voice. */
  voice: Record<string, VoiceClip> = {};
  cues: Cue[] = [];
  private freeAt = 0;

  private constructor(
    readonly page: Page,
    readonly rec: Recorder,
    readonly prefix: string,
  ) {}

  static async open(ctx: BrowserContext, rec: Recorder, prefix: string) {
    await installStageRoutes(ctx);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("  [page error]", e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !/favicon|Download the React DevTools/i.test(m.text())) console.log("  [console]", m.text().slice(0, 300));
    });
    await page.goto(STAGE_URL);
    await page.evaluate(() => document.fonts.ready);
    const s = new Stage(page, rec, prefix);
    s.laptop = page.frame({ name: "laptop" })!;
    s.phone = page.frame({ name: "phone" })!;
    return s;
  }

  /** The app frame on screen now. */
  get f(): Frame {
    return this.view === "phone" ? this.phone : this.laptop;
  }

  async wait(ms: number) {
    await this.page.waitForTimeout(ms);
  }

  /** Load a path in one of the app frames and wait for the app and its automation hook. */
  async load(which: View, url: string) {
    const frame = which === "phone" ? this.phone : this.laptop;
    await this.page.evaluate(([id, src]) => ((document.getElementById(id) as HTMLIFrameElement).src = src), [which === "phone" ? "phoneFrame" : "laptopFrame", `${BASE}${url}`]);
    await frame.waitForURL(`${BASE}${url}`, { timeout: 60_000 }).catch(() => undefined);
    await frame.waitForFunction(() => !!(window as unknown as { __femmecareDemo?: unknown }).__femmecareDemo, null, { timeout: 60_000 });
    await this.wait(600);
  }

  /** Call the automation hook in a frame (src/demo/automation.ts). */
  async hook(which: View, fn: "signInStaff" | "signInConsultant" | "setPresenterMode" | "loadScenario", arg: string | boolean) {
    const frame = which === "phone" ? this.phone : this.laptop;
    const r = await frame.evaluate(
      ([name, a]) => {
        const h = (window as unknown as { __femmecareDemo: Record<string, (x: unknown) => unknown> }).__femmecareDemo;
        return h[name as string](a) as { ok?: boolean; error?: string } | undefined;
      },
      [fn, arg] as const,
    );
    if (r && r.ok === false) throw new Error(`${fn}(${arg}) failed: ${r.error}`);
    await this.wait(350);
  }

  /** Client-side navigation inside the app frame (no reload, the signed-in person stays). */
  async go(path: string, which: View = this.view) {
    const frame = which === "phone" ? this.phone : this.laptop;
    await frame.evaluate((p) => {
      const idx = ((history.state as { idx?: number } | null)?.idx ?? 0) + 1;
      history.pushState({ usr: null, key: Math.random().toString(36).slice(2, 10), idx }, "", p);
      dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
    }, path);
    await this.wait(500);
  }

  async show(v: View, person?: Person) {
    this.view = v;
    await this.page.evaluate(([vv, p]) => (window as unknown as { __stage: { view: (a: unknown, b: unknown) => void } }).__stage.view(vv, p), [v, person ?? null] as const);
    await this.wait(150);
  }

  private stage<T>(fn: string, ...args: unknown[]): Promise<T> {
    return this.page.evaluate(([name, a]) => (window as unknown as { __stage: Record<string, (...x: unknown[]) => T> }).__stage[name as string](...(a as unknown[])), [fn, args] as const);
  }

  /** Wait until the narration line being spoken has finished, plus a short gap. */
  async settle() {
    const left = this.freeAt - Date.now();
    if (left > 0) await this.wait(left);
  }

  /** Start narration line `line` at `at` (Date.now() time); the next step waits for it to finish. */
  private speak(line: string | undefined, onScreen: string, at = Date.now()) {
    if (!line) return;
    const clip = this.voice[line];
    if (!clip) {
      if (!process.env.NO_VOICE) throw new Error(`No voice clip for narration line ${line}. Run: npx tsx scripts/demo/record.ts voice`);
      this.cues.push({ line, at, dur: 0, file: "", onScreen });
      return;
    }
    this.cues.push({ line, at, dur: clip.dur, file: clip.file, onScreen });
    this.freeAt = at + clip.dur * 1000 + LINE_GAP_MS;
  }

  /** Show a lower-third caption and start its narration line. */
  async caption(step: number | null, who: string, what: string, readMs = 0, line?: string) {
    await this.settle();
    this.log.push(`[${step ?? "-"}] ${who}: ${what}`);
    await this.stage("caption", step, who, what);
    this.speak(line, `${step ?? "-"}. ${who}: ${what}`);
    await this.wait(400 + readMs);
  }

  async clearCaption() {
    await this.stage("clearCaption");
    await this.wait(350);
  }

  /**
   * Full-screen title card; `during` runs while it covers the screen (persona switch, navigation).
   * With `line`, its narration starts as the card shows and the card stays up until the line ends.
   */
  async title(t: { eyebrow?: string; title: string; sub?: string; foot?: string }, during?: () => Promise<void>, hold = 2400, opts: { startRecording?: boolean; line?: string } = {}) {
    await this.settle();
    await this.stage("clearCaption");
    await this.stage("title", t);
    await this.wait(500);
    if (opts.startRecording) await this.rec.start(this.page);
    const start = Date.now();
    this.speak(opts.line, `Title card: ${t.title}`, start + (opts.startRecording ? 500 : 0));
    if (during) await during();
    const left = hold - (Date.now() - start);
    if (left > 0) await this.wait(left);
    await this.settle();
    await this.stage("hideTitle");
    await this.wait(550);
  }

  async moveTo(x: number, y: number) {
    const d = Math.hypot(x - this.cx, y - this.cy);
    const ms = Math.round(Math.min(850, Math.max(260, d * 0.75)));
    await this.stage("cursorTo", x, y, ms);
    this.cx = x;
    this.cy = y;
    await this.wait(ms + 50);
  }

  async ripple() {
    await this.stage("ripple", this.cx, this.cy);
  }

  /** Bring an element into view with a smooth scroll if it is hidden or under the caption. */
  async reveal(loc: Locator) {
    await loc.waitFor({ state: "visible", timeout: 20_000 });
    const moved = await loc.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const top = vw < 600 ? 64 : 70;
      const bottom = vw < 600 ? 150 : 130;
      if (r.top >= top && r.bottom <= vh - bottom && r.left >= 0 && r.right <= vw) return false;
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      return true;
    });
    if (moved) await this.wait(750);
  }

  async point(loc: Locator) {
    await this.reveal(loc);
    const b = await loc.boundingBox();
    if (b) await this.moveTo(b.x + b.width / 2, b.y + b.height / 2);
  }

  async click(loc: Locator, after = 500) {
    await this.point(loc);
    await this.ripple();
    await loc.click();
    await this.wait(after);
  }

  async type(loc: Locator, text: string, opts: { clear?: boolean; delay?: number; after?: number } = {}) {
    await this.click(loc, 150);
    if (opts.clear) await loc.fill("");
    await loc.pressSequentially(text, { delay: opts.delay ?? 55 });
    await this.wait(opts.after ?? 300);
  }

  async select(loc: Locator, value: string | { label: string }, after = 450) {
    await this.point(loc);
    await this.ripple();
    await loc.selectOption(value);
    await this.wait(after);
  }

  /** Scroll the app frame smoothly by a number of pixels (or to the top). */
  async scroll(by: number | "top", which: View = this.view) {
    const frame = which === "phone" ? this.phone : this.laptop;
    await frame.evaluate((b) => (b === "top" ? window.scrollTo({ top: 0, behavior: "smooth" }) : window.scrollBy({ top: b as number, behavior: "smooth" })), by);
    await this.wait(800);
  }

  async sms(text: string) {
    await this.stage("sms", text);
    await this.wait(600);
  }

  async hideSms() {
    await this.stage("hideSms");
    await this.wait(450);
  }

  /** Screenshot for the playbook, without the cursor or caption, and kept out of the video. */
  async snap(name: string, note: string, opts: { keepSms?: boolean } = {}) {
    fs.mkdirSync(IMG_DIR, { recursive: true });
    const file = path.join(IMG_DIR, `${this.prefix}-${String(this.shots.length + 1).padStart(2, "0")}-${name}.png`);
    this.rec.hold(true);
    await this.stage("clean", true);
    if (!opts.keepSms) await this.page.evaluate(() => document.getElementById("sms")?.classList.add("hide"));
    await this.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const clip = this.view === "phone" ? { x: PHONE.x, y: PHONE.y, width: PHONE.w, height: PHONE.h } : undefined;
    await this.page.screenshot({ path: file, clip });
    await this.page.evaluate(() => document.getElementById("sms")?.classList.remove("hide"));
    await this.stage("clean", false);
    await this.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await this.wait(250);
    this.rec.hold(false);
    this.shots.push({ name, file, note });
  }

  /** Read the saved demo state from the browser (IndexedDB, as the app saves it). */
  async state<T = DemoState>(): Promise<T> {
    await this.wait(450); // the app saves 300 ms after a change
    return this.page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const r = indexedDB.open("keyval-store");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return new Promise((res, rej) => {
        const q = db.transaction("keyval", "readonly").objectStore("keyval").get("femmecare:state:v1");
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
    }) as Promise<T>;
  }

  /** Path of the app frame, e.g. /staff/outlet-orders/SO-27-00047. */
  path(which: View = this.view) {
    return new URL((which === "phone" ? this.phone : this.laptop).url()).pathname;
  }
}

// Just the parts of the app's state the scenes read.
export interface DemoState {
  meta: { now: string; counters: Record<string, number> };
  consultants: { id: string; number?: number; givenName: string; surname: string; mobile: string }[];
  dispatches: { id: string; orderId: string; channel: string; status: string; lines: { productId: string; batchId: string; qty: number; scanned: number }[]; invoiceId?: string; deliveryNoteId?: string; trackingNo?: string }[];
  outbox: { channel: "email" | "sms"; to: string; toName: string; subject?: string; body: string; ts: string }[];
  outletOrders: { id: string; outletId: string; poNumber: string; status: string; lines: { productId: string; qty: number; allocated: number; backordered: number }[] }[];
  consultantOrders: { id: string; consultantId: string; total: number; dispatchId?: string }[];
  products: { id: string; name: string; barcode: string }[];
}
