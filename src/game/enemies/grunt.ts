import type { ActiveHit, Box, HitSpec } from '../combat/types'
import { Fighter } from '../fighter'
import type { Facing } from '../input/commands'
import { LifePool } from '../life/lifePool'
import type { Palette, Pose } from '../stickman/pose'
import { CLIPS } from '../stickman/poses'
import type { World } from '../world'
import { ENEMY_TYPES, randomPalette, type EnemyType } from './enemyTypes'

const DOWN_FRAMES = 40
const GETUP_FRAMES = 18
const DYING_FRAMES = 40

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

type GruntState = 'idle' | 'hurt' | 'launched' | 'down' | 'getup' | 'dying'

/** 雜兵。目前尚無 AI，只會面向特務並承受攻擊。 */
export class Grunt extends Fighter {
  readonly team = 'gang' as const
  readonly palette: Palette
  readonly scale: number
  removed = false

  private state: GruntState = 'idle'
  private stateFrame = 0
  private hitstun = 0
  private bumpIds = new Set<number>()

  constructor(
    x: number,
    readonly type: EnemyType,
  ) {
    super(x, new LifePool(1, ENEMY_TYPES[type].hp))
    this.palette = randomPalette(type)
    this.scale = ENEMY_TYPES[type].scale
    this.stateFrame = Math.floor(Math.random() * 60)
  }

  update(world: World): void {
    this.stateFrame++
    switch (this.state) {
      case 'idle':
        this.vx = 0
        this.facing = world.agent.x < this.x ? -1 : 1
        break
      case 'hurt':
        this.vx *= 0.8
        if (this.stateFrame >= this.hitstun) this.setState('idle')
        break
      case 'launched':
        break
      case 'down':
        this.vx *= 0.7
        if (this.stateFrame >= DOWN_FRAMES) this.setState(this.life.isDead ? 'dying' : 'getup')
        break
      case 'getup':
        if (this.stateFrame >= GETUP_FRAMES) this.setState('idle')
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

  private setState(state: GruntState): void {
    this.state = state
    this.stateFrame = 0
  }

  hurtbox(): Box | null {
    return this.state === 'idle' || this.state === 'hurt' ? this.bodyBox(40) : null
  }

  activeHit(): ActiveHit | null {
    if (this.state !== 'launched' || Math.abs(this.vx) < 1) return null
    return { spec: BUMP, box: this.relToWorld(BUMP.box), hitIds: this.bumpIds, hitsAllies: true }
  }

  receiveHit(spec: HitSpec, dir: Facing): void {
    this.life.damage(spec.damage)
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
    return ENEMY_TYPES[this.type].label
  }

  pose(): Pose {
    switch (this.state) {
      case 'idle':
        return CLIPS.idle.sample(this.stateFrame)
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
