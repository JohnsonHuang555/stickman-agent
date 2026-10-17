import { GRAVITY, GROUND_Y } from './constants'
import type { ActiveHit, Box, HitSpec, RelBox } from './combat/types'
import type { Facing } from './input/commands'
import type { LifePool } from './life/lifePool'
import { drawStickman, type Palette, type Pose } from './stickman/pose'
import type { World } from './world'

export type Team = 'agent' | 'gang'

let nextId = 1

/** 特務與所有敵人的共同基底：位置、物理、命條與繪圖。 */
export abstract class Fighter {
  readonly id = nextId++
  /** 跳躍高度（離地 px）。 */
  h = 0
  vx = 0
  vh = 0
  facing: Facing = 1
  invuln = 0
  alpha = 1
  readonly scale: number = 1
  abstract readonly team: Team
  abstract readonly palette: Palette

  constructor(
    public x: number,
    readonly life: LifePool,
  ) {}

  get airborne(): boolean {
    return this.h > 0 || this.vh > 0
  }

  abstract update(world: World): void
  abstract pose(): Pose
  abstract hurtbox(): Box | null
  abstract activeHit(): ActiveHit | null
  abstract receiveHit(spec: HitSpec, dir: Facing): void

  /** 套用重力與速度；回傳本幀是否剛落地。 */
  protected applyPhysics(world: World): boolean {
    let landed = false
    if (this.airborne) {
      this.h += this.vh
      this.vh -= GRAVITY
      if (this.h <= 0) {
        this.h = 0
        this.vh = 0
        landed = true
      }
    }
    this.x = Math.min(world.floorWidth - 8, Math.max(8, this.x + this.vx))
    return landed
  }

  relToWorld(rel: RelBox): Box {
    const left = this.facing === 1 ? this.x + rel.forward : this.x - rel.forward - rel.w
    return { x: left, y: GROUND_Y - this.h - rel.up - rel.h, w: rel.w, h: rel.h }
  }

  protected bodyBox(height: number): Box {
    const h = height * this.scale
    const w = 12 * this.scale
    return { x: this.x - w / 2, y: GROUND_Y - this.h - h, w, h }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number): void {
    const x = this.x - camX
    ctx.globalAlpha = this.alpha * 0.25
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.ellipse(x, GROUND_Y + 1, Math.max(4, 10 - this.h * 0.08) * this.scale, 2.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = this.alpha
    drawStickman(ctx, this.pose(), x, GROUND_Y - this.h, this.facing, this.palette, this.scale)
    ctx.globalAlpha = 1
  }
}
