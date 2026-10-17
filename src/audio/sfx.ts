/** 遊戲音效，全部用 Web Audio 即時合成，不需要音檔。 */
export type Sound =
  | 'hit'
  | 'heavyHit'
  | 'hurt'
  | 'shot'
  | 'shotgun'
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

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noise: AudioBuffer | null = null

/** 必須在使用者按鍵的事件裡呼叫一次，瀏覽器才允許播放聲音。 */
export function unlockAudio(): void {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = 0.35
      master.connect(ctx.destination)
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
      const data = noise.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    }
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    ctx = null
  }
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
