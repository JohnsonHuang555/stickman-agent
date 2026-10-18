import { GROUND_Y, VIEW_H, VIEW_W } from '../constants'
import { drawStickman, spinPivot, type Palette, type Pose } from '../stickman/pose'

/** 打中瞬間的衝擊閃光持續幀數（輕擊／重擊）。 */
export const SPARK_FRAMES = { light: 7, heavy: 12 } as const
/** 殘影：每幾幀留一個、每個留多久。 */
export const GHOST_EVERY = 2
export const GHOST_FRAMES = 10
/** 鏡頭推近：拉近、停住、拉回的總長度與放大倍率。 */
export const ZOOM_IN_FRAMES = 4
export const ZOOM_OUT_FRAMES = 10

export interface Spark {
  x: number
  y: number
  born: number
  heavy: boolean
  /** 被打的是特務：用紅色。 */
  hurt: boolean
  /** 打擊方向，速度線往這邊噴。 */
  dir: 1 | -1
}

/** 殘影：某一幀的姿勢與位置。 */
export interface Ghost {
  pose: Pose
  x: number
  footY: number
  facing: 1 | -1
  scale: number
  rotation: number
  grounded: boolean
  color: string
  born: number
}

interface Zoom {
  x: number
  y: number
  amount: number
  born: number
  hold: number
}

/**
 * 打擊演出（純畫面，不影響判定）：衝擊閃光、殘影、鏡頭推近、全畫面閃白。
 * 時間一律用 realFrame 算，頓幀和慢動作期間閃光照樣播完。
 */
export class ImpactFx {
  sparks: Spark[] = []
  ghosts: Ghost[] = []
  zoom: Zoom | null = null
  private whiteUntil = -1
  private whiteBorn = 0

  spark(x: number, y: number, heavy: boolean, hurt: boolean, dir: 1 | -1, frame: number): void {
    this.sparks.push({ x, y, heavy, hurt, dir, born: frame })
  }

  ghost(g: Omit<Ghost, 'born'>, frame: number): void {
    this.ghosts.push({ ...g, born: frame })
  }

  /** 鏡頭往 (x, y) 推近；已經在推近時取比較強的那個。 */
  pushIn(x: number, y: number, amount: number, hold: number, frame: number): void {
    if (this.zoom && this.zoomAmount(frame) > amount) return
    this.zoom = { x, y, amount, hold, born: frame }
  }

  /** 全畫面閃白一下（擊倒最後一個敵人、打倒魔王）。 */
  whiteFlash(frames: number, frame: number): void {
    this.whiteBorn = frame
    this.whiteUntil = frame + frames
  }

  update(frame: number): void {
    this.sparks = this.sparks.filter((s) => frame - s.born < (s.heavy ? SPARK_FRAMES.heavy : SPARK_FRAMES.light))
    this.ghosts = this.ghosts.filter((g) => frame - g.born < GHOST_FRAMES)
    if (this.zoom && frame - this.zoom.born >= ZOOM_IN_FRAMES + this.zoom.hold + ZOOM_OUT_FRAMES) this.zoom = null
  }

  /** 目前的放大倍率（1 = 沒有推近）。 */
  zoomAmount(frame: number): number {
    const z = this.zoom
    if (!z) return 1
    const age = frame - z.born
    let t: number
    if (age < ZOOM_IN_FRAMES) t = 1 - (1 - age / ZOOM_IN_FRAMES) ** 2
    else if (age < ZOOM_IN_FRAMES + z.hold) t = 1
    else t = Math.max(0, 1 - (age - ZOOM_IN_FRAMES - z.hold) / ZOOM_OUT_FRAMES)
    return 1 + z.amount * t * t * (3 - 2 * t)
  }

  /**
   * 套用鏡頭推近：以焦點為中心放大。放大倍率 ≥ 1、焦點在畫面內，畫面邊緣就不會露出空白。
   * 焦點的高度壓在畫面中段到地面之間，推近時地板不會整個跑出畫面。
   */
  applyZoom(ctx: CanvasRenderingContext2D, camX: number, frame: number): void {
    const amount = this.zoomAmount(frame)
    if (amount <= 1 || !this.zoom) return
    const fx = Math.min(VIEW_W, Math.max(0, this.zoom.x - camX))
    const fy = Math.min(GROUND_Y, Math.max(VIEW_H * 0.4, this.zoom.y))
    ctx.translate(fx, fy)
    ctx.scale(amount, amount)
    ctx.translate(-fx, -fy)
  }

  drawGhosts(ctx: CanvasRenderingContext2D, camX: number, frame: number): void {
    for (const g of this.ghosts) {
      const t = 1 - (frame - g.born) / GHOST_FRAMES
      if (t <= 0) continue
      const palette: Palette = { body: g.color, back: g.color }
      const x = g.x - camX
      ctx.save()
      ctx.globalAlpha = 0.32 * t
      if (g.rotation) {
        const { pivotX, pivotY, lift } = spinPivot(g.pose, x, g.footY, g.facing, g.scale, g.rotation, g.grounded)
        ctx.translate(0, -lift)
        ctx.translate(pivotX, pivotY)
        ctx.rotate(g.rotation)
        ctx.translate(-pivotX, -pivotY)
      }
      drawStickman(ctx, g.pose, x, g.footY, g.facing, palette, g.scale)
      ctx.restore()
    }
  }

  drawSparks(ctx: CanvasRenderingContext2D, camX: number, frame: number): void {
    for (const s of this.sparks) {
      const life = s.heavy ? SPARK_FRAMES.heavy : SPARK_FRAMES.light
      const age = frame - s.born
      const t = age / life
      const x = s.x - camX
      const core = s.hurt ? '255, 120, 110' : '255, 255, 240'
      const glow = s.hurt ? '230, 40, 40' : '255, 210, 80'
      ctx.save()
      ctx.lineCap = 'round'
      if (s.heavy) {
        // 擴散的衝擊環
        ctx.strokeStyle = `rgba(${glow}, ${1 - t})`
        ctx.lineWidth = 2.5 * (1 - t) + 0.5
        ctx.beginPath()
        ctx.arc(x, s.y, 5 + 20 * Math.sqrt(t), 0, Math.PI * 2)
        ctx.stroke()
        // 往打擊方向噴的速度線
        ctx.strokeStyle = `rgba(${core}, ${1 - t})`
        ctx.lineWidth = 1.6
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + s.born * 0.7
          const bias = Math.cos(a) * s.dir > 0 ? 1.6 : 1
          const r0 = (6 + 16 * t) * bias
          const r1 = r0 + (12 - 9 * t) * bias
          ctx.beginPath()
          ctx.moveTo(x + Math.cos(a) * r0, s.y + Math.sin(a) * r0)
          ctx.lineTo(x + Math.cos(a) * r1, s.y + Math.sin(a) * r1)
          ctx.stroke()
        }
      }
      // 中心的星形閃光：前兩幀最亮、最大
      const size = (s.heavy ? 13 : 10) * (age < 2 ? 1 : 1 - (t - 2 / life) * 0.9)
      ctx.fillStyle = `rgba(${glow}, ${0.85 * (1 - t)})`
      star(ctx, x, s.y, size * 1.25, size * 0.35, s.heavy ? 8 : 4, s.born)
      ctx.fillStyle = `rgba(${core}, ${1 - t * 0.8})`
      star(ctx, x, s.y, size, size * 0.25, s.heavy ? 8 : 4, s.born)
      ctx.restore()
    }
  }

  /** 全畫面閃白；畫在 HUD 之前。 */
  drawWhite(ctx: CanvasRenderingContext2D, frame: number): void {
    if (frame >= this.whiteUntil) return
    const t = (frame - this.whiteBorn) / (this.whiteUntil - this.whiteBorn)
    ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * (1 - t)})`
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number, points: number, seed: number) {
  const tilt = (seed % 7) * 0.2
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = tilt + (i / (points * 2)) * Math.PI * 2
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fill()
}
