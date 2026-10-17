/** 兩次命中間隔超過這麼多幀，連擊就中斷。 */
export const COMBO_TIMEOUT = 90
/** 每連擊幾下，分數倍率加一。 */
export const COMBO_STEP = 5
export const MAX_MULTIPLIER = 5

const RATINGS: readonly [number, string][] = [
  [25, 'INSANE!!'],
  [15, 'EXCELLENT!'],
  [10, 'GREAT!'],
  [5, 'GOOD!'],
]

/** 特務的連擊計數：連續命中且沒被打中時累積，分數倍率隨之上升。 */
export class ComboCounter {
  count = 0
  best = 0
  /** 最近一次加一的幀（HUD 做跳動效果）。 */
  bumpedAt = -Infinity
  private lastHit = -Infinity

  hit(frame: number): void {
    if (frame - this.lastHit > COMBO_TIMEOUT) this.count = 0
    this.count++
    this.lastHit = frame
    this.bumpedAt = frame
    this.best = Math.max(this.best, this.count)
  }

  /** 每幀呼叫：超過時間沒有命中就歸零。 */
  update(frame: number): void {
    if (this.count && frame - this.lastHit > COMBO_TIMEOUT) this.count = 0
  }

  /** 特務被打中時中斷連擊。 */
  break(): void {
    this.count = 0
  }

  /** 分數倍率：每 COMBO_STEP 下加一，最高 MAX_MULTIPLIER。 */
  get multiplier(): number {
    return Math.min(MAX_MULTIPLIER, 1 + Math.floor(this.count / COMBO_STEP))
  }

  get rating(): string | null {
    return RATINGS.find(([at]) => this.count >= at)?.[1] ?? null
  }
}
