import type { ActionDef, ActionInstance, ActiveHit, Box, HitSpec } from '../combat/types'
import { GROUND_Y } from '../constants'
import { Fighter } from '../fighter'
import type { Button, InputBuffer, InputSnapshot } from '../input/buttons'
import { SIMULTANEOUS_WINDOW, doubleTapDirection, recognizeCommand, type Command, type CommandKind, type Facing } from '../input/commands'
import { itemAction, throwActionFor } from '../items/itemActions'
import { categoryOf } from '../items/itemTypes'
import { LifePool } from '../life/lifePool'
import { CROUCH_HEIGHT, STAND_HEIGHT, frontHand, lerpPose, poseBall, posePoints, type Pose } from '../stickman/pose'
import { CLIPS, JOG_CYCLE_DISTANCE, POSES, RUN_CYCLE_DISTANCE, runPose, walkPose } from '../stickman/poses'
import type { World } from '../world'
import { GRAB, GRAB_CLIPS, GRAB_HITS, swingAngle, type GrabMove } from './grab'
import { MOVES, type MoveId } from './moves'
import type { Enemy } from '../enemies/enemy'
import type { Grunt } from '../enemies/grunt'

const WALK_SPEED = 2.1
/** 連按兩下方向鍵（第二下按住）就跑步。 */
const RUN_SPEED = 3.2
/** 起跑後幾幀從小跑步加速到全速（速度、步伐、擺手、前傾一起增加）。 */
const RUN_RAMP_FRAMES = 24
/** 踢腿在這一幀之前再按 X，可以改成踢下體（踢腿第 6 幀才踢出去）。 */
const GROIN_CANCEL_FRAME = 10
/** 第二下按下後幾幀內還按著同方向，就開始跑。 */
const RUN_START_WINDOW = 6
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
/** 蹬牆跳：離牆多近算貼著牆、往外跳的水平速度與起跳速度。 */
const WALL_TOUCH = 3
const WALL_JUMP_SPEED = 2.8
const WALL_JUMP_VELOCITY = 6.2
/** 招式輸入可被保留的幀數（讓頓幀或收招中的輸入不會被吃掉）。 */
const COMMAND_BUFFER = 10
const JUMP_BUFFER = 8
const LAND_FRAMES = 4
/** 換姿勢時的補間幀數。 */
const POSE_BLEND = 6
/** 換到這些姿勢不補間：出招、被打要立刻看得出來。 */
const SNAP_POSES = new Set(['action', 'hurt', 'launched', 'down'])
/** 垂直速度在 ±這個值之間時，從上升姿勢轉成下落姿勢（約 11 幀）。 */
const APEX_BLEND_SPEED = 2
const DOWN_FRAMES = 40
const GETUP_FRAMES = 18
const PICKUP_FRAMES = 10
/** 空中連段收招結束後，還能接下一招的幀數。 */
const AIR_CHAIN_GRACE = 14
/** 跳躍與出拳／踢腿相差幾幀內按下，視為「跳起來出招」。 */
const JUMP_ATTACK_WINDOW = SIMULTANEOUS_WINDOW

const AERIAL: ReadonlySet<CommandKind> = new Set(['flyingKick', 'airKick', 'diveSmash', 'airPunch'])

/** 連段的 on 可以是一種或多種輸入。 */
const accepts = (on: string | readonly string[], kind: string) => (typeof on === 'string' ? on === kind : on.includes(kind))
const MOVE_FOR: Record<CommandKind, MoveId> = {
  punch: 'punch1',
  kick: 'kick',
  desperation: 'desperation',
  launcher: 'launcher',
  airPunch: 'airPunch1',
  airKick: 'airKick',
  flyingKick: 'flyingKick',
  diveSmash: 'diveSmash',
  dashPunch: 'dashPunch',
  sweep: 'sweep',
  crouchPunch: 'crouchPunch',
  runKick: 'runKick',
  groinKick: 'groinKick',
}

type AgentState = 'free' | 'action' | 'land' | 'hurt' | 'launched' | 'down' | 'getup' | 'pickup' | 'grab'

export class Agent extends Fighter {
  readonly team = 'agent' as const
  readonly palette = { body: '#111111', back: '#4a4a4a' }
  protected readonly gravity = AGENT_GRAVITY

  private state: AgentState = 'free'
  private stateFrame = 0
  private animFrame = 0
  /** 換姿勢補間：從哪個姿勢、哪一幀開始。 */
  private blendFrom: Pose | null = null
  private blendAt = 0
  private poseKeyNow = 'idle'
  private shownPose: Pose = POSES.idleA
  private act: ActionInstance | null = null
  /** 抓技：抓著的雜兵、目前的動作與幀數、已經膝撞幾下、大風車已掃到的敵人。 */
  private grabbed: Grunt | null = null
  private grabMove: GrabMove = 'hold'
  private grabFrame = 0
  private grabHoldFrames = 0
  private knees = 0
  private grabFacing: Facing = 1
  private swingHits = new Set<number>()
  private buttons: ReadonlySet<Button> = new Set()
  private buffered: { cmd: Command; until: number } | null = null
  private jumpUntil = -1
  private grabUntil = -1
  private grabAt = -1
  private bagUntil = -1
  private crouching = false
  /** 正在跑步的方向（0 = 沒在跑）。 */
  private running: Facing | 0 = 0
  /** 這次跑了幾幀（加速用）與跑步循環的相位。 */
  private runFrames = 0
  private runPhase = 0
  /** 剛連按兩下的方向；在 RUN_START_WINDOW 內還按著就開始跑。 */
  private runRequest: { dir: Facing; until: number } | null = null
  private walking = false
  private airAttackUsed = false
  /** 附近有浮空的敵人：空中招式會懸停、往上帶（空中連段輔助）。 */
  private juggleAssist = false
  /** 上一次蹬的是哪一面牆（-1 左、1 右）；落地後重設。 */
  private lastWallSide: -1 | 0 | 1 = 0
  /** 空中連段收招後的寬限期：這段時間內按 on 仍可接 next。 */
  private airChain: { next: MoveId; on: string | readonly string[]; frames: number } | null = null
  private hitstun = 0

  constructor(x: number) {
    super(x, new LifePool(3))
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
      running: this.state === 'free' && !this.airborne ? this.running : 0,
    })
    if (cmd) this.buffered = { cmd, until: realFrame + COMMAND_BUFFER }
    // 連按兩下 ← 或 →：準備跑步
    const tapped = snapshot.pressed.includes('right') ? 1 : snapshot.pressed.includes('left') ? -1 : 0
    if (tapped && doubleTapDirection(buffer.presses, realFrame) === tapped) {
      this.runRequest = { dir: tapped, until: realFrame + RUN_START_WINDOW }
    }
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
      case 'grab':
        this.updateGrab(cmd, now, world)
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
    // 只有翻滾時身體會旋轉；被打斷或做別的動作時立刻轉正
    if (this.state !== 'action' || this.act?.def !== MOVES.roll) this.rotation = 0
    this.trackPoseBlend()
  }

  private updateFree(cmd: Command | null, now: number, world: World): void {
    if (cmd && this.tryJumpAttack(cmd.kind, now)) return
    if (cmd && this.tryStart(cmd)) return
    // V：背包（收槍／掏槍／用醫療箱），空中也可以用
    if (this.bagUntil >= now) {
      this.bagUntil = -1
      world.useBag(this)
    }
    if (this.airborne) {
      if (this.jumpUntil >= now && this.tryWallJump(world)) return
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
      // 空手、腳邊沒東西：抓住面前的雜兵
      const target = this.held ? null : world.grabTarget(this)
      if (target) {
        this.startGrab(target, world)
        return
      }
    }

    const dir = this.heldDir()
    if (this.jumpUntil >= now && !this.carryingHeavy) {
      this.jumpUntil = -1
      // ↓+空白：翻滾（往按著的方向，沒按就往面對的方向）
      if (this.buttons.has('down')) {
        if (dir) this.facing = dir
        this.startAction(MOVES.roll)
      } else {
        this.startJump(dir)
      }
      return
    }

    this.crouching = this.wantsCrouch()
    // 跑步：連按兩下後還按著同方向就開始跑；放開、換方向、蹲下、搬重物就停下
    if (this.runRequest && this.runRequest.until >= now && dir === this.runRequest.dir) {
      this.running = dir
      this.runRequest = null
      this.runFrames = 0
      this.runPhase = 0.25 // 從前腳往前的姿勢開始跑
    }
    if (this.running && (dir !== this.running || this.crouching || this.carryingHeavy)) this.running = 0
    this.walking = !this.crouching && dir !== 0
    let speed = WALK_SPEED * (this.carryingHeavy ? HEAVY_CARRY_SPEED : 1)
    if (this.running) {
      this.runFrames++
      const ramp = this.runIntensity
      speed = WALK_SPEED + (RUN_SPEED - WALK_SPEED) * ramp
      // 步伐跟著速度變大：小跑步時一步短、全速時一步長，手腳擺動的節奏維持自然
      this.runPhase += speed / (JOG_CYCLE_DISTANCE + (RUN_CYCLE_DISTANCE - JOG_CYCLE_DISTANCE) * ramp)
    }
    this.vx = this.walking ? dir * speed : 0
    if (dir) this.facing = dir
  }

  private updateAction(cmd: Command | null, now: number, world: World): void {
    const act = this.act!
    act.frame++

    // 先按攻擊、緊接著按跳：地面招式才剛起手就取消，改成起跳後的空中招式
    if (act.frame <= JUMP_ATTACK_WINDOW) {
      const kind = act.def === MOVES.punch1 ? 'punch' : act.def === MOVES.kick ? 'kick' : null
      if (kind && this.tryJumpAttack(kind, now)) return
    }

    // 第一下踢腿還沒踢出去就再按 X：改成踢下體
    if (cmd?.kind === 'groinKick' && act.def === MOVES.kick && act.frame <= GROIN_CANCEL_FRAME) {
      this.buffered = null
      this.startAction(MOVES.groinKick)
      return
    }

    // 拳腳打中後的收招可以按 C 直接抓住面前的敵人
    const spec = act.def.hit
    const grabReady = this.grabUntil >= now && now - this.grabAt >= SIMULTANEOUS_WINDOW
    if (grabReady && !this.held && !act.def.aerial && spec && act.frame > spec.to && act.hitIds.size > 0) {
      // 和站著按 C 一樣：腳邊有東西先撿，沒有才抓人
      const item = world.pickupCandidate(this)
      if (item) {
        this.grabUntil = -1
        this.act = null
        world.takeItem(item, this)
        this.vx = 0
        this.setState('pickup')
        return
      }
      const target = world.grabTarget(this)
      if (target) {
        this.grabUntil = -1
        this.act = null
        this.startGrab(target, world)
        return
      }
    }

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
    if (chain && cmd && accepts(chain.on ?? 'punch', cmd.kind) && act.frame >= chain.accept) {
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
      // 蹲拳／掃腿收招時還按著 ↓：直接回到蹲姿，不要閃一幀站姿
      this.crouching = this.wantsCrouch()
    }
  }

  /** 起跑加速的進度：0 = 剛起跑、1 = 全速。 */
  private get runIntensity(): number {
    return Math.min(1, this.runFrames / RUN_RAMP_FRAMES)
  }

  private wantsCrouch(): boolean {
    return !this.airborne && this.buttons.has('down') && !(this.held && categoryOf(this.held) === 'throwable')
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

    if (this.airborne && this.airChain && accepts(this.airChain.on, cmd.kind)) {
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

  /**
   * 蹬牆跳：在空中貼著牆按跳，往反方向跳出，並可以再出一次空中招式。
   * 不能連續蹬同一面牆（左右交替可以）。
   */
  private tryWallJump(world: World): boolean {
    const { left, right } = world.wallBounds()
    const side = this.x <= left + WALL_TOUCH ? -1 : this.x >= right - WALL_TOUCH ? 1 : 0
    if (!side || side === this.lastWallSide) return false
    this.jumpUntil = -1
    this.lastWallSide = side
    const away = -side as Facing
    this.facing = away
    this.vx = away * WALL_JUMP_SPEED
    this.vh = WALL_JUMP_VELOCITY
    this.airAttackUsed = false
    this.airChain = null
    world.burst(this.x + side * 4, GROUND_Y - this.h - 10, '#d8d0c0')
    world.sound('throw')
    return true
  }

  /**
   * 跳躍和出拳／踢腿幾乎同時按下：優先起跳，攻擊改成對應的空中招式
   * （拳 → 空中拳；踢 → 空中踢，按著方向就是飛踢），在起跳後的下一幀出手。
   */
  private tryJumpAttack(kind: CommandKind, now: number): boolean {
    if (kind !== 'punch' && kind !== 'kick') return false
    if (this.airborne || this.jumpUntil < now || this.held || this.carryingHeavy || this.buttons.has('down')) return false
    const dir = this.heldDir()
    this.jumpUntil = -1
    this.act = null
    this.setState('free')
    this.startJump(dir)
    const aerial: Command =
      kind === 'punch' ? { kind: 'airPunch' } : dir ? { kind: 'flyingKick', dir } : { kind: 'airKick' }
    this.buffered = { cmd: aerial, until: now + COMMAND_BUFFER }
    return true
  }

  private startJump(dir: -1 | 0 | 1): void {
    if (dir) this.facing = dir
    this.vx = dir * (this.running === dir && dir ? Math.max(AIR_DRIFT, WALK_SPEED + (RUN_SPEED - WALK_SPEED) * this.runIntensity) : AIR_DRIFT)
    this.running = 0
    this.vh = JUMP_VELOCITY
    this.crouching = false
    this.walking = false
  }

  private startAction(def: ActionDef): void {
    this.running = 0
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
    this.lastWallSide = 0
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
    if (state !== 'free') this.running = 0
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

  /** 正在做低姿勢的動作（蹲拳、掃腿、翻滾）：受擊框維持蹲姿高度。 */
  private get lowAction(): boolean {
    const def = this.act?.def
    return this.state === 'action' && (def === MOVES.crouchPunch || def === MOVES.sweep || def === MOVES.roll)
  }

  hurtbox(): Box | null {
    if (this.state === 'down' || this.state === 'getup') return null
    if (this.crouching || this.lowAction) return this.bodyBox(CROUCH_HEIGHT)
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
    this.releaseGrab()
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

  /**
   * 實際畫出來的姿勢：起跳、落地、走停、蹲站這類換姿勢時，
   * 從上一幀畫面的姿勢補間 POSE_BLEND 幀過去，不會一瞬間跳格。
   */
  pose(): Pose {
    const target = this.targetPose()
    const k = this.animFrame - this.blendAt
    if (!this.blendFrom || k >= POSE_BLEND) return target
    const t = (k + 1) / (POSE_BLEND + 1)
    return lerpPose(this.blendFrom, target, 1 - (1 - t) * (1 - t))
  }

  /** 每幀更新完呼叫：姿勢的來源換了就從目前畫面開始補間（出招、被打不補間，要立刻反應）。 */
  private trackPoseBlend(): void {
    const key = this.poseKey()
    if (key !== this.poseKeyNow) {
      this.blendFrom = SNAP_POSES.has(key) ? null : this.shownPose
      this.blendAt = this.animFrame
      this.poseKeyNow = key
    }
    this.shownPose = this.pose()
  }

  // ── 抓技 ──────────────────────────────────────────

  private startGrab(target: Grunt, world: World): void {
    target.seize(world)
    this.facing = target.x >= this.x ? 1 : -1
    this.grabbed = target
    this.vx = 0
    this.walking = false
    this.crouching = false
    this.grabHoldFrames = 0
    this.knees = 0
    this.setGrabMove('hold')
    this.setState('grab')
    this.placeGrabbed()
  }

  private setGrabMove(move: GrabMove): void {
    this.grabMove = move
    this.grabFrame = 0
    this.grabFacing = this.facing
  }

  /** 放開抓著的人（被打、抓太久）。 */
  private releaseGrab(): void {
    if (this.grabbed) {
      this.grabbed.squash = null
      this.grabbed.heldPose = null
    }
    this.grabbed?.breakFree(this.x)
    this.grabbed = null
  }

  private endGrab(): void {
    this.releaseGrab()
    this.setState('free')
  }

  private updateGrab(cmd: Command | null, now: number, world: World): void {
    this.vx = 0
    this.grabFrame++
    // 抓著的人已經不在手上（被撞倒、被打死）：動作做完就回到自由狀態
    if (this.grabbed && !this.grabbed.isGrabbed) this.grabbed = null

    switch (this.grabMove) {
      case 'hold': {
        if (!this.grabbed) return this.endGrab()
        if (++this.grabHoldFrames >= GRAB.hold) return this.endGrab()
        const kind = cmd?.kind
        if (kind === 'punch' || kind === 'launcher' || kind === 'dashPunch' || kind === 'crouchPunch') {
          this.buffered = null
          this.setGrabMove('knee')
        } else if (kind === 'kick' || kind === 'sweep') {
          this.buffered = null
          const back = this.heldDir() === -this.facing
          this.setGrabMove(back ? 'suplex' : 'throw')
          if (back) this.invuln = GRAB.suplex.length
        } else if (this.jumpUntil >= now) {
          this.jumpUntil = -1
          this.swingHits = new Set()
          this.setGrabMove('swing')
          this.invuln = GRAB.swing.length
        }
        break
      }
      case 'knee':
        if (this.grabFrame === GRAB.knee.hitAt && this.grabbed) {
          this.knees++
          const last = this.knees >= GRAB.knee.max
          this.grabHit(this.grabbed, last ? GRAB_HITS.lastKnee : GRAB_HITS.knee, this.facing, world)
          if (this.grabbed && !this.grabbed.isGrabbed) this.grabbed = null
        }
        if (this.grabFrame >= GRAB.knee.length) {
          if (!this.grabbed) return this.endGrab()
          this.setGrabMove('hold')
        }
        break
      case 'throw':
        if (this.grabFrame === GRAB.throw.releaseAt && this.grabbed) {
          const target = this.grabbed
          this.grabbed = null
          this.grabHit(target, GRAB_HITS.throw, this.facing, world)
        }
        if (this.grabFrame >= GRAB.throw.length) return this.endGrab()
        break
      case 'suplex':
        if (this.grabFrame === GRAB.suplex.slamAt && this.grabbed) {
          const target = this.grabbed
          this.grabbed = null
          this.grabHit(target, GRAB_HITS.suplex, (-this.grabFacing) as Facing, world)
          // 背部著地直接倒下，不會再被彈飛
          target.slamDown((-this.grabFacing) as Facing)
          world.quake(4)
        }
        if (this.grabFrame >= GRAB.suplex.length) return this.endGrab()
        break
      case 'swing': {
        const f = this.grabFrame
        const sw = GRAB.swing
        if (f === sw.headbuttAt && this.grabbed) {
          // 先用頭槌把對方撞暈
          this.grabHit(this.grabbed, GRAB_HITS.headbutt, this.facing, world)
          if (this.grabbed && !this.grabbed.isGrabbed) this.grabbed = null
        }
        // 對方在甩出去之前就倒了（被頭槌打死）：直接結束
        if (!this.grabbed && f < sw.releaseAt) return this.endGrab()
        if (this.grabbed && f < sw.releaseAt) {
          // 轉的時候一直面向被甩的人
          if (f >= sw.spinFrom) this.facing = (Math.cos(swingAngle(f)) >= 0 ? this.grabFacing : -this.grabFacing) as Facing
          this.placeGrabbed()
          if (f >= sw.sweepFrom) this.swingSweep(world)
        }
        if (f === GRAB.swing.releaseAt && this.grabbed) {
          this.facing = this.grabFacing
          const target = this.grabbed
          this.grabbed = null
          target.squash = null
          target.heldPose = null
          target.holdAt(target.x, Math.max(target.h, 6), (-this.grabFacing) as Facing, 0)
          this.grabHit(target, GRAB_HITS.swingRelease, this.grabFacing, world)
          // 從手上往斜上方飛出去
          target.vh = Math.max(target.vh, GRAB.swing.releaseLift)
        }
        if (f >= GRAB.swing.length) return this.endGrab()
        break
      }
    }
    this.placeGrabbed()
  }

  /** 依目前的抓技動作，把抓著的人擺到該在的位置。過肩摔與大風車時跟著特務的手走。 */
  private placeGrabbed(): void {
    const g = this.grabbed
    if (!g) return
    g.squash = null
    switch (this.grabMove) {
      case 'suplex':
        return this.placeSuplexed(g)
      case 'swing':
        if (this.grabFrame >= GRAB.swing.fallFrom) return this.placeSwung(g)
        g.holdAt(this.x + this.facing * GRAB.distance, 0, (-this.facing) as Facing, 0)
        return
      case 'knee': {
        const lifted = this.grabFrame >= GRAB.knee.hitAt && this.grabFrame < GRAB.knee.hitAt + 4
        g.holdAt(this.x + this.facing * GRAB.distance, lifted ? 3 : 0, (-this.facing) as Facing, 0)
        return
      }
      default:
        g.holdAt(this.x + this.facing * GRAB.distance, 0, (-this.facing) as Facing, 0)
    }
  }

  /** 特務這一幀的前手位置與前臂方向（螢幕座標）。 */
  private handNow() {
    return frontHand(this.pose(), this.x, GROUND_Y - this.h, this.facing, this.scale)
  }

  /** 把 g 的身體中心擺到螢幕座標 (cx, cy)，並轉 rotation。 */
  private centerGrabbed(g: Grunt, cx: number, cy: number, facing: Facing, rotation: number): void {
    const ball = poseBall(g.pose(), g.scale)
    // 身體中心不低於地面上方 8px（摔下那一刻由命中處理接手）
    const y = Math.min(cy, GROUND_Y - 8)
    g.holdAt(cx - ball.x * facing, Math.max(0.5, GROUND_Y - y - ball.up), facing, rotation)
  }

  /**
   * 過肩摔：被摔的人抓在特務手上，身體中心在前臂延長線上；
   * 手從前方舉過頭頂再往後放下時，被摔的人跟著繞過頭頂、頭下腳上落到身後。
   */
  private placeSuplexed(g: Grunt): void {
    const side = this.grabFacing
    const hand = this.handNow()
    const reach = 10 * g.scale
    // 前臂角度（0 = 往下、90 = 往前、180 = 往上）連續展開：抓腰時約 90°，摔下時約 285°
    const fore = this.pose().armF[1]
    const unwrapped = ((((fore - 60) % 360) + 360) % 360) + 60
    const turn = ((unwrapped - 95) * Math.PI) / 180
    this.centerGrabbed(g, hand.x + hand.dx * reach, hand.y + hand.dy * reach, (-side) as Facing, -side * Math.max(0, turn))
  }

  /**
   * 把 g 擺成「雙腳在 (fx, fy)、轉 rotation」：用實際姿勢算出腳和頭轉完之後的位置。
   * 回傳頭的螢幕座標。apply = false 時只計算不移動（找角度用）。
   */
  private hangByFeet(g: Grunt, fx: number, fy: number, facing: Facing, rotation: number, apply: boolean) {
    const pose = g.pose()
    const pts = posePoints(pose, g.scale)
    const ball = poseBall(pose, g.scale)
    const feet = [(pts[7][0] + pts[9][0]) / 2, (pts[7][1] + pts[9][1]) / 2]
    const head = [(pts[10][0] + pts[11][0]) / 2, (pts[10][1] + pts[11][1]) / 2]
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    // 相對身體中心的螢幕向量，轉 rotation（畫布順時針為正）
    const turned = ([px, up]: number[]) => {
      const dx = (px - ball.x) * facing
      const dy = -(up - ball.up)
      return [dx * cos - dy * sin, dx * sin + dy * cos]
    }
    const f = turned(feet)
    const pivotX = fx - f[0]
    const pivotY = fy - f[1]
    const hd = turned(head)
    if (apply) g.holdAt(pivotX - ball.x * facing, GROUND_Y - (pivotY + ball.up) || 0.001, facing, rotation)
    return { x: pivotX + hd[0], y: pivotY + hd[1] }
  }

  /**
   * 大風車：特務抓著對方腳踝原地轉，被甩的人頭朝外。
   * 剛開始轉得慢，頭拖在地上；越轉越快，身體從地上掃起來、轉到水平再往上翹，最後甩到空中。
   * 轉到特務前後方時左右壓扁（透視），看起來是繞著特務轉，而不是左右滑。
   */
  private swingBody(g: Grunt) {
    const f = this.grabFrame
    const { spinFrom, releaseAt, riseAngle } = GRAB.swing
    const hand = this.handNow()
    const out = this.facing // updateGrab 已讓特務面向被甩的人
    const rotationFor = (droop: number) => out * (Math.PI / 2 + droop)
    // 頭剛好碰到地板的下垂角度（二分搜尋：越往下垂頭越低）
    let lo = -riseAngle
    let hi = 1.5
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2
      const headY = this.hangByFeet(g, hand.x, hand.y, (-out) as Facing, rotationFor(mid), false).y
      if (headY < GROUND_Y - 4) lo = mid
      else hi = mid
    }
    const onFloor = lo
    const speed = Math.min(1, Math.max(0, (f - spinFrom) / (releaseAt - spinFrom)))
    const eased = speed * speed * (3 - 2 * speed)
    const droop = onFloor + (-riseAngle - onFloor) * eased
    const depth = Math.max(0.18, Math.abs(Math.cos(swingAngle(f))))
    return { hand, out, rotation: rotationFor(droop), depth }
  }

  private placeSwung(g: Grunt): void {
    const { hand, out, rotation, depth } = this.swingBody(g)
    // 頭槌之後：對方先以腳為支點往後倒到平躺（頭著地），特務再彎身把雙腳抓到腰部的高度
    const { fallFrom, landAt, spinFrom } = GRAB.swing
    const f = this.grabFrame
    g.heldPose = POSES.swung
    const footX = this.x + out * GRAB.distance
    const flat = out * (Math.PI / 2)
    let k = 1
    if (f < landAt) {
      const t = (f - fallFrom) / (landAt - fallFrom)
      this.hangByFeet(g, footX, GROUND_Y, (-out) as Facing, flat * t * t, true) // 越倒越快
    } else {
      k = Math.min(1, (f - landAt) / (spinFrom - landAt))
      this.hangByFeet(g, footX + (hand.x - footX) * k, GROUND_Y + (hand.y - GROUND_Y) * k, (-out) as Facing, flat + (rotation - flat) * k, true)
    }
    g.squash = { scale: 1 + (depth - 1) * k, originX: hand.x }
  }

  /** 大風車途中，被甩的人（從手到頭這一段）撞到的其他敵人倒地。 */
  private swingSweep(world: World): void {
    const g = this.grabbed!
    const { hand, out, rotation, depth } = this.swingBody(g)
    const head = this.hangByFeet(g, hand.x, hand.y, (-out) as Facing, rotation, false)
    const headX = hand.x + (head.x - hand.x) * depth
    const headY = head.y
    const box = {
      x: Math.min(hand.x, headX),
      y: Math.min(hand.y, headY) - 10,
      w: Math.abs(headX - hand.x),
      h: Math.abs(headY - hand.y) + 20,
    }
    for (const e of world.enemies) {
      if (e === g || this.swingHits.has(e.id) || e.invuln > 0) continue
      const hurt = e.hurtbox()
      if (!hurt) continue
      if (box.x > hurt.x + hurt.w || box.x + box.w < hurt.x || box.y > hurt.y + hurt.h || box.y + box.h < hurt.y) continue
      this.swingHits.add(e.id)
      this.grabHit(e, GRAB_HITS.swingSweep, e.x >= this.x ? 1 : -1, world)
    }
  }

  private grabHit(target: Enemy, spec: HitSpec, dir: Facing, world: World): void {
    world.landHit(this, target, spec, dir, target.x, GROUND_Y - target.h - 22)
  }

  private poseKey(): string {
    if (this.state !== 'free') return this.state
    return this.airborne ? 'air' : this.crouching ? 'crouch' : this.running ? 'run' : this.walking ? 'walk' : 'idle'
  }

  private targetPose(): Pose {
    switch (this.state) {
      case 'grab':
        return GRAB_CLIPS[this.grabMove].sample(this.grabFrame)
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
        if (this.airborne) {
          // 接近最高點時，依垂直速度從上升姿勢慢慢轉成下落姿勢
          const t = Math.min(1, Math.max(0, (APEX_BLEND_SPEED - this.vh) / (2 * APEX_BLEND_SPEED)))
          return this.withHoldArms(lerpPose(POSES.jumpUp, POSES.jumpFall, t * t * (3 - 2 * t)))
        }
        if (this.crouching) return CLIPS.crouch.sample(0)
        if (this.running) return this.withHoldArms(runPose(this.runPhase, this.runIntensity))
        if (this.walking) return this.withHoldArms(walkPose(this.stride))
        return this.withHoldArms(CLIPS.idle.sample(this.animFrame))
    }
  }
}
