import type { ActiveHit, HitSpec, Hitter, Team } from '../combat/types'
import { GRAVITY, GROUND_Y } from '../constants'
import type { Fighter } from '../fighter'
import type { Facing } from '../input/commands'
import type { World } from '../world'
import { drawItemFlying, drawItemOnGround } from './itemArt'
import { ITEM_TYPES, type Item } from './itemTypes'

/** 場上（地上或飛行中）的一件物件。 */
export class ItemEntity implements Hitter {
  h: number
  vx = 0
  vh = 0
  facing: Facing = 1
  team: Team = 'agent'
  state: 'ground' | 'flying' = 'ground'
  removed = false
  /** 有敵人正走過去撿。 */
  reservedBy: number | null = null

  /** 已命中過，只剩落下。 */
  private spent = false
  private travelled = 0
  private spin = 0
  private hitIds = new Set<number>()
  private hitSpec: HitSpec

  constructor(
    readonly item: Item,
    public x: number,
    h = 0,
  ) {
    this.h = h
    const t = this.throwSpec
    this.hitSpec = {
      from: 0,
      to: Infinity,
      box: { forward: 0, up: 0, w: t.w, h: t.h },
      damage: t.damage,
      hitstun: 22,
      knockback: 2.5,
      knockdown: t.knockdown,
      heavy: t.knockdown,
    }
  }

  static thrown(item: Item, from: Fighter): ItemEntity {
    const e = new ItemEntity(item, from.x + from.facing * 6, from.h + 30 * from.scale)
    const t = e.throwSpec
    e.state = 'flying'
    e.team = from.team
    e.facing = from.facing
    e.vx = from.facing * t.vx
    e.vh = t.vh
    e.hitIds.add(from.id)
    return e
  }

  /** 從手上掉落：往上彈一下再落地。 */
  static dropped(item: Item, x: number, h: number): ItemEntity {
    const e = new ItemEntity(item, x, h + 20)
    e.vh = 2.5
    e.vx = (Math.random() * 2 - 1) * 1.2
    return e
  }

  private get throwSpec() {
    return ITEM_TYPES[this.item.type].throw
  }

  get pickable(): boolean {
    return this.state === 'ground' && this.h === 0 && !this.removed
  }

  update(world: World): void {
    const t = this.throwSpec
    const straight = this.state === 'flying' && !this.spent && this.travelled < t.straight
    if (!straight && (this.h > 0 || this.vh > 0)) {
      this.h += this.vh
      this.vh -= GRAVITY
    }
    if (this.state === 'flying') {
      this.travelled += Math.abs(this.vx)
      if (!straight) this.spin += 0.35 * this.facing
    } else {
      this.vx *= 0.85
    }
    const nx = this.x + this.vx
    this.x = Math.min(world.floorWidth - 6, Math.max(6, nx))
    if (this.x !== nx) this.vx = -this.vx * 0.3

    if (this.h <= 0 && this.vh <= 0) {
      this.h = 0
      this.vh = 0
      if (this.state === 'flying') {
        if (t.breaks) this.shatter(world)
        else {
          this.state = 'ground'
          this.vx = 0
          this.spin = 0
        }
      }
    }
  }

  activeHit(): ActiveHit | null {
    if (this.state !== 'flying' || this.spent) return null
    const t = this.throwSpec
    return {
      spec: this.hitSpec,
      box: { x: this.x - t.w / 2, y: GROUND_Y - this.h - t.h / 2, w: t.w, h: t.h },
      hitIds: this.hitIds,
    }
  }

  onHitLanded(world: World): void {
    const t = this.throwSpec
    if (t.pierce) return
    if (t.breaks) {
      this.shatter(world)
      return
    }
    this.spent = true
    this.vx = -this.vx * 0.25
    this.vh = 2
  }

  private shatter(world: World): void {
    this.removed = true
    world.burst(this.x, GROUND_Y - this.h, ITEM_TYPES[this.item.type].debris)
  }

  draw(ctx: CanvasRenderingContext2D, camX: number): void {
    const x = this.x - camX
    if (this.state === 'flying') drawItemFlying(ctx, this.item.type, x, GROUND_Y - this.h, this.spin)
    else drawItemOnGround(ctx, this.item.type, x, this.h)
  }
}
