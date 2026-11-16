// ffmpeg helpers: screencast frames to H.264, a still title to a clip, joining
// clips, and pulling frames out of a finished video to check it.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { W, H } from "./stage";

export const FFMPEG = ffmpegInstaller.path;
const H264 = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart"];

function ff(args: string[], cwd?: string) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr || r.error?.message}`);
  return r;
}

/** Frames with their capture times (ms) to a constant 30 fps H.264 MP4. */
export function framesToMp4(frames: { file: string; t: number }[], endT: number, out: string) {
  if (!frames.length) throw new Error("No frames were captured");
  const dir = path.dirname(frames[0].file);
  const lines = ["ffconcat version 1.0"];
  frames.forEach((f, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : endT;
    const d = Math.max(0.001, (next - f.t) / 1000);
    lines.push(`file '${path.basename(f.file)}'`, `duration ${d.toFixed(4)}`);
  });
  lines.push(`file '${path.basename(frames[frames.length - 1].file)}'`);
  const list = path.join(dir, "frames.ffconcat");
  fs.writeFileSync(list, lines.join("\n"));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  ff(["-f", "concat", "-safe", "0", "-i", "frames.ffconcat", "-vf", `scale=${W}:${H},fps=30,format=yuv420p`, ...H264, out], dir);
}

/** A still image to a clip of `seconds`, fading in from black. */
export function stillToMp4(png: string, seconds: number, out: string) {
  ff(["-loop", "1", "-t", String(seconds), "-i", png, "-vf", `scale=${W}:${H},fps=30,format=yuv420p,fade=t=in:st=0:d=0.6`, ...H264, out]);
}

/** Join clips that share the same size and frame rate. */
export function joinMp4(clips: string[], out: string) {
  const dir = path.dirname(out);
  const list = path.join(dir, `.join-${Date.now()}.txt`);
  fs.writeFileSync(list, clips.map((c) => `file '${c.replace(/\\/g, "/")}'`).join("\n"));
  try {
    ff(["-f", "concat", "-safe", "0", "-i", list, ...H264, out]);
  } finally {
    fs.rmSync(list, { force: true });
  }
}

/** Length of a video in seconds, read from ffmpeg's own report. */
export function durationOf(file: string): number {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-i", file], { encoding: "utf8" });
  const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(r.stderr ?? "");
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
}

/** Pull `n` evenly spaced frames out of a video as PNG files, for checking. */
export function sampleFrames(file: string, n: number, outDir: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const len = durationOf(file);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) * len) / n;
    const png = path.join(outDir, `${path.basename(file, ".mp4")}-${String(i + 1).padStart(2, "0")}-${t.toFixed(0)}s.png`);
    ff(["-ss", t.toFixed(2), "-i", file, "-frames:v", "1", png]);
    out.push(png);
  }
  return out;
}

export function mmss(seconds: number) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** m:ss.s, for the narration timings. */
export function mmssd(seconds: number) {
  const t = Math.max(0, seconds);
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, "0")}`;
}

// ---------- voiceover ----------

/** Read a 16-bit PCM WAV file (as tts.mjs writes them) into mono samples. */
export function readWav(file: string): { rate: number; samples: Float32Array } {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error(`Not a WAV file: ${file}`);
  let rate = 0;
  let channels = 1;
  let bits = 16;
  let off = 12;
  while (off + 8 <= b.length) {
    const id = b.toString("ascii", off, off + 4);
    const size = b.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt ") {
      channels = b.readUInt16LE(body + 2);
      rate = b.readUInt32LE(body + 4);
      bits = b.readUInt16LE(body + 14);
    } else if (id === "data") {
      if (bits !== 16) throw new Error(`${file}: only 16-bit PCM is supported`);
      const frames = Math.floor(Math.min(size, b.length - body) / (2 * channels));
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let v = 0;
        for (let c = 0; c < channels; c++) v += b.readInt16LE(body + (i * channels + c) * 2);
        samples[i] = v / channels / 32768;
      }
      return { rate, samples };
    }
    off = body + size + (size % 2);
  }
  throw new Error(`${file}: no audio data`);
}

export function wavSeconds(file: string) {
  const { rate, samples } = readWav(file);
  return samples.length / rate;
}

export function writeWav(file: string, samples: Float32Array, rate: number) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

/**
 * Lay voice clips on a silent track `seconds` long, each starting at its own time
 * (the same as ffmpeg's adelay and amix, done sample by sample). Returns the track.
 */
export function layClips(clips: { file: string; t: number }[], seconds: number, out: string) {
  const rate = clips.length ? readWav(clips[0].file).rate : 24000;
  const track = new Float32Array(Math.ceil(seconds * rate));
  for (const c of clips) {
    const w = readWav(c.file);
    if (w.rate !== rate) throw new Error(`${c.file}: sample rate ${w.rate}, expected ${rate}`);
    const start = Math.round(c.t * rate);
    for (let i = 0; i < w.samples.length && start + i < track.length; i++) if (start + i >= 0) track[start + i] += w.samples[i];
  }
  writeWav(out, track, rate);
  return out;
}

const LOUDNESS = "I=-16:TP=-1.5:LRA=11";

/** Add a voice track to a silent video: two-pass loudness normalisation to -16 LUFS, AAC audio, video copied as is. */
export function muxVoice(video: string, wav: string, out: string) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-nostats", "-i", wav, "-af", `loudnorm=${LOUDNESS}:print_format=json`, "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const m = /\{[^{}]*"input_i"[^{}]*\}/.exec(r.stderr ?? "");
  if (!m) throw new Error(`loudnorm measurement failed: ${r.stderr?.slice(-500)}`);
  const j = JSON.parse(m[0]) as Record<string, string>;
  const second = `loudnorm=${LOUDNESS}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
  ff(["-i", video, "-i", wav, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-af", second, "-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out]);
  return { measured: Number(j.input_i), normalised: loudnessOf(out) };
}

/** Integrated loudness (LUFS) of a file's audio. */
export function loudnessOf(file: string): number {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-nostats", "-i", file, "-af", `loudnorm=${LOUDNESS}:print_format=json`, "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const m = /\{[^{}]*"input_i"[^{}]*\}/.exec(r.stderr ?? "");
  return m ? Number((JSON.parse(m[0]) as Record<string, string>).input_i) : NaN;
}

/** The stream lines of ffmpeg's report on a file (what ffprobe would list). */
export function streamsOf(file: string): string[] {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-i", file], { encoding: "utf8" });
  return (r.stderr ?? "").split(/\r?\n/).filter((l) => /^\s*Stream #/.test(l)).map((l) => l.trim());
}
