import type { ActionInstance, ActiveHit, Box, HitSpec } from '../combat/types'
import { Fighter } from '../fighter'
import type { Facing } from '../input/commands'
import { LifePool } from '../life/lifePool'
import type { Palette, Pose } from '../stickman/pose'
import { CLIPS } from '../stickman/poses'
import type { World } from '../world'
import { ENEMY_MOVES, type EnemyMove, type EnemyMoveId } from './enemyMoves'
import { ENEMY_TYPES, randomPalette, type EnemyType } from './enemyTypes'

const DOWN_FRAMES = 40
const GETUP_FRAMES = 18
const DYING_FRAMES = 40
const RETREAT_FRAMES = 18

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

type GruntState = 'approach' | 'wait' | 'attack' | 'retreat' | 'hurt' | 'launched' | 'down' | 'getup' | 'dying'

const rand = (min: number, max: number) => min + Math.random() * (max - min)

export interface GruntOptions {
  /** 不動也不攻擊，只承受攻擊（測試用）。 */
  passive?: boolean
  /** 覆寫此雜兵會出的招式（小 Boss 或測試用）。 */
  moves?: readonly EnemyMoveId[]
}

/**
 * 雜兵 AI：
 * - 取得攻擊名額 → 接近 → 出招 → 後退 → 冷卻
 * - 沒有名額 → 在一段距離外徘徊等待
 */
export class Grunt extends Fighter {
  readonly team = 'gang' as const
  readonly palette: Palette
  readonly scale: number
  removed = false

  private state: GruntState = 'wait'
  private stateFrame = 0
  private animFrame = Math.floor(Math.random() * 60)
  private hitstun = 0
  private cooldown = rand(20, 60)
  private nextMove: EnemyMove
  private act: ActionInstance | null = null
  private bumpIds = new Set<number>()
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
    this.nextMove = this.pickMove()
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
        const hover = this.def.hoverDistance + this.hoverJitter
        const speed = this.def.walkSpeed
        if (dist < hover - 8) this.vx = -toward * speed * 0.7
        else if (dist > hover + 8) this.vx = toward * speed * 0.8
        else this.vx = 0
        if (canEngage && this.cooldown <= 0 && world.slots.request(this.id)) this.setState('approach')
        break
      }
      case 'approach':
        this.facing = toward
        if (!canEngage || !world.slots.request(this.id)) {
          world.slots.release(this.id)
          this.setState('wait')
        } else if (dist <= this.nextMove.range) {
          this.startAttack()
        } else {
          this.vx = toward * this.def.walkSpeed
        }
        break
      case 'attack': {
        const act = this.act!
        act.frame++
        act.def.tick?.(this, act.frame)
        if (act.frame >= act.def.length) {
          this.act = null
          world.slots.release(this.id)
          this.cooldown = rand(...this.def.cooldown)
          this.nextMove = this.pickMove()
          this.setState('retreat')
        }
        break
      }
      case 'retreat':
        this.facing = toward
        this.vx = -toward * this.def.walkSpeed
        if (this.stateFrame >= RETREAT_FRAMES) this.setState('wait')
        break
      case 'hurt':
        this.vx *= 0.8
        if (this.stateFrame >= this.hitstun) this.setState('wait')
        break
      case 'launched':
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

    if (this.applyPhysics(world) && this.state === 'launched') {
      this.setState('down')
      this.vx *= 0.4
    }
  }

  private pickMove(): EnemyMove {
    const ids = this.moves
    return ENEMY_MOVES[ids[Math.floor(Math.random() * ids.length)]]
  }

  private startAttack(): void {
    this.setState('attack')
    this.vx = 0
    this.act = { def: this.nextMove, frame: 0, hitIds: new Set(), chainQueued: false }
    this.nextMove.onStart?.(this)
  }

  private setState(state: GruntState): void {
    this.state = state
    this.stateFrame = 0
  }

  /** 是否正持有（或想取得）攻擊名額的狀態；離開這些狀態時由 World 收回名額。 */
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
    return this.bodyBox(40)
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
    return { spec, box: this.relToWorld(spec.box), hitIds: act.hitIds }
  }

  receiveHit(spec: HitSpec, dir: Facing): void {
    this.life.damage(spec.damage)
    this.flash = 4
    if (this.state === 'attack' && this.act?.def.armor && !this.life.isDead) return

    this.act = null
    this.facing = (-dir) as Facing
    if (spec.knockdown || this.life.isDead) {
      this.setState('launched')
      this.bumpIds = new Set([this.id])
      this.vx = dir * Math.max(2.4, spec.knockback)
      this.vh = 3.4
    } else {
      this.setState('hurt')
      this.hitstun = spec.hitstun
      this.vx = dir * spec.knockback
    }
  }

  get label(): string {
    return this.def.label
  }

  pose(): Pose {
    switch (this.state) {
      case 'wait':
        return Math.abs(this.vx) > 0.05 ? CLIPS.walk.sample(this.animFrame) : CLIPS.idle.sample(this.animFrame)
      case 'approach':
      case 'retreat':
        return CLIPS.walk.sample(this.animFrame)
      case 'attack':
        return this.act!.def.clip.sample(this.act!.frame)
      case 'hurt':
        return CLIPS.hurt.sample(0)
      case 'launched':
        return CLIPS.launched.sample(0)
      case 'down':
      case 'dying':
        return CLIPS.lying.sample(0)
      case 'getup':
        return CLIPS.getup.sample(0)
    }
  }
}
