// The narration voice: turns the lines in narration.ts into WAV clips with tts.mjs,
// keeps them in scripts/demo/voice/, and only re-makes a clip when its line (or the
// voice or speed) changes. Also keeps the timeline of each recording (when every line
// starts in the video) and writes ../playbook/video/narration.md from it.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LINES, SPEED, VOICE, type Line } from "./narration";
import { mmss, mmssd, readWav, wavSeconds, writeWav } from "./encode";
import { LINE_GAP_MS, VIDEO_DIR, type VoiceClip } from "./stage";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VOICE_DIR = path.join(HERE, "voice");
const MANIFEST = path.join(VOICE_DIR, "manifest.json");
const TTS = path.join(HERE, "tts.mjs");

interface Entry {
  file: string;
  voice: string;
  speed: number;
  say: string;
  dur: number;
}

const spoken = (l: Line) => l.say ?? l.text;

function readManifest(): Record<string, Entry> {
  return fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};
}

function current(l: Line, e: Entry | undefined) {
  return !!e && e.say === spoken(l) && e.voice === VOICE && e.speed === SPEED && fs.existsSync(path.join(VOICE_DIR, e.file));
}

/** Make the clips that are missing or out of date. Returns the clips by line id. */
export function makeVoice(force = false) {
  const manifest = readManifest();
  const todo = LINES.filter((l) => force || !current(l, manifest[l.id]));
  if (todo.length) {
    console.log(`\nMaking ${todo.length} voice clip(s) with ${VOICE}...`);
    const jobs = todo.map((l) => ({ file: `${l.id}.wav`, voice: VOICE, speed: SPEED, text: spoken(l) }));
    const jobsFile = path.join(os.tmpdir(), `femmecare-voice-jobs-${Date.now()}.json`);
    fs.writeFileSync(jobsFile, JSON.stringify(jobs, null, 1));
    const r = spawnSync(process.execPath, [TTS, VOICE_DIR, jobsFile, process.env.TTS_PAGES ?? "3"], { stdio: "inherit" });
    fs.rmSync(jobsFile, { force: true });
    if (r.status !== 0) throw new Error("Text to speech failed (see above)");
    for (const l of todo) {
      const file = `${l.id}.wav`;
      trimSilence(path.join(VOICE_DIR, file));
      manifest[l.id] = { file, voice: VOICE, speed: SPEED, say: spoken(l), dur: Number(wavSeconds(path.join(VOICE_DIR, file)).toFixed(3)) };
    }
  }
  // drop clips for lines that no longer exist
  const ids = new Set(LINES.map((l) => l.id));
  for (const id of Object.keys(manifest)) {
    if (ids.has(id)) continue;
    fs.rmSync(path.join(VOICE_DIR, manifest[id].file), { force: true });
    delete manifest[id];
  }
  fs.mkdirSync(VOICE_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  return loadVoice();
}

/** Cut the silence the voice leaves before and after a line, so the timing is the speech itself. */
function trimSilence(file: string) {
  const { rate, samples } = readWav(file);
  const loud = (x: number) => Math.abs(x) > 0.02;
  let a = samples.findIndex(loud);
  if (a < 0) return;
  let b = samples.length - 1;
  while (b > a && !loud(samples[b])) b--;
  a = Math.max(0, a - Math.round(0.05 * rate));
  b = Math.min(samples.length, b + Math.round(0.12 * rate));
  writeWav(file, samples.slice(a, b), rate);
}

/** The clips that match the current narration lines, by line id. */
export function loadVoice(): Record<string, VoiceClip> {
  const manifest = readManifest();
  const out: Record<string, VoiceClip> = {};
  for (const l of LINES) {
    const e = manifest[l.id];
    if (current(l, e)) out[l.id] = { file: path.join(VOICE_DIR, e!.file), dur: e!.dur };
  }
  return out;
}

/** Total speech per group of lines (uc1, uc2, all), for a quick length check. */
export function speechTotals() {
  const v = loadVoice();
  const sums: Record<string, number> = {};
  for (const l of LINES) {
    const g = l.id.split("-")[0];
    sums[g] = (sums[g] ?? 0) + (v[l.id]?.dur ?? 0);
  }
  return sums;
}

// ---------- timelines ----------

export interface TimedCue {
  line: string;
  /** Seconds into the video when the line starts. */
  t: number;
  dur: number;
  file: string;
  onScreen: string;
}

export interface Timeline {
  video: string;
  length: number;
  cues: TimedCue[];
}

const timelineFile = (name: string) => path.join(VOICE_DIR, `${name}-timeline.json`);

export function saveTimeline(name: string, t: Timeline) {
  fs.mkdirSync(VOICE_DIR, { recursive: true });
  fs.writeFileSync(timelineFile(name), JSON.stringify(t, null, 1));
}

export function loadTimeline(name: string): Timeline | undefined {
  const f = timelineFile(name);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : undefined;
}

/** Problems with a timeline: a line that starts before the one before it has ended, or runs past the end. */
export function timelineProblems(t: Timeline) {
  const out: string[] = [];
  let minGap = Infinity;
  t.cues.forEach((c, i) => {
    if (i > 0) {
      const p = t.cues[i - 1];
      const gap = c.t - (p.t + p.dur);
      minGap = Math.min(minGap, gap);
      if (gap < 0) out.push(`${c.line} starts ${(-gap).toFixed(2)} s before ${p.line} ends`);
    }
    if (c.t + c.dur > t.length) out.push(`${c.line} runs past the end of the video`);
  });
  return { problems: out, minGap };
}

// ---------- narration.md ----------

const byId = new Map(LINES.map((l) => [l.id, l]));
const esc = (s: string) => s.replace(/\|/g, "\\|");

export function writeNarrationMd() {
  const parts: string[] = [
    "# FemmeCare walkthrough videos: narration script",
    "",
    `Voice: Kokoro \`${VOICE}\` (British female, Apache-2.0), speed ${SPEED}, made on this laptop by \`scripts/demo/tts.mjs\`. Loudness about -16 LUFS, no music.`,
    "",
    `Times are when each line starts in the video. Every line ends before the next one starts (at least ${(LINE_GAP_MS / 1000).toFixed(1)} s of silence between them): the recorder waits for each line to finish before it moves to the next step.`,
    "",
    "To change a line, edit `scripts/demo/narration.ts` and record again (`npx tsx scripts/demo/record.ts`). Only the changed lines are re-made.",
  ];
  const respelt = LINES.filter((l) => l.say);
  if (respelt.length) {
    parts.push("", "Lines spoken with a respelling, so the voice says the names right:", "", "| Line | Written | Spoken as |", "|---|---|---|");
    for (const l of respelt) parts.push(`| ${l.id} | ${esc(l.text)} | ${esc(l.say!)} |`);
  }
  const sections: [string, string][] = [
    ["uc1", "Use case 1: retail outlet order"],
    ["uc2", "Use case 2: consultant order"],
    ["all", "Both use cases (femmecare-demo.mp4)"],
  ];
  for (const [name, heading] of sections) {
    const t = loadTimeline(name);
    if (!t) continue;
    parts.push("", `## ${heading}`, "", `[${t.video}](${t.video}), ${mmss(t.length)}. ${t.cues.length} lines, ${mmss(t.cues.reduce((a, c) => a + c.dur, 0))} of speech.`, "");
    if (name === "all") {
      const first = (n: string) => t.cues.find((c) => c.line.startsWith(`${n}-`));
      parts.push(
        `The opening card, then use case 1 from ${mmssd(first("uc1")?.t ?? 0)} and use case 2 from ${mmssd(first("uc2")?.t ?? 0)}, with the same lines as above. The opening line:`,
        "",
        "| Starts | Ends | On screen | Narration |",
        "|---|---|---|---|",
      );
      for (const c of t.cues.filter((c) => c.line.startsWith("all-"))) parts.push(`| ${mmssd(c.t)} | ${mmssd(c.t + c.dur)} | ${esc(c.onScreen)} | ${esc(byId.get(c.line)?.text ?? "")} |`);
      continue;
    }
    parts.push("| Starts | Ends | On screen | Narration |", "|---|---|---|---|");
    for (const c of t.cues) parts.push(`| ${mmssd(c.t)} | ${mmssd(c.t + c.dur)} | ${esc(c.onScreen)} | ${esc(byId.get(c.line)?.text ?? "")} |`);
  }
  const out = path.join(VIDEO_DIR, "narration.md");
  fs.writeFileSync(out, parts.join("\n") + "\n");
  return out;
}
