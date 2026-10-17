import { GRAVITY, GROUND_Y } from './constants'
import type { ActiveHit, Box, HitSpec, Hitter, RelBox, Team } from './combat/types'
import type { Facing } from './input/commands'
import { drawItemHeld } from './items/itemArt'
import { ITEM_TYPES, categoryOf, type Item } from './items/itemTypes'
import type { LifePool } from './life/lifePool'
import { backHand, drawStickman, frontHand, type Palette, type Pose } from './stickman/pose'
import { HOLD_ARMS } from './stickman/poses'
import type { World } from './world'

let nextId = 1

const FLASH_PALETTE: Palette = { body: '#ffffff', back: '#dddddd' }

/** 特務與所有敵人的共同基底：位置、物理、命條、持有物與繪圖。 */
export abstract class Fighter implements Hitter {
  readonly id = nextId++
  /** 跳躍高度（離地 px）。 */
  h = 0
  vx = 0
  vh = 0
  facing: Facing = 1
  invuln = 0
  alpha = 1
  /** 被打中後閃白的剩餘幀數。 */
  flash = 0
  /** 同時只能持有一件。 */
  held: Item | null = null
  /** 只用於外觀：後手拿的東西（雙刀劍客）。 */
  heldBack: Item | null = null
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
  abstract receiveHit(spec: HitSpec, dir: Facing, world: World): void
  /** 當前動作是否為使用近戰武器（命中時扣耐久度）。 */
  protected abstract usingMeleeItem(): boolean

  onHitLanded(world: World): void {
    const item = this.held
    if (!item || categoryOf(item) !== 'melee' || !this.usingMeleeItem()) return
    item.uses--
    if (item.uses <= 0) {
      const hand = this.handPosition()
      world.burst(hand.x, hand.y, ITEM_TYPES[item.type].debris)
      this.held = null
    }
  }

  get carryingHeavy(): boolean {
    return !!this.held && !!ITEM_TYPES[this.held.type].heavy
  }

  /** 持有物件時，在可自由行動的姿勢上覆蓋手臂。 */
  protected withHoldArms(pose: Pose): Pose {
    if (!this.held) return pose
    const category = categoryOf(this.held)
    if (category === 'throwable') return { ...pose, ...HOLD_ARMS.carry }
    if (category === 'firearm') return { ...pose, ...HOLD_ARMS.gun }
    return pose
  }

  /** 前手的世界座標（x 為地板座標、y 為螢幕座標）。 */
  handPosition() {
    return frontHand(this.pose(), this.x, GROUND_Y - this.h, this.facing, this.scale)
  }

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
    const pose = this.pose()
    ctx.globalAlpha = this.alpha * 0.25
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.ellipse(x, GROUND_Y + 1, Math.max(4, 10 - this.h * 0.08) * this.scale, 2.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = this.alpha
    const palette = this.flash > 0 ? FLASH_PALETTE : this.palette
    const footY = GROUND_Y - this.h
    if (this.heldBack) drawItemHeld(ctx, this.heldBack.type, backHand(pose, x, footY, this.facing, this.scale))
    drawStickman(ctx, pose, x, footY, this.facing, palette, this.scale)
    this.drawCostume(ctx, pose, x, footY)
    if (this.held) drawItemHeld(ctx, this.held.type, frontHand(pose, x, footY, this.facing, this.scale))
    ctx.globalAlpha = 1
  }

  /** 角色專屬裝扮（帽子、墨鏡等），畫在火柴人之上。 */
  protected drawCostume(_ctx: CanvasRenderingContext2D, _pose: Pose, _x: number, _footY: number): void {}
}
