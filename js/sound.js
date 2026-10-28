// Sound for the end of a rest. The sounds are synthesised here (no audio files), written to a WAV blob
// and played through an <audio> element with the iOS Audio Session set to "playback":
//  - plays even when the phone's silent switch is on, and goes through earbuds;
//  - the volume is baked into the samples, because iOS ignores HTMLMediaElement.volume
//    (the final loudness is still scaled by the phone's own volume buttons).
// Game blips (XP, level-up) stay in js/ui.js (Web Audio, they respect the silent switch).
import { getState } from './store.js';

const RATE = 22050;
const TAU = Math.PI * 2;
const TARGET_RMS = 0.22;

export const SOUNDS = [
  { id: 'bell', label: 'Bel' },
  { id: 'ping', label: 'Ping' },
  { id: 'chime', label: 'Chiptune' },
  { id: 'levelup', label: 'Level-up' },
  { id: 'alarm', label: 'Alarm' },
  { id: 'gong', label: 'Gong' },
];

/** Adds one decaying note to `buf` starting at `at` seconds. */
function tone(buf, at, dur, freq, { wave = 'sine', partials = [[1, 1]], attack = 0.004, decay = 4, gain = 1 } = {}) {
  const s0 = Math.round(at * RATE);
  const n = Math.round(dur * RATE);
  for (let i = 0; i < n && s0 + i < buf.length; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / attack) * Math.exp(-decay * t) * Math.min(1, (dur - t) / 0.012);
    let v = 0;
    if (wave === 'square') v = Math.sin(TAU * freq * t) >= 0 ? 1 : -1;
    else for (const [m, a] of partials) v += a * Math.sin(TAU * freq * m * t);
    buf[s0 + i] += v * env * gain;
  }
}

const BELL = [[1, 1], [2.76, 0.55], [5.4, 0.3], [8.93, 0.12]];
const GONG = [[1, 1], [1.5, 0.55], [2.02, 0.5], [2.98, 0.35], [4.1, 0.18]];

const DEFS = {
  bell: { seconds: 2.4, build: (b) => [0, 0.55, 1.1].forEach((t, i) => tone(b, t, 1.3, 880, { partials: BELL, decay: 3.2, gain: 1 - i * 0.15 })) },
  ping: { seconds: 0.8, build: (b) => [0, 0.22, 0.44].forEach((t) => tone(b, t, 0.3, 1320, { partials: [[1, 1], [2, 0.25]], decay: 10 })) },
  chime: {
    seconds: 1.0,
    build: (b) => [0, 0.5].forEach((o) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(b, o + i * 0.09, 0.1, f, { wave: 'square', decay: 6, gain: 0.6 }))),
  },
  levelup: {
    seconds: 1.1,
    build: (b) => [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.25], [784, 0.55, 0.08], [1047, 0.63, 0.4]]
      .forEach(([f, t, d]) => tone(b, t, d, f, { wave: 'square', decay: 2, gain: 0.6 })),
  },
  alarm: {
    seconds: 1.9,
    build: (b) => [0, 1.0].forEach((o) => [0, 1, 2, 3].forEach((k) => tone(b, o + k * 0.2, 0.12, k % 2 ? 1250 : 1000, { wave: 'square', decay: 0, gain: 0.6 }))),
  },
  gong: { seconds: 2.8, build: (b) => tone(b, 0, 2.8, 196, { partials: GONG, decay: 1.5, attack: 0.01 }) },
};

/** Samples (Float32, -1..1) for a sound. `volume` is 0..1 on a perceptual-ish curve. */
export function renderSound(id, volume = 0.8) {
  const def = DEFS[id] || DEFS.bell;
  const buf = new Float32Array(Math.round(def.seconds * RATE));
  def.build(buf);
  let peak = 0;
  let sq = 0;
  for (let i = 0; i < buf.length; i++) { peak = Math.max(peak, Math.abs(buf[i])); sq += buf[i] * buf[i]; }
  const rms = Math.sqrt(sq / buf.length);
  // Equal perceived loudness: aim for the same average level, never above the peak limit (square waves are far "louder" than bells).
  const k = peak ? Math.min(0.95 / peak, TARGET_RMS / rms) * Math.pow(Math.min(1, Math.max(0, volume)), 1.5) : 0;
  for (let i = 0; i < buf.length; i++) buf[i] *= k;
  return buf;
}

/** 16-bit mono PCM WAV. */
export function toWav(samples) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return new Blob([buf], { type: 'audio/wav' });
}

// ---------- Playback ----------
function setSession(type) {
  try { if (navigator.audioSession) navigator.audioSession.type = type; } catch { /* not supported */ }
}

let el = null;
let unlocked = false;
let cache = { key: '', url: '' };
let silentUrl = '';

function audioEl() {
  if (!el) {
    el = new Audio();
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
    const release = () => setSession('auto');
    el.addEventListener('ended', release);
    el.addEventListener('error', release);
  }
  return el;
}

function soundUrl(id, volume) {
  const key = `${id}|${volume}`;
  if (cache.key !== key) {
    const old = cache.url;
    cache = { key, url: URL.createObjectURL(toWav(renderSound(id, volume))) };
    if (old) setTimeout(() => URL.revokeObjectURL(old), 5000);
  }
  return cache.url;
}

/**
 * Call from a user tap (iOS only lets an <audio> element play later, without a tap, once it has been played
 * from a tap). Plays 0.1 s of silence in the "ambient" session so the user's music is not interrupted.
 */
export function unlockSound() {
  if (unlocked) return;
  try {
    const a = audioEl();
    silentUrl = silentUrl || URL.createObjectURL(toWav(new Float32Array(RATE / 10)));
    setSession('ambient');
    a.src = silentUrl;
    unlocked = true;
    a.play().catch(() => { unlocked = false; setSession('auto'); });
  } catch { unlocked = false; }
}

/** Plays the chosen rest sound at the chosen volume (settings.restSound / settings.soundVolume). */
export function playRestSound({ id, volume } = {}) {
  const s = getState().settings;
  const sound = id ?? s.restSound ?? 'bell';
  const vol = (volume ?? s.soundVolume ?? 80) / 100;
  try {
    const a = audioEl();
    setSession('playback');
    a.src = soundUrl(sound, vol);
    a.currentTime = 0;
    const p = a.play();
    if (p) p.catch((e) => { console.warn('Geluid kon niet starten', e); setSession('auto'); });
  } catch (e) {
    console.warn('Geluid kon niet starten', e);
  }
}

/** For the settings screen: unlock (we are inside a tap) and play the current choice. */
export function previewSound(opts) {
  unlockSound();
  playRestSound(opts);
}
