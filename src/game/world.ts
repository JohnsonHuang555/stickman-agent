import { Agent } from './agent/agent'
import { overlaps, type HitSpec, type Hitter } from './combat/types'
import { GROUND_Y, VIEW_W } from './constants'
import { AttackSlots } from './enemies/attackSlots'
import { ENEMY_TYPES, ENEMY_TYPE_IDS } from './enemies/enemyTypes'
import { Grunt } from './enemies/grunt'
import type { Fighter } from './fighter'
import { InputBuffer, type InputSnapshot } from './input/buttons'
import type { Facing } from './input/commands'
import { Bullet } from './items/bullet'
import { ItemEntity } from './items/itemEntity'
import { categoryOf, newItem, type Item, type ItemTypeId } from './items/itemTypes'
import { drawLobby } from './render/background'
import { drawHud } from './render/hud'
import { Particles } from './render/particles'

const TRAINING_GRUNTS = 3
const TRAINING_ITEMS: ItemTypeId[] = ['bat', 'crowbar', 'knife', 'katana', 'pistol', 'shotgun', 'chair', 'cabinet']
const SEPARATION = 14
/** 撿東西的距離。 */
const PICKUP_REACH = 16

const PISTOL_BULLET: HitSpec = {
  from: 0, to: Infinity, box: { forward: 0, up: 0, w: 6, h: 2 },
  damage: 12, hitstun: 18, knockback: 2,
}
const SHOTGUN_PELLET: HitSpec = {
  from: 0, to: Infinity, box: { forward: 0, up: 0, w: 6, h: 2 },
  damage: 20, hitstun: 24, knockback: 3, knockdown: true, heavy: true,
}

export interface WorldOptions {
  /** 練習場：雜兵與物件會持續重生。 */
  training?: boolean
}

/** 練習場：目前只有一層地板與會重生的雜兵，用來調整手感與 AI。 */
export class World {
  readonly floorWidth = 1440
  readonly agent = new Agent(80)
  readonly slots = new AttackSlots(2)
  grunts: Grunt[] = []
  items: ItemEntity[] = []
  bullets: Bullet[] = []

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
  private itemRespawnAt = 0
  private readonly particles = new Particles()
  private readonly buffer = new InputBuffer()
  private readonly training: boolean

  constructor(options: WorldOptions = {}) {
    this.training = options.training ?? true
    if (this.training) {
      this.grunts.push(new Grunt(260, 'thug'), new Grunt(330, 'bruiser'))
      const layout: [ItemTypeId, number][] = [
        ['chair', 160], ['knife', 420], ['cabinet', 600], ['katana', 820], ['shotgun', 1050], ['chair', 1250],
      ]
      for (const [type, x] of layout) this.placeItem(type, x)
    }
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
    for (const i of this.items) i.update(this)
    for (const b of this.bullets) b.update(this)
    this.particles.update()
    this.separateGrunts()
    this.resolveHits()

    for (const g of this.grunts) if (!g.wantsSlot) this.slots.release(g.id)
    this.grunts = this.grunts.filter((g) => !g.removed)
    this.items = this.items.filter((i) => !i.removed)
    this.bullets = this.bullets.filter((b) => !b.removed)
    if (this.training) this.respawnTraining()
    if (this.agent.defeated) this.gameOver = true

    const target = Math.min(this.floorWidth - VIEW_W, Math.max(0, this.agent.x - VIEW_W / 2))
    this.camX += (target - this.camX) * 0.15
    this.shake *= 0.82
  }

  // ── 持有物 ──────────────────────────────────────────

  placeItem(type: ItemTypeId, x: number): ItemEntity {
    const e = new ItemEntity(newItem(type), x)
    this.items.push(e)
    return e
  }

  dropItem(item: Item, x: number, h: number): void {
    this.items.push(ItemEntity.dropped(item, x, h))
  }

  dropHeld(f: Fighter): void {
    if (!f.held) return
    this.dropItem(f.held, f.x, f.h)
    f.held = null
  }

  /** 腳邊最近、可以撿的物件。彈藥包只有拿著槍時才撿得起來。 */
  pickupCandidate(f: Fighter): ItemEntity | null {
    let best: ItemEntity | null = null
    for (const e of this.items) {
      if (!e.pickable) continue
      if (categoryOf(e.item) === 'ammo' && !(f.held && categoryOf(f.held) === 'firearm')) continue
      const d = Math.abs(e.x - f.x)
      if (d <= PICKUP_REACH && (!best || d < Math.abs(best.x - f.x))) best = e
    }
    return best
  }

  takeItem(e: ItemEntity, f: Fighter): void {
    e.removed = true
    if (categoryOf(e.item) === 'ammo') {
      if (f.held) f.held.uses += e.item.uses
    } else {
      f.held = e.item
    }
  }

  throwHeld(f: Fighter): void {
    if (!f.held) return
    this.items.push(ItemEntity.thrown(f.held, f))
    f.held = null
  }

  fire(f: Fighter): void {
    const gun = f.held
    if (!gun || categoryOf(gun) !== 'firearm' || gun.uses <= 0) return
    gun.uses--
    const hand = f.handPosition()
    const h = GROUND_Y - hand.y
    const x = hand.x + f.facing * 6
    if (gun.type === 'shotgun') {
      const hitIds = new Set([f.id])
      for (const vh of [-0.45, 0, 0.45]) {
        this.bullets.push(new Bullet(x, h, f.facing * 6.5, vh, f.team, SHOTGUN_PELLET, 130, hitIds))
      }
      this.shake = Math.max(this.shake, 3)
    } else {
      this.bullets.push(new Bullet(x, h, f.facing * 7, 0, f.team, PISTOL_BULLET, 320, new Set([f.id])))
      this.shake = Math.max(this.shake, 1.5)
    }
  }

  burst(x: number, y: number, color: string): void {
    this.particles.burst(x, y, color)
  }

  // ── 戰鬥 ──────────────────────────────────────────

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
    const hitters: Hitter[] = [...fighters, ...this.bullets, ...this.items]
    for (const attacker of hitters) {
      const hit = attacker.activeHit()
      if (!hit) continue
      for (const target of fighters) {
        if (target === attacker || target.invuln > 0 || hit.hitIds.has(target.id)) continue
        if ((target.team === attacker.team) !== !!hit.hitsAllies) continue
        const hurtbox = target.hurtbox()
        if (!hurtbox || !overlaps(hit.box, hurtbox)) continue

        hit.hitIds.add(target.id)
        const isFighter = fighters.includes(attacker as Fighter)
        const dir: Facing =
          !isFighter || hit.hitsAllies
            ? attacker.vx < 0 ? -1 : 1
            : target.x === attacker.x ? attacker.facing : target.x > attacker.x ? 1 : -1
        const wasAlive = !target.life.isDead
        target.receiveHit(hit.spec, dir, this)
        attacker.onHitLanded?.(target, this)

        this.hitstop = Math.max(this.hitstop, hit.spec.heavy ? 7 : 4)
        if (hit.spec.heavy || target === this.agent) this.shake = Math.max(this.shake, hit.spec.heavy ? 4 : 2)

        if (target instanceof Grunt) {
          this.focus = { target, until: this.realFrame + 180 }
          if (attacker.team === 'agent' || hit.hitsAllies) {
            this.score += 10
            if (wasAlive && target.life.isDead) this.score += ENEMY_TYPES[target.type].score
          }
        }
        // 子彈、碎掉或已命中的投擲物不再打中同一幀的其他人
        if ((attacker as { removed?: boolean }).removed || !attacker.activeHit()) break
      }
    }
  }

  // ── 練習場 ──────────────────────────────────────────

  private respawnTraining(): void {
    const alive = this.grunts.filter((g) => !g.isGone).length
    if (alive >= TRAINING_GRUNTS) {
      this.respawnAt = this.realFrame + 90
    } else if (this.realFrame >= this.respawnAt) {
      const fromLeft = Math.random() < 0.5
      let x = fromLeft ? this.camX - 20 : this.camX + VIEW_W + 20
      x = Math.min(this.floorWidth - 10, Math.max(10, x))
      const type = ENEMY_TYPE_IDS[Math.floor(Math.random() * ENEMY_TYPE_IDS.length)]
      this.grunts.push(new Grunt(x, type))
      this.respawnAt = this.realFrame + 90
    }

    const onFloor = this.items.filter((i) => i.state === 'ground').length
    if (onFloor >= 4) {
      this.itemRespawnAt = this.realFrame + 300
    } else if (this.realFrame >= this.itemRespawnAt) {
      const type = TRAINING_ITEMS[Math.floor(Math.random() * TRAINING_ITEMS.length)]
      this.placeItem(type, this.camX + 40 + Math.random() * (VIEW_W - 80))
      this.itemRespawnAt = this.realFrame + 300
    }
  }

  // ── 繪圖 ──────────────────────────────────────────

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save()
    if (this.shake > 0.5) {
      ctx.translate(Math.round((Math.random() * 2 - 1) * this.shake), Math.round((Math.random() * 2 - 1) * this.shake))
    }
    const camX = Math.round(this.camX)
    drawLobby(ctx, camX)
    for (const i of this.items) if (i.state === 'ground') i.draw(ctx, camX)
    this.drawPickupPrompt(ctx, camX)
    for (const g of this.grunts) g.draw(ctx, camX)
    this.agent.draw(ctx, camX)
    for (const i of this.items) if (i.state === 'flying') i.draw(ctx, camX)
    for (const b of this.bullets) b.draw(ctx, camX)
    this.particles.draw(ctx, camX)
    if (this.debug) this.drawBoxes(ctx, camX)
    ctx.restore()
    drawHud(ctx, this)
  }

  private drawPickupPrompt(ctx: CanvasRenderingContext2D, camX: number): void {
    if (this.agent.airborne) return
    const e = this.pickupCandidate(this.agent)
    if (!e || (this.agent.held && categoryOf(e.item) !== 'ammo')) return
    const x = Math.round(e.x - camX)
    const y = GROUND_Y - 34 + (Math.floor(this.realFrame / 15) % 2)
    ctx.fillStyle = '#000'
    ctx.fillRect(x - 5, y - 1, 11, 10)
    ctx.fillStyle = '#ffe36b'
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('C', x + 0.5, y)
  }

  private drawBoxes(ctx: CanvasRenderingContext2D, camX: number): void {
    ctx.lineWidth = 1
    for (const f of this.fighters) {
      const hurt = f.hurtbox()
      if (hurt) {
        ctx.strokeStyle = '#2f80ff'
        ctx.strokeRect(hurt.x - camX + 0.5, hurt.y + 0.5, hurt.w, hurt.h)
      }
      if (f instanceof Grunt && this.slots.has(f.id)) {
        ctx.fillStyle = '#ff2f2f'
        ctx.fillRect(f.x - camX - 2, (hurt?.y ?? 0) - 6, 4, 4)
      }
    }
    const hitters: Hitter[] = [...this.fighters, ...this.bullets, ...this.items]
    ctx.strokeStyle = '#ff2f2f'
    for (const h of hitters) {
      const hit = h.activeHit()
      if (hit) ctx.strokeRect(hit.box.x - camX + 0.5, hit.box.y + 0.5, hit.box.w, hit.box.h)
    }
  }
}
