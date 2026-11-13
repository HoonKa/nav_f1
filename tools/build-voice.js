#!/usr/bin/env node
/*
 * AI 음성 팩 생성기
 * index.html의 안내 문구를 조각으로 나눠 Google Cloud Text-to-Speech로 한 번만 합성해 voice/ 에 저장한다.
 * (무전기 필터는 재생할 때 앱에서 실시간으로 입힌다)
 *
 *   GOOGLE_TTS_API_KEY=... node tools/build-voice.js           # 없는 클립만 생성
 *   node tools/build-voice.js --dry                             # 조각 목록/개수만 확인
 *   node tools/build-voice.js --fake                            # 키 없이 테스트용 삑 소리 클립 생성 (ffmpeg 필요)
 *   VOICE=ko-KR-Chirp3-HD-Fenrir RATE=1.1 node tools/build-voice.js --force   # 목소리 바꿔 전부 다시 생성
 */
const fs = require("fs"), path = require("path"), vm = require("vm"), crypto = require("crypto");
const { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, ".."), OUT = path.join(ROOT, "voice");
const args = new Set(process.argv.slice(2));
const VOICE = process.env.VOICE || "ko-KR-Chirp3-HD-Charon";
const RATE = +(process.env.RATE || 1.12);

// 1) index.html에서 문구 코드 블록을 꺼내 pick()이 "모든 후보"를 돌려주도록 실행
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const block = html.slice(html.indexOf("/* ================= 안내 문구"), html.indexOf("/* ================= 경로 계산"));
const segSrc = html.match(/const SEG_RE=[\s\S]*?\n}\n/)[0];
const sayDistSrc = html.match(/function sayDist\(m\)\{.*\}/)[0];
const ctx = { pick: a => a };
vm.createContext(ctx);
vm.runInContext(`${sayDistSrc}\n${segSrc}\n${block.replace(/^const /gm, "var ")}`, ctx);
const { callout, Lines, segment, sayDist } = ctx;

const texts = new Set();
const add = x => (Array.isArray(x) ? x : [x]).forEach(t => texts.add(t));
const MODS = ["left", "right", "slight left", "slight right", "sharp left", "sharp right", "uturn", "straight", ""];
const TYPES = ["on ramp", "off ramp", "merge", "fork", "roundabout", "end of road", "turn",
  "tunnel", "underpass", "overpass", "beside underpass", "beside overpass", "sharp curve", "accident zone"];
for (let clock = 1; clock <= 12; clock++) for (const stage of ["far", "near", "now"])
  add(callout({ type: "roundabout", modifier: "right", clock, name: "" }, stage, "500미터", 1));
for (const type of TYPES) for (const modifier of MODS) for (const exit of [1, 2, 3, 4, 5]) for (const stage of ["far", "near", "now"])
  add(callout({ type, modifier, exit, name: "" }, stage, "500미터", 1));
for (const k of ["start", "after", "chatter", "yellow", "green", "offroute", "rerouted"]) add(Lines[k]);
Object.values(Lines.afterType).forEach(add);
for (const lim of [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]) { add(Lines.camFar("400미터", lim)); add(Lines.camOver(lim)); add(Lines.secStart(lim)); }
add(Lines.camOk); add(Lines.secEnd);
add(Lines.finalLap("300미터")); add(Lines.finish("3분 7초")); add(Lines.sector(1));

// 2) 고정 문구 조각 + 가변 조각(거리, 턴 번호, 섹터, 시간)
const VAR = /^(턴 \d+|섹터 \d+|\d+(?:\.\d+)?킬로미터|\d+미터|\d+분|\d+초)$/;
const clips = new Set();
for (const t of texts) segment(t).forEach(s => { if (!VAR.test(s)) clips.add(s); });
for (let m = 0; m <= 3000; m += 10) clips.add(sayDist(m));
for (let n = 1; n <= 80; n++) clips.add(`턴 ${n}`);
for (let n = 1; n <= 3; n++) clips.add(`섹터 ${n}`);
for (let n = 1; n <= 180; n++) clips.add(`${n}분`);
for (let n = 0; n <= 59; n++) clips.add(`${n}초`);

const list = [...clips];
const fileOf = t => crypto.createHash("sha1").update(VOICE + "|" + RATE + "|" + t).digest("hex").slice(0, 12) + ".mp3";
console.log(`문장 ${texts.size}개 → 클립 ${list.length}개 (글자 수 ${list.join("").length})`);
if (args.has("--dry")) { console.log(list.filter(t => !VAR.test(t)).join("\n")); process.exit(0); }

fs.mkdirSync(OUT, { recursive: true });
// 앞뒤 무음을 잘라 조각끼리 자연스럽게 이어지게 (ffmpeg 필요)
function trim(file) {
  const tmp = file + ".tmp.mp3", sr = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03";
  try {
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", file, "-af", `${sr},areverse,${sr},areverse`, "-b:a", "48k", tmp]);
    fs.renameSync(tmp, file);
  } catch (e) { try { fs.unlinkSync(tmp); } catch (_) {} }
}
if (args.has("--trim-only")) { for (const f of fs.readdirSync(OUT)) if (f.endsWith(".mp3")) trim(path.join(OUT, f)); console.log("무음 정리 완료"); process.exit(0); }
async function synth(text, file) {
  const out = path.join(OUT, file);
  if (fs.existsSync(out) && !args.has("--force")) return;
  if (args.has("--fake")) { // 글자 수만큼 길이의 삑 소리
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=440:duration=${(0.15 + text.length * 0.07).toFixed(2)}`, "-b:a", "32k", out]);
    return;
  }
  // 키는 환경 변수로 주거나, 없으면 네트워크 프록시가 X-Goog-Api-Key 헤더를 붙여준다고 가정
  const key = process.env.GOOGLE_TTS_API_KEY;
  const body = { input: { text }, voice: { languageCode: "ko-KR", name: VOICE }, audioConfig: { audioEncoding: "MP3", speakingRate: RATE, sampleRateHertz: 24000 } };
  for (let attempt = 0; attempt < 7; attempt++) {
    const r = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize" + (key ? `?key=${key}` : ""), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) { fs.writeFileSync(out, Buffer.from((await r.json()).audioContent, "base64")); trim(out); return; }
    const msg = await r.text();
    if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 1000 * 2 ** attempt * 2)); continue; }
    throw new Error(`${r.status} ${text}: ${msg.slice(0, 300)}`);
  }
  throw new Error("재시도 초과: " + text);
}

(async () => {
  const manifest = { voice: args.has("--fake") ? "fake" : VOICE, rate: RATE, clips: {} };
  let i = 0, done = 0;
  const worker = async () => { while (i < list.length) { const t = list[i++], f = fileOf(t); await synth(t, f); manifest.clips[t] = f; if (++done % 50 === 0) console.log(`${done}/${list.length}`); } };
  await Promise.all(Array.from({ length: +(process.env.CONC || 3) }, worker));
  // 더 이상 쓰지 않는 파일 정리
  const keep = new Set(Object.values(manifest.clips));
  for (const f of fs.readdirSync(OUT)) if (f.endsWith(".mp3") && !keep.has(f)) fs.unlinkSync(path.join(OUT, f));
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 0));
  console.log(`완료: ${done}개 → voice/manifest.json`);
})().catch(e => { console.error(e.message); process.exit(1); });
