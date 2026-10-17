import type { ActionDef, ActionInstance, ActiveHit, Box, HitSpec } from '../combat/types'
import { Fighter } from '../fighter'
import type { Button, InputBuffer, InputSnapshot } from '../input/buttons'
import { SIMULTANEOUS_WINDOW, recognizeCommand, type Command, type CommandKind, type Facing } from '../input/commands'
import { LifePool } from '../life/lifePool'
import type { Pose } from '../stickman/pose'
import { CLIPS } from '../stickman/poses'
import type { World } from '../world'
import { MOVES, type MoveId } from './moves'

const WALK_SPEED = 1.5
const JUMP_VELOCITY = 6.2
const AIR_DRIFT = 1.6
/** 招式輸入可被保留的幀數（讓頓幀或收招中的輸入不會被吃掉）。 */
const COMMAND_BUFFER = 8
const JUMP_BUFFER = 6
const LAND_FRAMES = 4
const DOWN_FRAMES = 40
const GETUP_FRAMES = 18

const AERIAL: ReadonlySet<CommandKind> = new Set(['flyingKick', 'diveSmash'])
const MOVE_FOR: Record<CommandKind, MoveId> = {
  punch: 'punch1',
  kick: 'kick',
  desperation: 'desperation',
  flyingKick: 'flyingKick',
  diveSmash: 'diveSmash',
  dashPunch: 'dashPunch',
  sweep: 'sweep',
}

type AgentState = 'free' | 'action' | 'land' | 'hurt' | 'launched' | 'down' | 'getup'

export class Agent extends Fighter {
  readonly team = 'agent' as const
  readonly palette = { body: '#111111', back: '#4a4a4a' }

  private state: AgentState = 'free'
  private stateFrame = 0
  private animFrame = 0
  private act: ActionInstance | null = null
  private held: ReadonlySet<Button> = new Set()
  private buffered: { cmd: Command; until: number } | null = null
  private jumpUntil = -1
  private crouching = false
  private walking = false
  private airAttackUsed = false
  private hitstun = 0

  constructor(x: number) {
    super(x, new LifePool(2))
  }

  /** 每個實際幀都呼叫（包含頓幀期間），只負責收集輸入。 */
  readInput(snapshot: InputSnapshot, buffer: InputBuffer, realFrame: number): void {
    this.held = snapshot.held
    const cmd = recognizeCommand({
      frame: realFrame,
      presses: buffer.presses,
      airborne: this.airborne,
      crouching: this.held.has('down') && !this.airborne,
    })
    if (cmd) this.buffered = { cmd, until: realFrame + COMMAND_BUFFER }
    if (snapshot.pressed.includes('jump')) this.jumpUntil = realFrame + JUMP_BUFFER
  }

  update(world: World): void {
    const now = world.realFrame
    this.stateFrame++
    this.animFrame++
    if (this.invuln > 0) this.invuln--
    const cmd = this.buffered && this.buffered.until >= now ? this.buffered.cmd : null

    switch (this.state) {
      case 'free':
        this.updateFree(cmd, now)
        break
      case 'action':
        this.updateAction(cmd)
        break
      case 'land':
        if (this.stateFrame >= LAND_FRAMES) this.setState('free')
        break
      case 'hurt':
        this.vx *= 0.82
        if (this.stateFrame >= this.hitstun) this.setState('free')
        break
      case 'down':
        this.vx *= 0.8
        if (this.stateFrame >= DOWN_FRAMES) this.setState('getup')
        break
      case 'getup':
        if (this.stateFrame >= GETUP_FRAMES) {
          this.setState('free')
          this.invuln = 30
        }
        break
      case 'launched':
        break
    }

    if (this.applyPhysics(world)) this.onLand()
  }

  private updateFree(cmd: Command | null, now: number): void {
    if (cmd && this.tryStart(cmd)) return
    if (this.airborne) return

    const dir = this.heldDir()
    if (this.jumpUntil >= now) {
      this.jumpUntil = -1
      if (dir) this.facing = dir
      this.vx = dir * AIR_DRIFT
      this.vh = JUMP_VELOCITY
      this.crouching = false
      this.walking = false
      return
    }

    this.crouching = this.held.has('down')
    this.walking = !this.crouching && dir !== 0
    this.vx = this.walking ? dir * WALK_SPEED : 0
    if (dir) this.facing = dir
  }

  private updateAction(cmd: Command | null): void {
    const act = this.act!
    act.frame++
    act.def.tick?.(this, act.frame)

    if (cmd?.kind === 'punch' && act.def.chain && act.frame >= act.def.chain.accept) {
      act.chainQueued = true
      this.buffered = null
    } else if (cmd?.kind === 'desperation' && act.def.cancelToDesperation && act.frame <= SIMULTANEOUS_WINDOW + 1) {
      this.buffered = null
      this.startAction(MOVES.desperation)
      return
    }

    if (act.chainQueued && act.def.chain && act.frame >= act.def.chain.at) {
      this.startAction(MOVES[act.def.chain.next as MoveId])
      return
    }
    if (act.frame >= act.def.length) {
      this.act = null
      this.setState('free')
    }
  }

  private tryStart(cmd: Command): boolean {
    const aerial = AERIAL.has(cmd.kind)
    if (this.airborne) {
      if (!aerial || this.airAttackUsed) return false
      this.airAttackUsed = true
    } else if (aerial) {
      return false
    }
    if (cmd.dir) this.facing = cmd.dir
    this.buffered = null
    this.startAction(MOVES[MOVE_FOR[cmd.kind]])
    return true
  }

  private startAction(def: ActionDef): void {
    this.setState('action')
    this.act = { def, frame: 0, hitIds: new Set(), chainQueued: false }
    this.crouching = false
    this.walking = false
    if (!def.aerial) this.vx = 0
    if (def.invuln) this.invuln = def.length
    def.onStart?.(this)
  }

  private onLand(): void {
    this.airAttackUsed = false
    this.vx = 0
    if (this.state === 'launched') {
      this.setState('down')
      this.invuln = DOWN_FRAMES + GETUP_FRAMES
    } else if (this.state === 'free' || (this.state === 'action' && this.act?.def.aerial)) {
      this.act = null
      this.setState('land')
    }
  }

  private setState(state: AgentState): void {
    this.state = state
    this.stateFrame = 0
  }

  private heldDir(): -1 | 0 | 1 {
    const left = this.held.has('left')
    const right = this.held.has('right')
    return left === right ? 0 : left ? -1 : 1
  }

  hurtbox(): Box | null {
    if (this.state === 'down' || this.state === 'getup') return null
    if (this.crouching || this.act?.def === MOVES.sweep) return this.bodyBox(26)
    return this.bodyBox(this.airborne ? 36 : 40)
  }

  activeHit(): ActiveHit | null {
    const act = this.act
    const spec = act?.def.hit
    if (this.state !== 'action' || !act || !spec) return null
    if (act.frame < spec.from || act.frame > spec.to) return null
    return { spec, box: this.relToWorld(spec.box), hitIds: act.hitIds }
  }

  receiveHit(spec: HitSpec, dir: Facing): void {
    this.life.damage(spec.damage)
    this.act = null
    this.crouching = false
    this.facing = (-dir) as Facing
    if (spec.knockdown || this.life.isDead) {
      this.setState('launched')
      this.vx = dir * 2.4
      this.vh = 3.4
    } else {
      this.setState('hurt')
      this.hitstun = spec.hitstun
      this.vx = dir * spec.knockback
    }
  }

  pose(): Pose {
    switch (this.state) {
      case 'action':
        return this.act!.def.clip.sample(this.act!.frame)
      case 'land':
        return CLIPS.land.sample(0)
      case 'hurt':
        return CLIPS.hurt.sample(0)
      case 'launched':
        return CLIPS.launched.sample(0)
      case 'down':
        return CLIPS.lying.sample(0)
      case 'getup':
        return CLIPS.getup.sample(0)
      case 'free':
        if (this.airborne) return (this.vh > 0 ? CLIPS.jumpUp : CLIPS.jumpFall).sample(0)
        if (this.crouching) return CLIPS.crouch.sample(0)
        if (this.walking) return CLIPS.walk.sample(this.animFrame)
        return CLIPS.idle.sample(this.animFrame)
    }
  }
}
