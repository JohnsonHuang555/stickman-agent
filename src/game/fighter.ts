import { GRAVITY, GROUND_Y } from './constants'
import type { ActionDef, ActiveHit, Box, HitSpec, Hitter, RelBox, Team } from './combat/types'
import type { Facing } from './input/commands'
import { drawItemHeld } from './items/itemArt'
import { ITEM_TYPES, categoryOf, type Item } from './items/itemTypes'
import type { LifePool } from './life/lifePool'
import { backHand, drawStickman, frontHand, spinPivot, type Palette, type Pose } from './stickman/pose'
import { HOLD_ARMS } from './stickman/poses'
import type { World } from './world'

let nextId = 1

/** 要畫出來的位置與姿勢（慢動作補間用）。 */
export interface FighterDisplay {
  x: number
  h: number
  rotation: number
  pose: Pose
}

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
  /** 在地上累積走過的距離（px），用來播放走路動畫。 */
  stride = 0
  /** 只用於外觀：整個身體的旋轉角度（弧度），被打飛翻滾時使用。 */
  rotation = 0
  /** 背包：手以外的一格，可放一把槍或一個醫療箱（只有特務會用）。 */
  bag: Item | null = null
  /** 只用於外觀：後手拿的東西（雙刀劍客）。 */
  heldBack: Item | null = null
  readonly scale: number = 1
  /** 每幀往下的加速度；特務較小，跳得高、滯空久。 */
  protected readonly gravity: number = GRAVITY
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
      world.sound('break')
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

  /** 本幀的重力；子類別可依狀態改變（例如浮空時飄得比較久）。 */
  protected currentGravity(): number {
    return this.gravity
  }

  /** 套用重力與速度；回傳本幀是否剛落地。 */
  protected applyPhysics(world: World): boolean {
    let landed = false
    if (this.airborne) {
      this.h += this.vh
      this.vh -= this.currentGravity()
      if (this.h <= 0) {
        this.h = 0
        this.vh = 0
        landed = true
      }
    }
    const before = this.x
    this.x = Math.min(world.floorWidth - 8, Math.max(8, this.x + this.vx))
    // 在地上實際走過的距離：走路動畫依距離播放，腳步才不會在地上滑
    if (!this.airborne) this.stride += Math.abs(this.x - before)
    return landed
  }

  /** 這一招本幀的判定框：武器招式跟著武器走，其餘用招式設定的相對框。 */
  protected attackBox(def: ActionDef, spec: HitSpec): Box {
    return def.weaponLength ? this.weaponBox(def.weaponLength) : this.relToWorld(spec.box)
  }

  /** 從前手沿前臂方向延伸 length 的武器，取其外接框並稍微放寬。 */
  private weaponBox(length: number): Box {
    const hand = this.handPosition()
    const tipX = hand.x + hand.dx * length * this.scale
    const tipY = hand.y + hand.dy * length * this.scale
    const pad = 5
    const x = Math.min(hand.x, tipX) - pad
    const y = Math.min(hand.y, tipY) - pad
    return { x, y, w: Math.abs(tipX - hand.x) + pad * 2, h: Math.abs(tipY - hand.y) + pad * 2 }
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

  /** 慢動作時畫在兩個模擬幀之間的位置與姿勢；null 就照目前狀態畫。 */
  display: FighterDisplay | null = null
  /** 左右壓扁（大風車轉到前後方時的透視）：以世界座標 originX 為中心水平縮放。 */
  squash: { scale: number; originX: number } | null = null

  draw(ctx: CanvasRenderingContext2D, camX: number): void {
    const d = this.display
    const x = (d?.x ?? this.x) - camX
    const pose = d?.pose ?? this.pose()
    const h = d?.h ?? this.h
    const rotation = d?.rotation ?? this.rotation
    ctx.globalAlpha = this.alpha * 0.25
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.ellipse(x, GROUND_Y + 1, Math.max(4, 10 - h * 0.08) * this.scale, 2.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = this.alpha
    const palette = this.flash > 0 ? FLASH_PALETTE : this.palette
    const footY = GROUND_Y - h
    ctx.save()
    if (this.squash) {
      const ox = this.squash.originX - camX
      ctx.translate(ox, 0)
      ctx.scale(this.squash.scale, 1)
      ctx.translate(-ox, 0)
    }
    if (rotation) {
      // 把姿勢當成一顆球，繞它自己的中心轉；在地上翻滾時中心抬到離地一個半徑，
      // 最低點剛好貼著地面滾，不會被甩到半空或陷進地裡
      const { pivotX, pivotY, lift } = spinPivot(pose, x, footY, this.facing, this.scale, rotation, h === 0)
      // 依序（由內而外）：繞姿勢中心旋轉，再整個往上移 lift 讓最低點貼地
      ctx.translate(0, -lift)
      ctx.translate(pivotX, pivotY)
      ctx.rotate(rotation)
      ctx.translate(-pivotX, -pivotY)
    }
    if (this.heldBack) drawItemHeld(ctx, this.heldBack.type, backHand(pose, x, footY, this.facing, this.scale))
    drawStickman(ctx, pose, x, footY, this.facing, palette, this.scale)
    this.drawCostume(ctx, pose, x, footY)
    if (this.held) drawItemHeld(ctx, this.held.type, frontHand(pose, x, footY, this.facing, this.scale))
    ctx.restore()
    ctx.globalAlpha = 1
  }

  /** 角色專屬裝扮（帽子、墨鏡等），畫在火柴人之上。 */
  protected drawCostume(_ctx: CanvasRenderingContext2D, _pose: Pose, _x: number, _footY: number): void {}
}
