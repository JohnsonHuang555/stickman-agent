/**
 * 遊戲音效：有音檔（public/sfx/*.mp3）的用音檔，沒有的（或還沒載入、載入失敗）用 Web Audio 即時合成。
 */
export type Sound =
  | 'hit'
  | 'heavyHit'
  | 'hurt'
  | 'shot'
  | 'shotgun'
  | 'click'
  | 'throw'
  | 'break'
  | 'pickup'
  | 'heal'
  | 'coin'
  | 'ko'
  | 'warning'
  | 'clear'
  | 'gameOver'
  | 'menu'
  | 'select'

/**
 * 有音檔的音效與檔名（public/sfx/<檔名>.mp3）。之後放進新的音檔，在這裡加一行即可。
 * 沒列在這裡的音效一律用合成音。
 */
const SOUND_FILES: Partial<Record<Sound, string>> = {
  hit: 'hit',
  heavyHit: 'heavy-hit',
  hurt: 'hurt',
  shot: 'shot',
  shotgun: 'shotgun',
  click: 'click',
  throw: 'throw',
  break: 'break',
  pickup: 'pickup',
  heal: 'heal',
  coin: 'coin',
}

/** 已經解碼好的音檔。 */
const buffers = new Map<Sound, AudioBuffer>()
let loadStarted = false

/** 音效音量（設定畫面可調）。 */
let sfxVolume = 0.35

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noise: AudioBuffer | null = null

/** 調整音效音量（0～1）。 */
export function setSfxVolume(volume: number): void {
  sfxVolume = volume
  if (master) master.gain.value = volume
}

/** 共用的 AudioContext（背景音樂也接到這裡調音量）；使用者按過鍵之前是 null。 */
export function audioContext(): AudioContext | null {
  return ctx
}

/** 必須在使用者按鍵的事件裡呼叫一次，瀏覽器才允許播放聲音。 */
export function unlockAudio(): void {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = sfxVolume
      master.connect(ctx.destination)
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
      const data = noise.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    }
    if (ctx.state === 'suspended') void ctx.resume()
    loadSoundFiles(ctx)
  } catch {
    ctx = null
  }
}

/** 在背景下載並解碼所有音檔；失敗的就繼續用合成音。 */
function loadSoundFiles(audio: AudioContext): void {
  if (loadStarted || typeof fetch === 'undefined') return
  loadStarted = true
  for (const [sound, file] of Object.entries(SOUND_FILES) as [Sound, string][]) {
    fetch(`${import.meta.env.BASE_URL}sfx/${file}.mp3`)
      .then((res) => {
        if (!res.ok) throw new Error(`${file}: ${res.status}`)
        return res.arrayBuffer()
      })
      .then((data) => audio.decodeAudioData(data))
      .then((buffer) => buffers.set(sound, buffer))
      .catch(() => {
        // 沒有這個檔案或格式錯誤：用合成音
      })
  }
}

/** 播放已載入的音檔；沒有就回傳 false。 */
function playFile(sound: Sound): boolean {
  const buffer = buffers.get(sound)
  if (!ctx || !master || !buffer) return false
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.connect(master)
  src.start()
  return true
}

/** 一段音高滑動的方波／三角波等。 */
function tone(type: OscillatorType, from: number, to: number, duration: number, volume: number, delay = 0): void {
  if (!ctx || !master) return
  const t = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, t)
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration)
  gain.gain.setValueAtTime(volume, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
  osc.connect(gain).connect(master)
  osc.start(t)
  osc.stop(t + duration)
}

/** 一段經過濾波的雜訊（打擊、槍聲、碎裂）。 */
function burst(duration: number, volume: number, filterFreq: number, delay = 0): void {
  if (!ctx || !master || !noise) return
  const t = ctx.currentTime + delay
  const src = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  src.buffer = noise
  filter.type = 'lowpass'
  filter.frequency.value = filterFreq
  gain.gain.setValueAtTime(volume, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
  src.connect(filter).connect(gain).connect(master)
  src.start(t)
  src.stop(t + duration)
}

export function play(sound: Sound): void {
  if (!ctx) return
  if (playFile(sound)) return
  switch (sound) {
    case 'hit':
      burst(0.08, 0.6, 1800)
      tone('square', 180, 60, 0.08, 0.25)
      break
    case 'heavyHit':
      burst(0.18, 0.9, 900)
      tone('square', 120, 40, 0.18, 0.4)
      break
    case 'hurt':
      burst(0.1, 0.6, 1200)
      tone('sawtooth', 220, 90, 0.12, 0.25)
      break
    case 'shot':
      burst(0.12, 0.8, 4000)
      tone('square', 900, 120, 0.06, 0.2)
      break
    case 'shotgun':
      burst(0.3, 1, 2500)
      tone('square', 300, 50, 0.2, 0.35)
      break
    case 'click':
      // 空膛：扣下扳機卻沒有子彈的「喀」
      tone('square', 1900, 1400, 0.03, 0.18)
      tone('square', 1200, 900, 0.03, 0.12, 0.05)
      break
    case 'throw':
      burst(0.15, 0.25, 600)
      break
    case 'break':
      burst(0.25, 0.7, 3000)
      burst(0.15, 0.4, 1500, 0.05)
      break
    case 'pickup':
      tone('square', 440, 880, 0.08, 0.2)
      break
    case 'heal':
      tone('triangle', 520, 520, 0.08, 0.3)
      tone('triangle', 780, 780, 0.12, 0.3, 0.08)
      break
    case 'coin':
      tone('square', 990, 990, 0.06, 0.2)
      tone('square', 1320, 1320, 0.15, 0.2, 0.06)
      break
    case 'ko':
      tone('square', 300, 60, 0.3, 0.3)
      break
    case 'warning':
      for (let i = 0; i < 3; i++) tone('sawtooth', 440, 440, 0.18, 0.25, i * 0.3)
      break
    case 'clear':
      ;[523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.15, 0.25, i * 0.12))
      break
    case 'gameOver':
      ;[392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f, 0.3, 0.3, i * 0.25))
      break
    case 'menu':
      tone('square', 660, 660, 0.04, 0.15)
      break
    case 'select':
      tone('square', 660, 1320, 0.1, 0.2)
      break
  }
}
