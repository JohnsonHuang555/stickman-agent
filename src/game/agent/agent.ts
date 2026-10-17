import type { ActionDef, ActionInstance, ActiveHit, Box, HitSpec } from '../combat/types'
import { Fighter } from '../fighter'
import type { Button, InputBuffer, InputSnapshot } from '../input/buttons'
import { SIMULTANEOUS_WINDOW, recognizeCommand, type Command, type CommandKind, type Facing } from '../input/commands'
import { itemAction, throwActionFor } from '../items/itemActions'
import { categoryOf } from '../items/itemTypes'
import { LifePool } from '../life/lifePool'
import { CROUCH_HEIGHT, STAND_HEIGHT, type Pose } from '../stickman/pose'
import { CLIPS } from '../stickman/poses'
import type { World } from '../world'
import { MOVES, type MoveId } from './moves'

const WALK_SPEED = 2.1
/** 搬著櫃子時的移動速度倍率。 */
const HEAVY_CARRY_SPEED = 0.5
/** 搭配較小的重力：跳約 64px 高、滯空約 38 幀，方便空中連段。 */
const JUMP_VELOCITY = 6.8
const AGENT_GRAVITY = 0.36
const AIR_DRIFT = 2.2
/** 空中轉向時，每幀往目標速度靠近的比例。 */
const AIR_STEER = 0.15
/** 空中連段輔助：空中招式起手時往上帶的速度。 */
const AIR_RISE = 1.4
/** 招式輸入可被保留的幀數（讓頓幀或收招中的輸入不會被吃掉）。 */
const COMMAND_BUFFER = 10
const JUMP_BUFFER = 8
const LAND_FRAMES = 4
const DOWN_FRAMES = 40
const GETUP_FRAMES = 18
const PICKUP_FRAMES = 10
/** 空中連段收招結束後，還能接下一招的幀數。 */
const AIR_CHAIN_GRACE = 14

const AERIAL: ReadonlySet<CommandKind> = new Set(['flyingKick', 'diveSmash', 'airPunch'])
const MOVE_FOR: Record<CommandKind, MoveId> = {
  punch: 'punch1',
  kick: 'kick',
  desperation: 'desperation',
  launcher: 'launcher',
  airPunch: 'airPunch1',
  flyingKick: 'flyingKick',
  diveSmash: 'diveSmash',
  dashPunch: 'dashPunch',
  sweep: 'sweep',
}

type AgentState = 'free' | 'action' | 'land' | 'hurt' | 'launched' | 'down' | 'getup' | 'pickup'

export class Agent extends Fighter {
  readonly team = 'agent' as const
  readonly palette = { body: '#111111', back: '#4a4a4a' }
  protected readonly gravity = AGENT_GRAVITY

  private state: AgentState = 'free'
  private stateFrame = 0
  private animFrame = 0
  private act: ActionInstance | null = null
  private buttons: ReadonlySet<Button> = new Set()
  private buffered: { cmd: Command; until: number } | null = null
  private jumpUntil = -1
  private grabUntil = -1
  private grabAt = -1
  private bagUntil = -1
  private crouching = false
  private walking = false
  private airAttackUsed = false
  /** 附近有浮空的敵人：空中招式會懸停、往上帶（空中連段輔助）。 */
  private juggleAssist = false
  /** 空中連段收招後的寬限期：這段時間內按 on 仍可接 next。 */
  private airChain: { next: MoveId; on: string; frames: number } | null = null
  private hitstun = 0

  constructor(x: number) {
    super(x, new LifePool(2))
  }

  /** 每個實際幀都呼叫（包含頓幀期間），只負責收集輸入。 */
  readInput(snapshot: InputSnapshot, buffer: InputBuffer, realFrame: number): void {
    this.buttons = snapshot.held
    const cmd = recognizeCommand({
      frame: realFrame,
      presses: buffer.presses,
      airborne: this.airborne,
      crouching: this.buttons.has('down') && !this.airborne,
      up: this.buttons.has('up'),
      down: this.buttons.has('down'),
      held: this.buttons,
    })
    if (cmd) this.buffered = { cmd, until: realFrame + COMMAND_BUFFER }
    if (snapshot.pressed.includes('jump')) this.jumpUntil = realFrame + JUMP_BUFFER
    if (snapshot.pressed.includes('grab')) {
      this.grabUntil = realFrame + COMMAND_BUFFER
      this.grabAt = realFrame
    }
    // 保命招用到 C：取消這次的撿丟
    if (cmd?.kind === 'desperation') this.grabUntil = -1
    if (snapshot.pressed.includes('bag')) this.bagUntil = realFrame + COMMAND_BUFFER
  }

  update(world: World): void {
    const now = world.realFrame
    this.stateFrame++
    this.animFrame++
    this.juggleAssist = world.hasJuggledEnemyNear(this.x, this.h)
    if (this.invuln > 0) this.invuln--
    if (this.flash > 0) this.flash--
    if (this.airChain && --this.airChain.frames <= 0) this.airChain = null
    const cmd = this.buffered && this.buffered.until >= now ? this.buffered.cmd : null

    switch (this.state) {
      case 'free':
        this.updateFree(cmd, now, world)
        break
      case 'action':
        this.updateAction(cmd, now, world)
        break
      case 'land':
        if (this.stateFrame >= LAND_FRAMES) this.setState('free')
        break
      case 'pickup':
        if (this.stateFrame >= PICKUP_FRAMES) this.setState('free')
        break
      case 'hurt':
        this.vx *= 0.82
        if (this.stateFrame >= this.hitstun) this.setState('free')
        break
      case 'down':
        this.vx *= 0.8
        if (this.stateFrame >= DOWN_FRAMES && !this.life.isDead) this.setState('getup')
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

  private updateFree(cmd: Command | null, now: number, world: World): void {
    if (cmd && this.tryStart(cmd)) return
    // V：背包（收槍／掏槍／用醫療箱），空中也可以用
    if (this.bagUntil >= now) {
      this.bagUntil = -1
      world.useBag(this)
    }
    if (this.airborne) {
      this.steerInAir()
      return
    }

    // C 延遲 SIMULTANEOUS_WINDOW 幀才撿丟：這段時間內湊成 Z+X+C 就改放保命招
    if (this.grabUntil >= now && now - this.grabAt >= SIMULTANEOUS_WINDOW) {
      this.grabUntil = -1
      // 拿著槍時，腳邊的彈藥包優先於丟出
      const item = world.pickupCandidate(this)
      if (this.held && !(item && categoryOf(item.item) === 'ammo')) {
        this.startAction(throwActionFor('agent'))
        return
      }
      if (item) {
        world.takeItem(item, this)
        this.vx = 0
        this.setState('pickup')
        return
      }
    }

    const dir = this.heldDir()
    if (this.jumpUntil >= now && !this.carryingHeavy) {
      this.jumpUntil = -1
      this.startJump(dir)
      return
    }

    this.crouching = this.buttons.has('down') && !(this.held && categoryOf(this.held) === 'throwable')
    this.walking = !this.crouching && dir !== 0
    this.vx = this.walking ? dir * WALK_SPEED * (this.carryingHeavy ? HEAVY_CARRY_SPEED : 1) : 0
    if (dir) this.facing = dir
  }

  private updateAction(cmd: Command | null, now: number, world: World): void {
    const act = this.act!
    act.frame++
    act.def.tick?.(this, act.frame, world)

    const assist = act.def.airAssist
    if (assist && this.airborne) {
      if (assist.hover && this.juggleAssist) {
        // 空中連段：出手那幾幀幾乎停在半空，收招時慢慢往下掉
        this.vh = Math.max(this.vh, act.frame <= 6 ? -0.4 : -0.8)
        this.vx *= 0.85
      } else {
        this.steerVelocity()
      }
      // 平常跳起來揮空：提早收招，馬上可以再動、轉向
      const whiffed = !this.juggleAssist && act.hitIds.size === 0 && !act.chainQueued
      if (assist.whiffEnd !== undefined && whiffed && act.frame >= assist.whiffEnd) {
        this.act = null
        this.setState('free')
        return
      }
    }

    // 挑空技收招時按跳：直接起跳追擊
    if (act.def.jumpCancel !== undefined && act.frame >= act.def.jumpCancel && this.jumpUntil >= now && !this.airborne) {
      this.jumpUntil = -1
      this.act = null
      this.setState('free')
      this.startJump(this.heldDir())
      return
    }

    const chain = act.def.chain
    if (chain && cmd?.kind === (chain.on ?? 'punch') && act.frame >= chain.accept) {
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
      // 空中連段的收招結束後，仍有一小段寬限期可以接下一招
      const chain = act.def.chain
      if (this.airborne && act.def.aerial && chain) {
        this.airChain = { next: chain.next as MoveId, on: chain.on ?? 'punch', frames: AIR_CHAIN_GRACE }
      }
      this.act = null
      this.setState('free')
    }
  }

  /**
   * 空手：依指令出招。
   * 持有物件：z 系指令一律變成使用持有物，x 仍是踢，招式全部停用。
   */
  private tryStart(cmd: Command): boolean {
    if (this.held) {
      if (this.airborne) return false
      this.buffered = null
      this.startAction(cmd.kind === 'kick' ? MOVES.kick : itemAction(this.held, 'agent'))
      return true
    }

    if (this.airborne && this.airChain && cmd.kind === this.airChain.on) {
      const next = MOVES[this.airChain.next]
      this.airChain = null
      this.buffered = null
      this.startAction(next)
      return true
    }

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

  /** 空中：按方向鍵轉身，並逐漸往該方向調整速度（保留跳躍的慣性）。 */
  private steerInAir(): void {
    const dir = this.heldDir()
    if (!dir) return
    this.facing = dir
    this.steerVelocity(dir)
  }

  /** 只調整速度、不轉身（空中出招期間用）。 */
  private steerVelocity(dir: -1 | 0 | 1 = this.heldDir()): void {
    if (dir) this.vx += (dir * AIR_DRIFT - this.vx) * AIR_STEER
  }

  private startJump(dir: -1 | 0 | 1): void {
    if (dir) this.facing = dir
    this.vx = dir * AIR_DRIFT
    this.vh = JUMP_VELOCITY
    this.crouching = false
    this.walking = false
  }

  private startAction(def: ActionDef): void {
    this.setState('action')
    this.act = { def, frame: 0, hitIds: new Set(), chainQueued: false }
    this.crouching = false
    this.walking = false
    if (!def.aerial) this.vx = 0
    // 空中出招（含連段的下一招）用當下按著的方向：敵人飄到身後時可以轉身打
    if (def.aerial && this.airborne && this.heldDir()) this.facing = this.heldDir() as Facing
    if (def.invuln) this.invuln = def.length
    def.onStart?.(this)
    // 空中連段輔助：附近有浮空的敵人時，起手往上帶一點，跟著敵人一起升高
    if (def.airAssist?.rise && this.juggleAssist) this.vh = Math.max(this.vh, AIR_RISE)
  }

  private onLand(): void {
    this.airChain = null
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
    const left = this.buttons.has('left')
    const right = this.buttons.has('right')
    return left === right ? 0 : left ? -1 : 1
  }

  protected usingMeleeItem(): boolean {
    return this.state === 'action' && !!this.act?.def.itemUse
  }

  /** 敵人是否該對特務出手（倒地、起身、無敵中都不算）。 */
  get vulnerable(): boolean {
    return this.invuln === 0 && this.state !== 'launched' && this.state !== 'down' && this.state !== 'getup'
  }

  /** 陣亡且倒地演出結束。 */
  get defeated(): boolean {
    return this.state === 'down' && this.life.isDead && this.stateFrame > 60
  }

  hurtbox(): Box | null {
    if (this.state === 'down' || this.state === 'getup') return null
    if (this.crouching || this.act?.def === MOVES.sweep) return this.bodyBox(CROUCH_HEIGHT)
    return this.bodyBox(this.airborne ? STAND_HEIGHT - 4 : STAND_HEIGHT)
  }

  activeHit(): ActiveHit | null {
    const act = this.act
    const spec = act?.def.hit
    if (this.state !== 'action' || !act || !spec) return null
    if (act.frame < spec.from || act.frame > spec.to) return null
    return { spec, box: this.attackBox(act.def, spec), hitIds: act.hitIds }
  }

  receiveHit(spec: HitSpec, dir: Facing, world: World): void {
    this.life.damage(spec.damage)
    this.flash = 4
    this.act = null
    this.crouching = false
    this.facing = (-dir) as Facing
    if (spec.knockdown || this.life.isDead) {
      world.dropHeld(this)
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
        return this.withHoldArms(CLIPS.land.sample(0))
      case 'pickup':
        return CLIPS.pickup.sample(0)
      case 'hurt':
        return CLIPS.hurt.sample(0)
      case 'launched':
        return CLIPS.launched.sample(0)
      case 'down':
        return CLIPS.lying.sample(0)
      case 'getup':
        return CLIPS.getup.sample(0)
      case 'free':
        if (this.airborne) return this.withHoldArms((this.vh > 0 ? CLIPS.jumpUp : CLIPS.jumpFall).sample(0))
        if (this.crouching) return CLIPS.crouch.sample(0)
        if (this.walking) return this.withHoldArms(CLIPS.walk.sample(this.animFrame))
        return this.withHoldArms(CLIPS.idle.sample(this.animFrame))
    }
  }
}
