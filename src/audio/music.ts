/**
 * 背景音樂（public/music/*.mp3）：用瀏覽器的 <audio> 串流播放（3F 主音樂很大，不整首解碼進記憶體）。
 * - 1F、2F：共用主音樂；小 Boss 出場換成小 Boss 音樂
 * - 3F：換成 3F 專屬的主音樂；魔王出場換成魔王音樂
 * - 標題、排行榜沒有音樂；遊戲結束、通關時淡出；暫停時暫停
 */
export type MusicTrack = 'floorMain' | 'floorBoss' | 'finalMain' | 'finalBoss'

/** 曲目對應的檔名（檔名照實際檔案，3F 主音樂的檔名拼作 thrid）。 */
export const MUSIC_FILES: Record<MusicTrack, string> = {
  floorMain: 'every-floor-main-music',
  floorBoss: 'every-small-boss',
  finalMain: 'thrid-floor-main-music',
  finalBoss: 'third-floor-boss',
}

/** 決定現在該放哪首（純函式，方便測試）。 */
export interface MusicState {
  /** 正在遊玩的樓層資訊；不在遊玩畫面時為 null。 */
  playing: {
    finalFloor: boolean
    /** 場上有活著的 Boss。 */
    bossAlive: boolean
    /** 遊戲結束或通關。 */
    ended: boolean
  } | null
}

export function musicFor(state: MusicState): MusicTrack | null {
  const p = state.playing
  if (!p || p.ended) return null
  if (p.finalFloor) return p.bossAlive ? 'finalBoss' : 'finalMain'
  return p.bossAlive ? 'floorBoss' : 'floorMain'
}

/** 預設音樂音量（設定畫面可調）。 */
const MUSIC_VOLUME = 0.3
const FADE_MS = 600
const FADE_STEP_MS = 50

/**
 * 播放器：同一時間只放一首，換曲時淡出淡入。
 * 音量用 Web Audio 的 GainNode 控制：iPhone 的瀏覽器不能改 audio.volume（永遠是 1），
 * 之前靠 volume 淡出、淡到 0 才暫停，在 iPhone 上舊的曲子永遠停不下來，會和新的疊在一起。
 * 淡出後一律依時間暫停，不看音量有沒有真的降到 0。
 */
export class MusicPlayer {
  private readonly elements = new Map<MusicTrack, HTMLAudioElement>()
  private readonly gains = new Map<HTMLAudioElement, GainNode>()
  /** 沒有 Web Audio 時退回用 audio.volume：自己記目前的音量，不讀 el.volume（某些瀏覽器改了也讀回 1）。 */
  private readonly levels = new Map<HTMLAudioElement, number>()
  private readonly fades = new Map<HTMLAudioElement, ReturnType<typeof setInterval>>()
  private readonly stops = new Map<HTMLAudioElement, ReturnType<typeof setTimeout>>()
  private current: MusicTrack | null = null
  private volume = MUSIC_VOLUME

  constructor(
    private readonly getContext: () => AudioContext | null = () => null,
    private readonly baseUrl: string = import.meta.env.BASE_URL,
  ) {}

  /** 每幀呼叫：曲目相同時什麼都不做，只處理暫停／繼續。 */
  update(track: MusicTrack | null, paused: boolean): void {
    if (track !== this.current) {
      if (this.current) this.fadeOut(this.element(this.current))
      this.current = track
      if (track) {
        const el = this.element(track)
        this.cancelStop(el)
        el.currentTime = 0
        this.setLevel(el, 0, 0)
        this.start(el)
        this.setLevel(el, this.volume, FADE_MS)
      }
      return
    }
    if (!track) return
    const el = this.element(track)
    if (paused && !el.paused) el.pause()
    else if (!paused && el.paused) this.start(el)
  }

  /** 調整音樂音量（0～1）：正在放的曲子立刻套用。 */
  setVolume(volume: number): void {
    this.volume = volume
    if (this.current) this.setLevel(this.element(this.current), volume, 0)
  }

  private element(track: MusicTrack): HTMLAudioElement {
    let el = this.elements.get(track)
    if (!el) {
      el = new Audio(`${this.baseUrl}music/${MUSIC_FILES[track]}.mp3`)
      el.loop = true
      el.preload = 'auto'
      this.elements.set(track, el)
    }
    return el
  }

  private start(el: HTMLAudioElement): void {
    // 瀏覽器在使用者按過鍵之前不允許播放；失敗就等下次 update 再試
    el.play().catch(() => {})
  }

  /** 把這首接到 Web Audio 的音量控制（第一次用到、而且 AudioContext 已經建立時）。 */
  private gainFor(el: HTMLAudioElement): GainNode | null {
    const existing = this.gains.get(el)
    if (existing) return existing
    const ctx = this.getContext()
    if (!ctx) return null
    try {
      const gain = ctx.createGain()
      ctx.createMediaElementSource(el).connect(gain).connect(ctx.destination)
      el.volume = 1
      this.gains.set(el, gain)
      return gain
    } catch {
      return null
    }
  }

  /** 在 ms 毫秒內把音量調到 target（0 = 立刻）。 */
  private setLevel(el: HTMLAudioElement, target: number, ms: number): void {
    const prev = this.fades.get(el)
    if (prev) {
      clearInterval(prev)
      this.fades.delete(el)
    }
    const gain = this.gainFor(el)
    if (gain) {
      const now = gain.context.currentTime
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      if (ms > 0) gain.gain.linearRampToValueAtTime(target, now + ms / 1000)
      else gain.gain.setValueAtTime(target, now)
      return
    }
    // 退回用 audio.volume（電腦版瀏覽器在第一次按鍵前）
    const from = this.levels.get(el) ?? target
    const steps = Math.max(1, Math.round(ms / FADE_STEP_MS))
    let i = 0
    const apply = (v: number) => {
      this.levels.set(el, v)
      el.volume = Math.min(1, Math.max(0, v))
    }
    if (ms <= 0) return apply(target)
    const timer = setInterval(() => {
      i++
      apply(from + ((target - from) * i) / steps)
      if (i >= steps) {
        clearInterval(timer)
        this.fades.delete(el)
      }
    }, FADE_STEP_MS)
    this.fades.set(el, timer)
  }

  /** 淡出，時間到就暫停（不管音量有沒有真的降下來）。 */
  private fadeOut(el: HTMLAudioElement): void {
    this.setLevel(el, 0, FADE_MS)
    this.cancelStop(el)
    this.stops.set(
      el,
      setTimeout(() => {
        this.stops.delete(el)
        if (!this.current || this.elements.get(this.current) !== el) el.pause()
      }, FADE_MS + FADE_STEP_MS),
    )
  }

  private cancelStop(el: HTMLAudioElement): void {
    const t = this.stops.get(el)
    if (t) clearTimeout(t)
    this.stops.delete(el)
  }
}
