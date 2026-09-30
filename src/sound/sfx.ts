import { useSettings, type CorrectSound } from '../settings/store'

// All sounds are synthesized with WebAudio, so the app ships no audio files.
let ac: AudioContext | null = null
const ctx = () => (ac ??= new AudioContext())

function tone(freq: number, t0: number, dur: number, type: OscillatorType = 'sine', vol = 0.08) {
  const a = ctx(), o = a.createOscillator(), g = a.createGain(), t = a.currentTime + t0
  o.type = type
  o.frequency.value = freq
  o.connect(g); g.connect(a.destination)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.start(t); o.stop(t + dur + 0.02)
}

function sweep(f0: number, f1: number, dur: number, vol = 0.12) {
  const a = ctx(), o = a.createOscillator(), g = a.createGain(), t = a.currentTime
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6)
  o.connect(g); g.connect(a.destination)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.start(t); o.stop(t + dur + 0.02)
}

function pluck(f: number, vol = 0.09) {
  const a = ctx(), o = a.createOscillator(), fl = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime
  o.type = 'sawtooth'; o.frequency.value = f
  fl.type = 'lowpass'
  fl.frequency.setValueAtTime(3200, t)
  fl.frequency.exponentialRampToValueAtTime(380, t + 0.25)
  o.connect(fl); fl.connect(g); g.connect(a.destination)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
  o.start(t); o.stop(t + 0.35)
}

/** Low, soft fizz for a streak going out. */
function hiss() {
  const a = ctx(), n = Math.floor(a.sampleRate * 0.6), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  const src = a.createBufferSource(), bp = a.createBiquadFilter(), lp = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime + 0.06
  src.buffer = buf
  bp.type = 'bandpass'
  bp.frequency.setValueAtTime(1900, t)
  bp.frequency.exponentialRampToValueAtTime(650, t + 0.5)
  bp.Q.value = 0.9
  lp.type = 'lowpass'; lp.frequency.value = 2600
  src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(a.destination)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.075, t + 0.05)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
  src.start(t); src.stop(t + 0.58)
}

export const CORRECT_SOUNDS: Record<CorrectSound, () => void> = {
  chime: () => { tone(880, 0, 0.18); tone(1318.5, 0.07, 0.22) },
  pop: () => sweep(420, 980, 0.11),
  wood: () => { tone(1150, 0, 0.07, 'triangle', 0.14); tone(760, 0.004, 0.06, 'sine', 0.06) },
  bell: () => { tone(1046.5, 0, 0.7, 'sine', 0.06); tone(2093, 0, 0.35, 'sine', 0.025); tone(3136, 0, 0.18, 'sine', 0.012) },
  marimba: () => { tone(523.3, 0, 0.32, 'sine', 0.1); tone(2093, 0, 0.08, 'sine', 0.03) },
  pluck: () => pluck(659.3),
}

const on = () => useSettings.getState().sound
const safe = (fn: () => void) => { try { fn() } catch { /* audio can fail before a user gesture; ignore */ } }

export const sfx = {
  correct: () => on() && safe(CORRECT_SOUNDS[useSettings.getState().correctSound]),
  wrong: () => on() && safe(() => tone(196, 0, 0.22, 'triangle', 0.07)),
  milestone: () => on() && safe(() => [659.3, 830.6, 987.8, 1318.5].forEach((f, i) => tone(f, i * 0.075, 0.35, 'sine', 0.07))),
  fizzle: () => on() && safe(hiss),
  preview: (s: CorrectSound) => safe(CORRECT_SOUNDS[s]),
}

export const buzz = (pattern: number | number[]) => { try { navigator.vibrate?.(pattern) } catch { /* not supported */ } }
