// Text to speech for the walkthrough narration: Kokoro (Apache-2.0) through kokoro-js,
// run inside Google Chrome (WebAssembly), saved as 16-bit mono WAV files.
//
//   node scripts/demo/tts.mjs <out-dir> <jobs.json> [pages]
//
// jobs.json: [{ "file": "uc1-01.wav", "voice": "bf_emma", "text": "...", "speed": 1 }]
// `pages` (default 3) is how many Chrome pages share the work; each runs its own copy
// of the model on one CPU core.
//
// Chrome is used because the native onnxruntime does not load on this laptop
// (Windows error 1114). The only online calls are the kokoro-js script from jsdelivr
// and the model (about 90 MB) from Hugging Face. Chrome keeps both in a profile under
// the temp folder, so the download happens once, not on every run. The text itself
// never leaves the laptop: it is turned into speech inside the page.
//
// record.ts runs this for you (`npx tsx scripts/demo/record.ts voice`), only for the
// lines whose text has changed.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const KOKORO_JS = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1";
const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const PROFILE = path.join(os.tmpdir(), "femmecare-tts-chrome");

const [outDir, jobsFile, pagesArg] = process.argv.slice(2);
if (!outDir || !jobsFile) {
  console.log("Usage: node scripts/demo/tts.mjs <out-dir> <jobs.json> [pages]");
  process.exit(1);
}
const jobs = JSON.parse(fs.readFileSync(jobsFile, "utf8"));
fs.mkdirSync(outDir, { recursive: true });
const nPages = Math.max(1, Math.min(Number(pagesArg ?? 3) || 3, jobs.length));

function wav(samples, rate) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buf;
}

async function openTts(ctx) {
  const page = await ctx.newPage();
  await page.goto(`${KOKORO_JS}/package.json`);
  await page.evaluate(
    async ([lib, model]) => {
      const { KokoroTTS } = await import(`${lib}/+esm`);
      // @ts-ignore
      window.__tts = await KokoroTTS.from_pretrained(model, { dtype: "q8", device: "wasm" });
    },
    [KOKORO_JS, MODEL],
  );
  return page;
}

async function speak(page, j) {
  const res = await page.evaluate(async ({ text, voice, speed }) => {
    // @ts-ignore
    const tts = window.__tts;
    // keep the phonemes the model is given, to check how names are said
    if (!tts.__keepIds) {
      const gen = tts.generate_from_ids.bind(tts);
      tts.generate_from_ids = (ids, opts) => ((tts.__ids = ids), gen(ids, opts));
      tts.__keepIds = true;
    }
    const audio = await tts.generate(text, { voice, speed: speed ?? 1 });
    const bytes = new Uint8Array(audio.audio.buffer);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const ids = Array.from(tts.__ids?.data ?? [], Number);
    return { b64: btoa(bin), rate: audio.sampling_rate, phonemes: tts.tokenizer.decode(ids), tokens: ids.length };
  }, j);
  // the model reads at most 512 tokens; a longer line would be cut short
  if (res.tokens >= 510) throw new Error(`${j.file}: the line is too long for the model (${res.tokens} tokens). Split it.`);
  const f32 = new Float32Array(new Uint8Array(Buffer.from(res.b64, "base64")).buffer);
  fs.writeFileSync(path.join(outDir, j.file), wav(f32, res.rate));
  return { secs: f32.length / res.rate, phonemes: res.phonemes };
}

const t0 = Date.now();
const ctx = await chromium.launchPersistentContext(PROFILE, { channel: "chrome", headless: true });
try {
  // The first page fills Chrome's cache with the model; the others then load it from there.
  const pages = [await openTts(ctx)];
  console.log(`Model loaded in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  for (let i = 1; i < nPages; i++) pages.push(await openTts(ctx));
  const queue = [...jobs];
  await Promise.all(
    pages.map(async (page) => {
      for (let j = queue.shift(); j; j = queue.shift()) {
        const t = Date.now();
        const { secs, phonemes } = await speak(page, j);
        console.log(`  ${j.file}: ${secs.toFixed(1)} s of audio in ${((Date.now() - t) / 1000).toFixed(1)} s`);
        if (process.env.TTS_PHONEMES) console.log(`    ${phonemes}`);
      }
    }),
  );
} finally {
  await ctx.close();
}
console.log(`${jobs.length} clips in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
