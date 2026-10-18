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

const MUSIC_VOLUME = 0.4
const FADE_MS = 600
const FADE_STEP_MS = 50

/** 播放器：同一時間只放一首，換曲時淡出淡入。 */
export class MusicPlayer {
  private readonly elements = new Map<MusicTrack, HTMLAudioElement>()
  private current: MusicTrack | null = null
  private fades = new Map<HTMLAudioElement, ReturnType<typeof setInterval>>()

  constructor(private readonly baseUrl: string = import.meta.env.BASE_URL) {}

  /** 每幀呼叫：曲目相同時什麼都不做，只處理暫停／繼續。 */
  update(track: MusicTrack | null, paused: boolean): void {
    if (track !== this.current) {
      if (this.current) this.fadeTo(this.element(this.current), 0, true)
      this.current = track
      if (track) {
        const el = this.element(track)
        el.currentTime = 0
        el.volume = 0
        this.start(el)
        this.fadeTo(el, MUSIC_VOLUME, false)
      }
      return
    }
    if (!track) return
    const el = this.element(track)
    if (paused && !el.paused) el.pause()
    else if (!paused && el.paused) this.start(el)
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

  private fadeTo(el: HTMLAudioElement, target: number, stopAfter: boolean): void {
    const prev = this.fades.get(el)
    if (prev) clearInterval(prev)
    const step = ((target - el.volume) * FADE_STEP_MS) / FADE_MS
    const timer = setInterval(() => {
      const next = el.volume + step
      const done = step >= 0 ? next >= target : next <= target
      el.volume = Math.min(1, Math.max(0, done ? target : next))
      if (done) {
        clearInterval(timer)
        this.fades.delete(el)
        if (stopAfter) el.pause()
      }
    }, FADE_STEP_MS)
    this.fades.set(el, timer)
  }
}
