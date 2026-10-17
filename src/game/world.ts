import { Agent } from './agent/agent'
import { overlaps } from './combat/types'
import { VIEW_W } from './constants'
import { AttackSlots } from './enemies/attackSlots'
import { ENEMY_TYPES, ENEMY_TYPE_IDS } from './enemies/enemyTypes'
import { Grunt } from './enemies/grunt'
import type { Fighter } from './fighter'
import { InputBuffer, type InputSnapshot } from './input/buttons'
import type { Facing } from './input/commands'
import { drawLobby } from './render/background'
import { drawHud } from './render/hud'

const TRAINING_GRUNTS = 3
const SEPARATION = 14

export interface WorldOptions {
  /** 練習場：雜兵會持續重生。 */
  training?: boolean
}

/** 練習場：目前只有一層地板與會重生的雜兵，用來調整手感與 AI。 */
export class World {
  readonly floorWidth = 1440
  readonly agent = new Agent(80)
  readonly slots = new AttackSlots(2)
  grunts: Grunt[] = []

  realFrame = 0
  score = 0
  paused = false
  debug = false
  camX = 0
  gameOver = false
  /** Game Over 後玩家按鍵要求重來；由 main 建立新的 World。 */
  restartRequested = false
  /** HUD 右側顯示的敵人（最近被打的那個）。 */
  focus: { target: Grunt; until: number } | null = null

  private hitstop = 0
  private shake = 0
  private respawnAt = 0
  private readonly buffer = new InputBuffer()
  private readonly training: boolean

  constructor(options: WorldOptions = {}) {
    this.training = options.training ?? true
    if (this.training) this.grunts.push(new Grunt(260, 'thug'), new Grunt(330, 'bruiser'))
  }

  update(input: InputSnapshot): void {
    this.realFrame++
    this.buffer.record(input, this.realFrame)
    if (input.pressed.includes('debug')) this.debug = !this.debug
    if (this.gameOver) {
      if (input.pressed.some((b) => b === 'punch' || b === 'jump')) this.restartRequested = true
    } else if (input.pressed.includes('pause')) {
      this.paused = !this.paused
    }
    if (this.paused) return

    this.agent.readInput(input, this.buffer, this.realFrame)
    if (this.hitstop > 0) {
      this.hitstop--
      return
    }

    this.agent.update(this)
    for (const g of this.grunts) g.update(this)
    this.separateGrunts()
    this.resolveHits()

    for (const g of this.grunts) if (!g.wantsSlot) this.slots.release(g.id)
    this.grunts = this.grunts.filter((g) => !g.removed)
    if (this.training) this.respawnTrainingGrunts()
    if (this.agent.defeated) this.gameOver = true

    const target = Math.min(this.floorWidth - VIEW_W, Math.max(0, this.agent.x - VIEW_W / 2))
    this.camX += (target - this.camX) * 0.15
    this.shake *= 0.82
  }

  private get fighters(): Fighter[] {
    return [this.agent, ...this.grunts]
  }

  /** 站在地上的雜兵彼此稍微推開，避免疊成一團。 */
  private separateGrunts(): void {
    const standing = this.grunts.filter((g) => !g.airborne && g.hurtbox())
    for (let i = 0; i < standing.length; i++) {
      for (let j = i + 1; j < standing.length; j++) {
        const a = standing[i]
        const b = standing[j]
        const dx = b.x - a.x
        if (Math.abs(dx) >= SEPARATION) continue
        const push = ((SEPARATION - Math.abs(dx)) / 2) * 0.25
        const dir = dx === 0 ? (a.id < b.id ? 1 : -1) : Math.sign(dx)
        a.x -= dir * push
        b.x += dir * push
      }
    }
  }

  private resolveHits(): void {
    const fighters = this.fighters
    for (const attacker of fighters) {
      const hit = attacker.activeHit()
      if (!hit) continue
      for (const target of fighters) {
        if (target === attacker || target.invuln > 0 || hit.hitIds.has(target.id)) continue
        if ((target.team === attacker.team) !== !!hit.hitsAllies) continue
        const hurtbox = target.hurtbox()
        if (!hurtbox || !overlaps(hit.box, hurtbox)) continue

        hit.hitIds.add(target.id)
        const dir: Facing = hit.hitsAllies
          ? attacker.vx < 0 ? -1 : 1
          : target.x === attacker.x ? attacker.facing : target.x > attacker.x ? 1 : -1
        const wasAlive = !target.life.isDead
        target.receiveHit(hit.spec, dir)

        this.hitstop = Math.max(this.hitstop, hit.spec.heavy ? 7 : 4)
        if (hit.spec.heavy || target === this.agent) this.shake = Math.max(this.shake, hit.spec.heavy ? 4 : 2)

        if (target instanceof Grunt) {
          this.focus = { target, until: this.realFrame + 180 }
          if (attacker === this.agent || hit.hitsAllies) {
            this.score += 10
            if (wasAlive && target.life.isDead) this.score += ENEMY_TYPES[target.type].score
          }
        }
      }
    }
  }

  /** 練習用：雜兵不足時，隨機類型從畫面外走進來。 */
  private respawnTrainingGrunts(): void {
    const alive = this.grunts.filter((g) => !g.isGone).length
    if (alive >= TRAINING_GRUNTS) {
      this.respawnAt = this.realFrame + 90
      return
    }
    if (this.realFrame < this.respawnAt) return
    const fromLeft = Math.random() < 0.5
    let x = fromLeft ? this.camX - 20 : this.camX + VIEW_W + 20
    x = Math.min(this.floorWidth - 10, Math.max(10, x))
    const type = ENEMY_TYPE_IDS[Math.floor(Math.random() * ENEMY_TYPE_IDS.length)]
    this.grunts.push(new Grunt(x, type))
    this.respawnAt = this.realFrame + 90
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save()
    if (this.shake > 0.5) {
      ctx.translate(Math.round((Math.random() * 2 - 1) * this.shake), Math.round((Math.random() * 2 - 1) * this.shake))
    }
    const camX = Math.round(this.camX)
    drawLobby(ctx, camX)
    for (const g of this.grunts) g.draw(ctx, camX)
    this.agent.draw(ctx, camX)
    if (this.debug) this.drawBoxes(ctx, camX)
    ctx.restore()
    drawHud(ctx, this)
  }

  private drawBoxes(ctx: CanvasRenderingContext2D, camX: number): void {
    ctx.lineWidth = 1
    for (const f of this.fighters) {
      const hurt = f.hurtbox()
      if (hurt) {
        ctx.strokeStyle = '#2f80ff'
        ctx.strokeRect(hurt.x - camX + 0.5, hurt.y + 0.5, hurt.w, hurt.h)
      }
      const hit = f.activeHit()
      if (hit) {
        ctx.strokeStyle = '#ff2f2f'
        ctx.strokeRect(hit.box.x - camX + 0.5, hit.box.y + 0.5, hit.box.w, hit.box.h)
      }
      if (f instanceof Grunt && this.slots.has(f.id)) {
        ctx.fillStyle = '#ff2f2f'
        ctx.fillRect(f.x - camX - 2, (hurt?.y ?? 0) - 6, 4, 4)
      }
    }
  }
}
