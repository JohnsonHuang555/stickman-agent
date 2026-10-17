import type { ActionDef, ActionInstance, ActiveHit, Box, HitSpec } from '../combat/types'
import type { Facing } from '../input/commands'
import { itemAction, itemRange } from '../items/itemActions'
import type { ItemEntity } from '../items/itemEntity'
import { categoryOf, newItem, type Item } from '../items/itemTypes'
import { LifePool } from '../life/lifePool'
import { STAND_HEIGHT, type Palette, type Pose } from '../stickman/pose'
import { CLIPS } from '../stickman/poses'
import type { World } from '../world'
import { Enemy } from './enemy'
import { ENEMY_MOVES, type EnemyMoveId } from './enemyMoves'
import { ENEMY_TYPES, randomPalette, type EnemyType } from './enemyTypes'

const DOWN_FRAMES = 40
const GETUP_FRAMES = 18
const DYING_FRAMES = 40
const RETREAT_FRAMES = 18
const PICKUP_FRAMES = 12
/** 會走去撿東西的最遠距離。 */
const FETCH_RADIUS = 160
const AMMO_DROP_CHANCE = 0.15
const MEDKIT_DROP_CHANCE = 0.1
/** 同一次浮空最多被打幾下，之後一定落地。 */
export const JUGGLE_LIMIT = 5
/** 浮空中被打中時往上彈的速度（直接重設，敵人才會停在特務附近的高度）。 */
const JUGGLE_POP = 3
/** 被追擊時至少往上彈這麼多，看得出被打中的反應。 */
const JUGGLE_POP_MIN = 1.2
/** 浮空時的重力（一般為 0.42），讓敵人在空中停留得久一點，人比較接得上。 */
const JUGGLE_RISE_GRAVITY = 0.22
/** 下墜時重力較大：上升時飄、下墜俐落，不會像懸浮在空中。 */
const JUGGLE_FALL_GRAVITY = 0.3
const SPIKE_VELOCITY = -6
const SPIKE_BOUNCE = 3.2

/** 被擊飛的雜兵撞到同伴時造成的傷害。 */
const BUMP: HitSpec = {
  from: 0,
  to: Infinity,
  box: { forward: -8, up: 0, w: 16, h: 30 },
  damage: 8,
  hitstun: 20,
  knockback: 2,
  knockdown: true,
}

type GruntState =
  | 'approach'
  | 'wait'
  | 'attack'
  | 'retreat'
  | 'fetch'
  | 'pickup'
  | 'hurt'
  | 'launched'
  | 'juggled'
  | 'down'
  | 'getup'
  | 'dying'

const rand = (min: number, max: number) => min + Math.random() * (max - min)

interface PlannedMove {
  def: ActionDef
  range: number
}

export interface GruntOptions {
  /** 不動也不攻擊，只承受攻擊（測試用）。 */
  passive?: boolean
  /** 覆寫空手時的招式（小 Boss 或測試用）。 */
  moves?: readonly EnemyMoveId[]
  /** 覆寫登場時的持有物；null 表示空手。 */
  held?: Item | null
}

/**
 * 雜兵 AI：
 * - 取得攻擊名額 → 接近 → 出招 → 後退 → 冷卻
 * - 沒有名額 → 在一段距離外徘徊等待；空手時會去撿附近的物件
 */
export class Grunt extends Enemy {
  readonly palette: Palette
  readonly scale: number

  private state: GruntState = 'wait'
  private stateFrame = 0
  private animFrame = Math.floor(Math.random() * 60)
  private hitstun = 0
  private cooldown = rand(20, 60)
  private planned: PlannedMove | null = null
  private act: ActionInstance | null = null
  private bumpIds = new Set<number>()
  /** 這次浮空已被命中的次數。 */
  private juggleHits = 0
  /** 被下砸中，著地時要反彈。 */
  private spiked = false
  /** 翻滾的角速度（弧度／幀）。 */
  private spin = 0
  private target: ItemEntity | null = null
  /** 每個雜兵徘徊距離略有不同，避免疊在一起。 */
  private readonly hoverJitter = rand(-10, 25)
  private readonly passive: boolean
  private readonly moves: readonly EnemyMoveId[]

  constructor(
    x: number,
    readonly type: EnemyType,
    options: GruntOptions = {},
  ) {
    super(x, new LifePool(1, ENEMY_TYPES[type].hp))
    this.palette = randomPalette(type)
    this.scale = ENEMY_TYPES[type].scale
    this.passive = options.passive ?? false
    this.moves = options.moves ?? ENEMY_TYPES[type].moves
    this.held = options.held !== undefined ? options.held : ENEMY_TYPES[type].loadout()
  }

  private get def() {
    return ENEMY_TYPES[this.type]
  }

  update(world: World): void {
    this.stateFrame++
    this.animFrame++
    if (this.cooldown > 0) this.cooldown--
    if (this.flash > 0) this.flash--

    const agent = world.agent
    const dx = agent.x - this.x
    const toward: Facing = dx < 0 ? -1 : 1
    const dist = Math.abs(dx)
    const canEngage = !this.passive && agent.vulnerable

    switch (this.state) {
      case 'wait': {
        this.facing = toward
        if (this.passive) {
          this.vx = 0
          break
        }
        if (this.tryFetch(world)) break
        const hover = this.hoverDistance + this.hoverJitter
        const speed = this.def.walkSpeed
        if (dist < hover - 8) this.vx = -toward * speed * 0.7
        else if (dist > hover + 8) this.vx = toward * speed * 0.8
        else this.vx = 0
        if (canEngage && this.cooldown <= 0 && world.slots.request(this.id)) {
          this.planned = this.planMove()
          this.setState('approach')
        }
        break
      }
      case 'approach': {
        this.facing = toward
        const plan = this.planned ?? (this.planned = this.planMove())
        if (!canEngage || !world.slots.request(this.id)) {
          world.slots.release(this.id)
          this.setState('wait')
        } else if (dist <= plan.range) {
          this.startAttack(plan.def)
        } else {
          this.vx = toward * this.def.walkSpeed * (this.carryingHeavy ? 0.6 : 1)
        }
        break
      }
      case 'attack': {
        const act = this.act!
        act.frame++
        act.def.tick?.(this, act.frame, world)
        if (act.frame >= act.def.length) {
          this.act = null
          this.planned = null
          world.slots.release(this.id)
          this.cooldown = rand(...this.def.cooldown)
          this.setState('retreat')
        }
        break
      }
      case 'retreat':
        this.facing = toward
        this.vx = -toward * this.def.walkSpeed
        if (this.stateFrame >= RETREAT_FRAMES) this.setState('wait')
        break
      case 'fetch':
        this.updateFetch(world)
        break
      case 'pickup':
        this.vx = 0
        if (this.stateFrame >= PICKUP_FRAMES) this.setState('wait')
        break
      case 'hurt':
        this.vx *= 0.8
        if (this.stateFrame >= this.hitstun) this.setState('wait')
        break
      case 'launched':
      case 'juggled':
        // 在空中翻滾；空氣阻力讓往後退的速度慢慢變小
        this.rotation += this.spin
        this.spin *= 0.97
        if (this.state === 'juggled') this.vx *= 0.88
        break
      case 'down':
        this.vx *= 0.7
        if (this.stateFrame >= DOWN_FRAMES) this.setState(this.life.isDead ? 'dying' : 'getup')
        break
      case 'getup':
        if (this.stateFrame >= GETUP_FRAMES) this.setState('wait')
        break
      case 'dying':
        this.alpha = Math.max(0, 1 - this.stateFrame / DYING_FRAMES) * (this.stateFrame % 6 < 3 ? 1 : 0.4)
        if (this.stateFrame >= DYING_FRAMES) this.removed = true
        break
    }

    if (this.applyPhysics(world)) {
      if (this.spiked) {
        // 被下砸踢砸到地上：反彈一次再倒地
        this.spiked = false
        this.spin = -this.spin * 0.5
        this.vh = SPIKE_BOUNCE
        this.vx *= 0.5
        this.setState('launched')
        world.quake(3)
      } else if (this.state === 'launched' || this.state === 'juggled') {
        this.rotation = 0
        this.spin = 0
        this.setState('down')
        this.vx *= 0.4
      }
    }
  }

  /** 拿著有子彈的槍時保持較遠距離。 */
  private get hoverDistance(): number {
    const held = this.held
    if (held && categoryOf(held) === 'firearm' && held.uses > 0) return Math.max(this.def.hoverDistance, 130)
    if (held && categoryOf(held) === 'throwable') return 110
    return this.def.hoverDistance
  }

  private planMove(): PlannedMove {
    // 刀手的招牌：持刀衝刺突刺
    if (this.type === 'knifer' && this.held?.type === 'knife' && Math.random() < 0.6) {
      return { def: ENEMY_MOVES.thrust, range: ENEMY_MOVES.thrust.range }
    }
    if (this.held) return { def: itemAction(this.held, 'enemy'), range: itemRange(this.held) }
    const id = this.moves[Math.floor(Math.random() * this.moves.length)]
    return { def: ENEMY_MOVES[id], range: ENEMY_MOVES[id].range }
  }

  /** 空手且附近有想要的物件時，走過去撿。 */
  private tryFetch(world: World): boolean {
    if (this.held || this.def.pickups.length === 0) return false
    let best: ItemEntity | null = null
    for (const item of world.items) {
      if (!item.pickable || (item.reservedBy !== null && item.reservedBy !== this.id)) continue
      if (!this.def.pickups.includes(categoryOf(item.item))) continue
      if (categoryOf(item.item) === 'firearm' && item.item.uses <= 0) continue // 空槍不撿
      const d = Math.abs(item.x - this.x)
      if (d <= FETCH_RADIUS && (!best || d < Math.abs(best.x - this.x))) best = item
    }
    if (!best) return false
    best.reservedBy = this.id
    this.target = best
    this.setState('fetch')
    return true
  }

  private updateFetch(world: World): void {
    const item = this.target
    if (!item || !item.pickable || this.held) {
      this.dropReservation()
      this.setState('wait')
      return
    }
    const dx = item.x - this.x
    this.facing = dx < 0 ? -1 : 1
    if (Math.abs(dx) <= 6) {
      this.dropReservation()
      world.takeItem(item, this)
      this.setState('pickup')
    } else {
      this.vx = this.facing * this.def.walkSpeed
    }
  }

  private dropReservation(): void {
    if (this.target?.reservedBy === this.id) this.target.reservedBy = null
    this.target = null
  }

  private startAttack(def: ActionDef): void {
    this.setState('attack')
    this.vx = 0
    this.act = { def, frame: 0, hitIds: new Set(), chainQueued: false }
    def.onStart?.(this)
  }

  private setState(state: GruntState): void {
    if (this.state === 'fetch' && state !== 'fetch') this.dropReservation()
    this.state = state
    this.stateFrame = 0
  }

  protected usingMeleeItem(): boolean {
    return this.state === 'attack' && !!this.act?.def.itemUse
  }

  get wantsSlot(): boolean {
    return this.state === 'approach' || this.state === 'attack'
  }

  get attacking(): boolean {
    return this.state === 'attack'
  }

  get isGone(): boolean {
    return this.state === 'dying'
  }

  hurtbox(): Box | null {
    const s = this.state
    if (s === 'launched' || s === 'down' || s === 'getup' || s === 'dying') return null
    return this.bodyBox(STAND_HEIGHT)
  }

  activeHit(): ActiveHit | null {
    if (this.state === 'launched') {
      if (Math.abs(this.vx) < 1) return null
      return { spec: BUMP, box: this.relToWorld(BUMP.box), hitIds: this.bumpIds, hitsAllies: true }
    }
    const act = this.act
    const spec = act?.def.hit
    if (this.state !== 'attack' || !act || !spec) return null
    if (act.frame < spec.from || act.frame > spec.to) return null
    return { spec, box: this.attackBox(act.def, spec), hitIds: act.hitIds }
  }

  receiveHit(spec: HitSpec, dir: Facing, world: World): void {
    this.life.damage(spec.damage)
    this.flash = 4
    if (this.state === 'attack' && this.act?.def.armor && !this.life.isDead) return

    this.act = null
    this.planned = null
    this.facing = (-dir) as Facing

    if (!this.life.isDead && this.handleJuggle(spec, dir, world)) return

    if (spec.knockdown || this.life.isDead) {
      world.dropHeld(this)
      if (this.life.isDead && this.type === 'gunman' && Math.random() < AMMO_DROP_CHANCE) {
        world.dropItem(newItem('ammo'), this.x, this.h)
      }
      if (this.life.isDead && Math.random() < MEDKIT_DROP_CHANCE) {
        world.dropItem(newItem('medkit'), this.x, this.h)
      }
      this.setState('launched')
      this.bumpIds = new Set([this.id])
      this.spin = dir * 0.1
      this.vx = dir * Math.max(2.4, spec.knockback)
      this.vh = 3.4
    } else {
      this.setState('hurt')
      this.hitstun = spec.hitstun
      this.vx = dir * spec.knockback
    }
  }

  /**
   * 浮空相關的受擊：挑空技把人打上空中；浮空中再被打中就繼續停在空中（追擊），
   * 直到達到浮空上限或被下砸。回傳是否已處理。
   */
  private handleJuggle(spec: HitSpec, dir: Facing, world: World): boolean {
    const inAir = this.state === 'juggled'
    if (!inAir) {
      if (!spec.launch) return false
      world.dropHeld(this)
      this.setState('juggled')
      this.juggleHits = 1
      this.vh = spec.launch
      this.vx = 0 // 垂直往上飛，比較好追
      this.spin = dir * 0.08
      return true
    }

    this.juggleHits++
    if (spec.spike) {
      this.spiked = true
      this.setState('launched')
      this.vh = SPIKE_VELOCITY
      this.vx = dir * 1
      this.spin = dir * 0.3
    } else if (this.juggleHits >= JUGGLE_LIMIT) {
      this.setState('launched')
      this.vh = Math.max(this.vh, 2)
      this.vx = dir * 1.5
      this.spin = dir * 0.2
    } else {
      // 比特務高就彈得少、比特務低就彈得多，讓敵人一直停在特務附近的高度
      const above = this.h - world.agent.h
      this.vh = spec.launch ?? Math.min(JUGGLE_POP + 1, Math.max(JUGGLE_POP_MIN, JUGGLE_POP - above * 0.08))
      this.vx = dir * 0.6 // 搭配空氣阻力，每下約往後退 5px：看得出被打退，又不會飄出攻擊範圍
      this.spin = dir * 0.16
    }
    return true
  }

  protected currentGravity(): number {
    if (this.state !== 'juggled') return this.gravity
    return this.vh > 0 ? JUGGLE_RISE_GRAVITY : JUGGLE_FALL_GRAVITY
  }

  /** 正在空中被追擊。 */
  get juggled(): boolean {
    return this.state === 'juggled'
  }

  get label(): string {
    return this.def.label
  }

  get score(): number {
    return this.def.score
  }

  defeat(): void {
    if (this.life.isDead || this.removed) return
    this.life.damage(this.life.hp)
    this.act = null
    this.setState('launched')
    this.vx = -this.facing * 2
    this.vh = 3
  }

  pose(): Pose {
    switch (this.state) {
      case 'wait':
        return this.withHoldArms(
          Math.abs(this.vx) > 0.05 ? CLIPS.walk.sample(this.animFrame) : CLIPS.idle.sample(this.animFrame),
        )
      case 'approach':
      case 'retreat':
      case 'fetch':
        return this.withHoldArms(CLIPS.walk.sample(this.animFrame))
      case 'pickup':
        return CLIPS.pickup.sample(0)
      case 'attack':
        return this.act!.def.clip.sample(this.act!.frame)
      case 'hurt':
        return CLIPS.hurt.sample(0)
      case 'launched':
      case 'juggled':
        return CLIPS.launched.sample(0)
      case 'down':
      case 'dying':
        return CLIPS.lying.sample(0)
      case 'getup':
        return CLIPS.getup.sample(0)
    }
  }
}
