import type { ActionInstance, ActiveHit, Box, HitSpec } from '../combat/types'
import type { Facing } from '../input/commands'
import { newItem } from '../items/itemTypes'
import { LifePool } from '../life/lifePool'
import { BODY, STAND_HEIGHT, headAnchor, type Palette, type Pose } from '../stickman/pose'
import { CLIPS, walkPose } from '../stickman/poses'
import type { World } from '../world'
import { BOSSES, type BossDef, type BossId, type BossPhase } from './bosses'
import { BOSS_MOVES, type BossMove, type BossMoveId } from './bossMoves'
import { Enemy } from './enemy'

const DOWN_FRAMES = 36
const GETUP_FRAMES = 20
const PHASE_FRAMES = 90
const DYING_FRAMES = 90
/** 在 POISE_WINDOW 幀內被打中 POISE_HITS 次，就短暫霸體並立刻反擊。 */
const POISE_WINDOW = 90
const POISE_HITS = 4
const POISE_ARMOR = 70

type BossState = 'stalk' | 'attack' | 'hurt' | 'launched' | 'down' | 'getup' | 'phase' | 'dying'

const rand = (min: number, max: number) => min + Math.random() * (max - min)

/**
 * 小 Boss 與魔王。每扣完一條命條就倒地，起身後進入下一個階段（換招式、變快、叫手下）。
 * 不佔攻擊名額，也不會掉落手上的東西。
 */
export class Boss extends Enemy {
  readonly palette: Palette
  readonly scale: number

  private state: BossState = 'stalk'
  private stateFrame = 0
  private animFrame = 0
  private clock = 0
  private cooldown = 40
  private hitstun = 0
  private planned: BossMove | null = null
  private act: ActionInstance | null = null
  private phaseIndex = 0
  /** 倒地起身後要進入下一階段。 */
  private pendingPhase = false
  private recentHits: number[] = []
  private armorUntil = 0
  private summonAt = 0

  constructor(
    x: number,
    readonly bossId: BossId,
  ) {
    super(x, new LifePool(BOSSES[bossId].bars, BOSSES[bossId].barSize))
    this.palette = this.def.palette
    this.scale = this.def.scale
    this.equipPhaseItems()
  }

  get def(): BossDef {
    return BOSSES[this.bossId]
  }

  private get phase(): BossPhase {
    return this.def.phases[Math.min(this.phaseIndex, this.def.phases.length - 1)]
  }

  /** 目前是第幾階段（1 起算）。 */
  get phaseNumber(): number {
    return this.phaseIndex + 1
  }

  get label(): string {
    return this.def.label
  }

  get score(): number {
    return this.def.score
  }

  get isGone(): boolean {
    return this.state === 'dying'
  }

  get attacking(): boolean {
    return this.state === 'attack'
  }

  /** 手上的東西只是外觀，永遠不會壞。 */
  private equipPhaseItems(): void {
    const p = this.phase
    this.held = p.held ? newItem(p.held, Infinity) : null
    this.heldBack = p.heldBack ? newItem(p.heldBack, Infinity) : null
  }

  update(world: World): void {
    this.clock++
    this.stateFrame++
    this.animFrame++
    if (this.cooldown > 0) this.cooldown--
    if (this.flash > 0) this.flash--
    if (this.invuln > 0) this.invuln--

    const agent = world.agent
    const dx = agent.x - this.x
    const toward: Facing = dx < 0 ? -1 : 1
    const dist = Math.abs(dx)
    const speed = this.phase.walkSpeed

    switch (this.state) {
      case 'stalk': {
        this.facing = toward
        this.summonIfNeeded(world)
        if (!agent.vulnerable) {
          this.vx = dist < 60 ? -toward * speed * 0.6 : 0
          break
        }
        if (!this.planned || (this.planned.minRange ?? 0) > dist) this.planned = this.pickMove(dist)
        const plan = this.planned
        if (dist > plan.range) this.vx = toward * speed
        else {
          this.vx = 0
          if (this.cooldown <= 0 || this.clock < this.armorUntil) this.startAttack(plan)
        }
        break
      }
      case 'attack': {
        const act = this.act!
        act.frame++
        act.def.tick?.(this, act.frame, world)
        if (act.frame >= act.def.length) {
          const next = (act.def as BossMove).followUp
          if (next) this.startAttack(BOSS_MOVES[next as BossMoveId])
          else {
            this.act = null
            this.planned = null
            this.cooldown = rand(...this.phase.cooldown)
            this.equipPhaseItems()
            this.setState('stalk')
          }
        }
        break
      }
      case 'hurt':
        this.vx *= 0.8
        if (this.stateFrame >= this.hitstun) this.setState('stalk')
        break
      case 'launched':
        break
      case 'down':
        this.vx *= 0.7
        if (this.stateFrame >= DOWN_FRAMES) {
          if (this.life.isDead) this.setState('dying')
          else if (this.pendingPhase) {
            this.setState('phase')
            this.invuln = PHASE_FRAMES + 10
          } else {
            this.setState('getup')
            this.invuln = GETUP_FRAMES + 30
          }
        }
        break
      case 'getup':
        if (this.stateFrame >= GETUP_FRAMES) this.setState('stalk')
        break
      case 'phase':
        // 換階段演出：站起來閃爍、震動畫面，然後換上新階段的招式
        this.vx = 0
        this.facing = toward
        this.flash = this.stateFrame % 10 < 5 ? 2 : 0
        if (this.stateFrame % 20 === 0) world.quake(3)
        if (this.stateFrame >= PHASE_FRAMES) {
          this.pendingPhase = false
          this.phaseIndex++
          this.equipPhaseItems()
          this.summonAt = 0
          this.cooldown = 0
          this.setState('stalk')
        }
        break
      case 'dying':
        this.alpha = Math.max(0, 1 - this.stateFrame / DYING_FRAMES) * (this.stateFrame % 8 < 4 ? 1 : 0.5)
        if (this.stateFrame >= DYING_FRAMES) this.removed = true
        break
    }

    if (this.applyPhysics(world) && this.state === 'launched') {
      this.setState('down')
      this.vx *= 0.4
      this.invuln = DOWN_FRAMES + GETUP_FRAMES
    }
  }

  /** 選一招；太近時不選遠程招式。 */
  private pickMove(dist: number): BossMove {
    const usable = this.phase.moves.filter((id) => ((BOSS_MOVES[id] as BossMove).minRange ?? 0) <= dist)
    const pool = usable.length ? usable : this.phase.moves
    return BOSS_MOVES[pool[Math.floor(Math.random() * pool.length)]]
  }

  private summonIfNeeded(world: World): void {
    const summon = this.phase.summon
    if (!summon || this.clock < this.summonAt) return
    const others = world.enemies.filter((e) => e !== this && !e.isGone).length
    for (const spawn of summon.slice(others)) world.spawn(spawn)
    this.summonAt = this.clock + (this.phase.summonEvery ?? Infinity)
  }

  private startAttack(move: BossMove): void {
    this.setState('attack')
    this.vx = 0
    this.act = { def: move, frame: 0, hitIds: new Set(), chainQueued: false }
    move.onStart?.(this)
  }

  private setState(state: BossState): void {
    this.state = state
    this.stateFrame = 0
  }

  protected usingMeleeItem(): boolean {
    return false
  }

  hurtbox(): Box | null {
    return this.state === 'stalk' || this.state === 'attack' || this.state === 'hurt' ? this.bodyBox(STAND_HEIGHT) : null
  }

  activeHit(): ActiveHit | null {
    const act = this.act
    const spec = act?.def.hit
    if (this.state !== 'attack' || !act || !spec) return null
    if (act.frame < spec.from || act.frame > spec.to) return null
    return { spec, box: this.attackBox(act.def, spec), hitIds: act.hitIds }
  }

  receiveHit(spec: HitSpec, dir: Facing): void {
    const barsBefore = this.life.barsRemaining
    this.life.damage(spec.damage)
    this.flash = 4

    const lostBar = this.life.barsRemaining < barsBefore
    if (this.life.isDead || lostBar) {
      this.pendingPhase = lostBar && !this.life.isDead
      this.launch(dir)
      return
    }

    const armored = (this.state === 'attack' && this.act?.def.armor) || this.clock < this.armorUntil
    if (armored) return

    this.recentHits = [...this.recentHits.filter((t) => this.clock - t < POISE_WINDOW), this.clock]
    if (this.recentHits.length >= POISE_HITS) {
      this.recentHits = []
      this.armorUntil = this.clock + POISE_ARMOR
      this.cooldown = 0
    }

    if (spec.knockdown) {
      this.launch(dir)
    } else {
      this.act = null
      this.equipPhaseItems()
      this.setState('hurt')
      this.hitstun = Math.min(spec.hitstun, 16)
      this.vx = dir * spec.knockback * 0.6
    }
  }

  private launch(dir: Facing): void {
    this.act = null
    this.planned = null
    this.equipPhaseItems()
    this.facing = (-dir) as Facing
    this.setState('launched')
    this.vx = dir * 2.2
    this.vh = 3
  }

  defeat(): void {
    if (this.life.isDead || this.removed) return
    this.life.damage(this.life.hp)
    this.launch((-this.facing) as Facing)
  }

  pose(): Pose {
    switch (this.state) {
      case 'stalk':
        return this.withHoldArms(
          Math.abs(this.vx) > 0.05 ? walkPose(this.stride) : CLIPS.idle.sample(this.animFrame),
        )
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
      case 'phase':
        return this.withHoldArms(CLIPS.idle.sample(this.animFrame))
    }
  }

  protected drawCostume(ctx: CanvasRenderingContext2D, pose: Pose, x: number, footY: number): void {
    const head = headAnchor(pose, x, footY, this.facing, this.scale)
    // 裝扮以初版頭半徑 6 設計，依目前的頭大小等比縮放
    const s = this.scale * (BODY.headR / 6)
    const neck = (BODY.headR + BODY.neck) * this.scale
    ctx.save()
    ctx.translate(head.x, head.y)
    ctx.rotate(Math.atan2(head.dx, -head.dy))
    ctx.scale(this.facing, 1)
    // 此處座標：原點為頭中心，+x 朝前，-y 朝上
    switch (this.def.costume) {
      case 'kane':
        ctx.fillStyle = '#1a1a1a'
        ctx.beginPath()
        ctx.arc(0, -1 * s, 6.4 * s, Math.PI, 0)
        ctx.fill()
        ctx.fillRect(-6.6 * s, -2 * s, 13.2 * s, 2 * s)
        break
      case 'ryu':
        ctx.fillStyle = '#f2f2f2'
        ctx.fillRect(-6 * s, -3.5 * s, 12 * s, 2 * s)
        ctx.strokeStyle = '#f2f2f2'
        ctx.lineWidth = 1.5 * s
        ctx.beginPath()
        ctx.moveTo(-6 * s, -2.5 * s)
        ctx.lineTo(-13 * s, -1 * s + Math.sin(this.animFrame / 6) * s)
        ctx.moveTo(-6 * s, -2.5 * s)
        ctx.lineTo(-12 * s, 2 * s + Math.sin(this.animFrame / 5) * s)
        ctx.stroke()
        break
      case 'johnson':
        // 紅領帶
        ctx.strokeStyle = '#c0182c'
        ctx.lineWidth = 2 * s
        ctx.beginPath()
        ctx.moveTo(0.8 * s, neck)
        ctx.lineTo(1.2 * s, neck + 8 * this.scale)
        ctx.stroke()
        // 墨鏡
        ctx.fillStyle = '#111'
        ctx.fillRect(0, -1.8 * s, 6.8 * s, 2.6 * s)
        // 紳士帽
        ctx.fillRect(-9 * s, -5.5 * s, 18 * s, 2 * s)
        ctx.fillRect(-6 * s, -11.5 * s, 12 * s, 6.5 * s)
        ctx.fillStyle = '#c9a227'
        ctx.fillRect(-6 * s, -7.2 * s, 12 * s, 1.5 * s)
        break
    }
    ctx.restore()
  }
}
