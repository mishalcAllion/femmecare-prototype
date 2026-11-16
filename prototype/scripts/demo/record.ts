// Records the two walkthrough videos, with a narrated voiceover, and the playbook screenshots.
//
//   npx tsx scripts/demo/record.ts            voice clips, both use cases, the joined video, then check
//   npx tsx scripts/demo/record.ts voice      only make the voice clips that are missing or changed
//   npx tsx scripts/demo/record.ts uc1        use case 1 only
//   npx tsx scripts/demo/record.ts uc2        use case 2 only
//   npx tsx scripts/demo/record.ts join       only rebuild femmecare-demo.mp4
//   npx tsx scripts/demo/record.ts check      streams, lengths and voice timing of each video, and 8 frames from each
//
// Needs the dev server running at http://localhost:5190 (npm run dev) and Google
// Chrome installed. Every run starts from a fresh browser, so the app opens on the
// default scenario (Tue 2 Mar 2027, 09:00). Output goes to ../playbook/video and
// ../playbook/img.
//
// Voiceover: the lines are in narration.ts. Each one is spoken when its caption (or
// title card) appears, and the recorder waits for it to finish, plus 0.4 s, before
// the next step. The clips are then laid on a track at the times they started,
// normalised to -16 LUFS and added to the video. Each video also gets a silent copy
// (*-silent.mp4), and ../playbook/video/narration.md lists every line with its time.
// Set NO_VOICE=1 to record without a voice (only the silent copies are written).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { H, IMG_DIR, Recorder, STAGE_URL, Stage, VIDEO_DIR, W, installStageRoutes } from "./stage";
import { durationOf, framesToMp4, joinMp4, layClips, loudnessOf, mmss, muxVoice, sampleFrames, stillToMp4, streamsOf } from "./encode";
import { useCase1, useCase2, type RunInfo } from "./scenes";
import { loadTimeline, loadVoice, makeVoice, saveTimeline, speechTotals, timelineProblems, writeNarrationMd, type TimedCue } from "./voice";

const TMP = path.join(os.tmpdir(), "femmecare-demo-recording");
const OUT = {
  uc1: path.join(VIDEO_DIR, "1-outlet-order-to-delivery.mp4"),
  uc2: path.join(VIDEO_DIR, "2-consultant-order-to-delivery.mp4"),
  all: path.join(VIDEO_DIR, "femmecare-demo.mp4"),
};
const silent = (f: string) => f.replace(/\.mp4$/, "-silent.mp4");
const NO_VOICE = !!process.env.NO_VOICE;

async function launch() {
  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "en-GB",
    timezoneId: "Asia/Colombo",
  });
  return { browser, ctx };
}

/** Lay the clips on a track as long as the video, and add it to the silent video. */
function addVoice(name: string, cues: TimedCue[], video: string, out: string) {
  const len = durationOf(video);
  const wav = layClips(cues.map((c) => ({ file: c.file, t: c.t })), len, path.join(TMP, `${name}-voice.wav`));
  const r = muxVoice(video, wav, out);
  console.log(`  voice: ${cues.length} lines, ${r.measured.toFixed(1)} LUFS before, ${r.normalised.toFixed(1)} LUFS after`);
}

async function record(prefix: "uc1" | "uc2", run: (s: Stage) => Promise<RunInfo>, out: string) {
  console.log(`\nRecording ${prefix}...`);
  for (const f of fs.existsSync(IMG_DIR) ? fs.readdirSync(IMG_DIR) : []) if (f.startsWith(`${prefix}-`)) fs.rmSync(path.join(IMG_DIR, f));
  const { browser, ctx } = await launch();
  const rec = new Recorder(path.join(TMP, prefix, "frames"));
  const s = await Stage.open(ctx, rec, prefix);
  s.voice = NO_VOICE ? {} : loadVoice();
  const t0 = Date.now();
  let info: RunInfo;
  try {
    info = await run(s);
    await s.settle();
  } catch (e) {
    const shot = path.join(TMP, `${prefix}-error.png`);
    await s.page.screenshot({ path: shot }).catch(() => undefined);
    console.log(`Failed. Screenshot of the moment: ${shot}`);
    console.log(s.log.slice(-5).join("\n"));
    await browser.close();
    throw e;
  }
  await rec.stop();
  await browser.close();
  console.log(`  ${rec.frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s, encoding...`);
  framesToMp4(rec.frames, rec.stoppedAt, silent(out));
  const len = durationOf(silent(out));
  const cues: TimedCue[] = s.cues.map((c) => ({ line: c.line, t: Number(rec.videoTime(c.at).toFixed(3)), dur: c.dur, file: c.file, onScreen: c.onScreen }));
  saveTimeline(prefix, { video: path.basename(out), length: len, cues });
  if (!NO_VOICE) addVoice(prefix, cues, silent(out), out);
  console.log(`  ${NO_VOICE ? silent(out) : out} (${mmss(len)})`);
  fs.writeFileSync(path.join(TMP, `${prefix}-log.json`), JSON.stringify({ ids: info.ids, captions: s.log, shots: s.shots.map((x) => ({ file: path.basename(x.file), note: x.note })), length: len }, null, 2));
  console.log(`  ids: ${JSON.stringify(info.ids)}`);
  fs.rmSync(path.join(TMP, prefix, "frames"), { recursive: true, force: true });
}

async function join() {
  console.log("\nJoining...");
  const opening = loadVoice()["all-open"];
  if (!opening && !NO_VOICE) throw new Error("No voice clip for all-open. Run: npx tsx scripts/demo/record.ts voice");
  const { browser, ctx } = await launch();
  await installStageRoutes(ctx);
  const page = await ctx.newPage();
  await page.goto(STAGE_URL);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    (window as unknown as { __stage: { title: (t: unknown) => void } }).__stage.title({
      eyebrow: "FemmeCare Sales System",
      title: "Two orders, start to finish",
      sub: "1. A retail outlet order: Cool Planet's paper PO, through stock, to dispatch and a signed delivery note.\n2. A consultant order: Nimali's phone order, paid by card, sent by courier and confirmed in the app.",
      foot: "Demo data. Tuesday 2 March 2027, 09:00",
    }),
  );
  await page.evaluate(() => {
    const s = document.querySelector("#tc .sub") as HTMLElement;
    s.style.whiteSpace = "pre-line";
  });
  await page.waitForTimeout(700);
  fs.mkdirSync(TMP, { recursive: true });
  const png = path.join(TMP, "opening.png");
  await page.screenshot({ path: png });
  await browser.close();
  // the opening line starts once the card has faded in, and the card stays a second after it ends
  const lead = 0.7;
  const openingMp4 = path.join(TMP, "opening.mp4");
  stillToMp4(png, Math.max(5, lead + (opening?.dur ?? 0) + 1.2), openingMp4);
  joinMp4([openingMp4, silent(OUT.uc1), silent(OUT.uc2)], silent(OUT.all));
  const len = durationOf(silent(OUT.all));
  const t1 = loadTimeline("uc1");
  const t2 = loadTimeline("uc2");
  if (!t1 || !t2) throw new Error("Record uc1 and uc2 before joining (their voice timelines are missing)");
  const o = durationOf(openingMp4);
  const l1 = durationOf(silent(OUT.uc1));
  const cues: TimedCue[] = [
    ...(opening ? [{ line: "all-open", t: lead, dur: opening.dur, file: opening.file, onScreen: "Title card: Two orders, start to finish" }] : []),
    ...t1.cues.map((c) => ({ ...c, t: Number((c.t + o).toFixed(3)) })),
    ...t2.cues.map((c) => ({ ...c, t: Number((c.t + o + l1).toFixed(3)) })),
  ];
  saveTimeline("all", { video: path.basename(OUT.all), length: len, cues });
  if (!NO_VOICE) addVoice("all", cues, silent(OUT.all), OUT.all);
  console.log(`  ${NO_VOICE ? silent(OUT.all) : OUT.all} (${mmss(len)})`);
}

function check() {
  const dir = path.join(TMP, "check");
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [name, f] of [["uc1", OUT.uc1], ["uc2", OUT.uc2], ["all", OUT.all]] as const) {
    for (const file of [f, silent(f)]) {
      if (!fs.existsSync(file)) continue;
      const streams = streamsOf(file);
      const audio = streams.some((l) => / Audio: /.test(l));
      const loud = audio ? `, ${loudnessOf(file).toFixed(1)} LUFS` : "";
      console.log(`${path.basename(file)} ${mmss(durationOf(file))} (${durationOf(file).toFixed(2)} s)${loud}`);
      for (const l of streams) console.log(`  ${l}`);
    }
    const t = loadTimeline(name);
    if (t) {
      const { problems, minGap } = timelineProblems(t);
      console.log(`  voice: ${t.cues.length} lines, ${problems.length ? problems.join("; ") : `each starts after the one before ends (smallest gap ${minGap.toFixed(2)} s)`}`);
    }
    if (!fs.existsSync(f)) continue;
    for (const x of sampleFrames(f, 8, dir)) console.log(`  ${x}`);
  }
}

const what = process.argv[2] ?? "all";
fs.mkdirSync(VIDEO_DIR, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });
if (!NO_VOICE && ["voice", "uc1", "uc2", "join", "all"].includes(what)) {
  makeVoice(process.argv.includes("--force"));
  const tot = speechTotals();
  console.log(`Speech: ${Object.entries(tot).map(([k, v]) => `${k} ${mmss(v)}`).join(", ")}`);
}
if (what === "uc1" || what === "all") await record("uc1", useCase1, OUT.uc1);
if (what === "uc2" || what === "all") await record("uc2", useCase2, OUT.uc2);
if (what === "join" || what === "all") await join();
if (["uc1", "uc2", "join", "all"].includes(what) && !NO_VOICE) console.log(`\nNarration script: ${writeNarrationMd()}`);
if (what === "check" || what === "all") check();
