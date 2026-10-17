import { Agent } from './agent/agent'
import { overlaps, type HitSpec, type Hitter } from './combat/types'
import { GROUND_Y, VIEW_W } from './constants'
import { AttackSlots } from './enemies/attackSlots'
import { Boss } from './enemies/boss'
import { Enemy } from './enemies/enemy'
import { ENEMY_TYPE_IDS } from './enemies/enemyTypes'
import { Grunt } from './enemies/grunt'
import type { Fighter } from './fighter'
import { InputBuffer, type InputSnapshot } from './input/buttons'
import type { Facing } from './input/commands'
import { Bullet } from './items/bullet'
import { ItemEntity } from './items/itemEntity'
import { categoryOf, newItem, type Item, type ItemTypeId } from './items/itemTypes'
import { FLOORS, type FloorDef, type Spawn, type Theme } from './level/floors'
import { ZoneDirector } from './level/zoneDirector'
import { drawBackground } from './render/background'
import { drawHud } from './render/hud'
import { Particles } from './render/particles'

const TRAINING_GRUNTS = 3
const TRAINING_ITEMS: ItemTypeId[] = ['bat', 'crowbar', 'knife', 'katana', 'pistol', 'shotgun', 'chair', 'cabinet']
const SEPARATION = 14
/** 撿東西的距離。 */
const PICKUP_REACH = 16
const INTRO_FRAMES = 110
const BOSS_BANNER_FRAMES = 150
/** 魔王倒下到顯示 MISSION COMPLETE 的幀數。 */
const MISSION_CLEAR_DELAY = 150
const CLEAR_FRAMES = 200
/** 過層獎勵：每點血量的分數，以及用時獎勵的上限與每秒扣分。 */
const LIFE_BONUS_PER_HP = 20
const TIME_BONUS_MAX = 5000
const TIME_BONUS_PER_SECOND = 25

const PISTOL_BULLET: HitSpec = {
  from: 0, to: Infinity, box: { forward: 0, up: 0, w: 6, h: 2 },
  damage: 12, hitstun: 18, knockback: 2,
}
const SHOTGUN_PELLET: HitSpec = {
  from: 0, to: Infinity, box: { forward: 0, up: 0, w: 6, h: 2 },
  damage: 20, hitstun: 24, knockback: 3, knockdown: true, heavy: true,
}

/**
 * - campaign：正式遊玩，從 1F 往上打
 * - training：練習場，雜兵與物件持續重生
 * - sandbox：空地板，測試用
 */
export type GameMode = 'campaign' | 'training' | 'sandbox'

/**
 * - intro：剛進樓層，顯示樓層字卡（遊戲照常進行）
 * - play：遊玩中
 * - clear：走上樓梯，結算過層獎勵
 * - complete：通關
 */
export type Phase = 'intro' | 'play' | 'clear' | 'complete'

export interface WorldOptions {
  mode?: GameMode
  /** campaign 從第幾層開始（0 起算），測試用。 */
  startFloor?: number
}

export class World {
  readonly mode: GameMode
  floorWidth = 1440
  readonly agent = new Agent(80)
  readonly slots = new AttackSlots(2)
  enemies: Enemy[] = []
  items: ItemEntity[] = []
  bullets: Bullet[] = []

  realFrame = 0
  score = 0
  paused = false
  debug = false
  camX = 0
  gameOver = false
  /** Game Over 或通關後玩家按鍵要求重來；由 main 建立新的 World。 */
  restartRequested = false
  /** HUD 右側顯示的敵人（最近被打的那個）。 */
  focus: { target: Enemy; until: number } | null = null
  /** Boss 出場時的警告字幕。 */
  bossBanner: { boss: Boss; until: number } | null = null
  private missionClearIn: number | null = null

  floorIndex = 0
  floor: FloorDef | null = null
  director: ZoneDirector | null = null
  phase: Phase = 'play'
  phaseFrame = 0
  /** 本層已經過的幀數（算用時獎勵）。 */
  floorFrames = 0
  clearBonus = { life: 0, time: 0 }

  private hitstop = 0
  private shake = 0
  private respawnAt = 0
  private itemRespawnAt = 0
  private readonly particles = new Particles()
  private readonly buffer = new InputBuffer()

  constructor(options: WorldOptions = {}) {
    this.mode = options.mode ?? 'campaign'
    if (this.mode === 'campaign') {
      this.loadFloor(options.startFloor ?? 0)
    } else if (this.mode === 'training') {
      this.enemies.push(new Grunt(260, 'thug'), new Grunt(330, 'bruiser'))
      const layout: [ItemTypeId, number][] = [
        ['chair', 160], ['knife', 420], ['cabinet', 600], ['katana', 820], ['shotgun', 1050], ['chair', 1250],
      ]
      for (const [type, x] of layout) this.placeItem(type, x)
    }
  }

  get theme(): Theme {
    return this.floor?.theme ?? 'lobby'
  }

  /** 進入新樓層：清空場上，特務回到左側，保留血量、持有物與分數。 */
  private loadFloor(index: number): void {
    this.floorIndex = index
    this.floor = FLOORS[index]
    this.floorWidth = this.floor.width
    this.director = new ZoneDirector(this.floor)
    this.enemies = []
    this.items = []
    this.bullets = []
    this.focus = null
    this.agent.x = 40
    this.agent.vx = 0
    this.camX = 0
    this.floorFrames = 0
    for (const [type, x] of this.floor.items) this.placeItem(type, x)
    this.setPhase('intro')
  }

  private setPhase(phase: Phase): void {
    this.phase = phase
    this.phaseFrame = 0
  }

  update(input: InputSnapshot): void {
    this.realFrame++
    this.phaseFrame++
    this.buffer.record(input, this.realFrame)
    if (input.pressed.includes('debug')) this.debug = !this.debug

    const ended = this.gameOver || this.phase === 'complete'
    if (ended) {
      if (this.phaseFrame > 60 && input.pressed.some((b) => b === 'punch' || b === 'jump')) this.restartRequested = true
      if (this.gameOver) this.stepSimulation(input)
      return
    }
    if (input.pressed.includes('pause')) this.paused = !this.paused
    if (this.paused) return

    if (this.phase === 'clear') {
      if (this.phaseFrame >= CLEAR_FRAMES) {
        if (this.floorIndex + 1 < FLOORS.length) this.loadFloor(this.floorIndex + 1)
        else this.setPhase('complete')
      }
      return
    }
    if (this.phase === 'intro' && this.phaseFrame >= INTRO_FRAMES) this.setPhase('play')

    this.stepSimulation(input)
  }

  private stepSimulation(input: InputSnapshot): void {
    this.agent.readInput(input, this.buffer, this.realFrame)
    if (this.hitstop > 0) {
      this.hitstop--
      return
    }
    this.floorFrames++

    this.agent.update(this)
    for (const g of this.enemies) g.update(this)
    for (const i of this.items) i.update(this)
    for (const b of this.bullets) b.update(this)
    this.particles.update()
    this.separateGrunts()
    this.resolveHits()

    for (const g of this.enemies) if (!g.wantsSlot) this.slots.release(g.id)
    this.enemies = this.enemies.filter((g) => !g.removed)
    this.items = this.items.filter((i) => !i.removed)
    this.bullets = this.bullets.filter((b) => !b.removed)

    if (this.mode === 'training') this.respawnTraining()
    if (this.director && !this.gameOver) this.runDirector()
    this.confineToLock()
    if (this.agent.defeated && !this.gameOver) {
      this.gameOver = true
      this.phaseFrame = 0
    }

    this.updateCamera()
    this.shake *= 0.82
  }

  // ── 樓層進程 ──────────────────────────────────────────

  private runDirector(): void {
    const director = this.director!
    const alive = this.enemies.filter((g) => !g.isGone).length
    for (const spawn of director.update(this.realFrame, this.agent.x, alive)) this.spawn(spawn)

    // 最終樓層：魔王倒下時手下一起倒下，演出結束後通關
    if (this.floor!.final) {
      const boss = this.boss
      if (boss?.life.isDead) for (const e of this.enemies) e.defeat()
      if (director.allCleared) {
        this.missionClearIn ??= MISSION_CLEAR_DELAY
        if (--this.missionClearIn <= 0) this.setPhase('complete')
      }
      return
    }

    if (director.allCleared && this.agent.x >= this.floor!.stairsX - 6 && !this.agent.airborne) {
      const seconds = Math.floor(this.floorFrames / 60)
      this.clearBonus = {
        life: this.agent.life.hp * LIFE_BONUS_PER_HP,
        time: Math.max(0, TIME_BONUS_MAX - seconds * TIME_BONUS_PER_SECOND),
      }
      this.score += this.clearBonus.life + this.clearBonus.time
      this.setPhase('clear')
    }
  }

  /** 從目前畫面（或鎖定區段）的左右邊緣外出場。 */
  spawn(spawn: Spawn): void {
    const left = this.director?.lockLeft ?? this.camX
    const x = Math.min(this.floorWidth - 8, Math.max(8, spawn.side === 'left' ? left - 16 : left + VIEW_W + 16))
    if ('boss' in spawn) {
      const boss = new Boss(x, spawn.boss)
      this.enemies.push(boss)
      this.bossBanner = { boss, until: this.realFrame + BOSS_BANNER_FRAMES }
      return
    }
    const held = spawn.held === undefined ? undefined : spawn.held === null ? null : newItem(spawn.held)
    this.enemies.push(new Grunt(x, spawn.type, { held }))
  }

  /** 場上的 Boss（含正在倒下的）。 */
  get boss(): Boss | null {
    return (this.enemies.find((e) => e instanceof Boss) as Boss | undefined) ?? null
  }

  /** 鎖鏡頭時，特務不能離開畫面；已經走進畫面的雜兵也不能再出去。 */
  private confineToLock(): void {
    const left = this.director?.lockLeft
    if (left === null || left === undefined) return
    const right = left + VIEW_W
    this.agent.x = Math.min(right - 8, Math.max(left + 8, this.agent.x))
    for (const g of this.enemies) {
      if (g.x > left + 8 && g.x < right - 8) g.entered = true
      if (g.entered) g.x = Math.min(right - 8, Math.max(left + 8, g.x))
    }
  }

  private updateCamera(): void {
    const lock = this.director?.lockLeft
    const target = lock ?? this.agent.x - VIEW_W / 2
    const clamped = Math.min(this.floorWidth - VIEW_W, Math.max(0, target))
    this.camX += (clamped - this.camX) * 0.15
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

  /** 從手上往面對的方向開一槍，子彈高度指定（魔王連射用）。 */
  shoot(f: Fighter, height: number): void {
    const hand = f.handPosition()
    this.bullets.push(new Bullet(hand.x + f.facing * 6, height, f.facing * 6, 0, f.team, PISTOL_BULLET, 360, new Set([f.id])))
    this.shake = Math.max(this.shake, 1.5)
  }

  burst(x: number, y: number, color: string): void {
    this.particles.burst(x, y, color)
  }

  quake(amount: number): void {
    this.shake = Math.max(this.shake, amount)
  }

  // ── 戰鬥 ──────────────────────────────────────────

  private get fighters(): Fighter[] {
    return [this.agent, ...this.enemies]
  }

  /** 站在地上的雜兵彼此稍微推開，避免疊成一團。 */
  private separateGrunts(): void {
    const standing = this.enemies.filter((g) => !g.airborne && g.hurtbox())
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

        if (target instanceof Enemy) {
          this.focus = { target, until: this.realFrame + 180 }
          if (attacker.team === 'agent' || hit.hitsAllies) {
            this.score += 10
            if (wasAlive && target.life.isDead) this.score += target.score
          }
        }
        // 子彈、碎掉或已命中的投擲物不再打中同一幀的其他人
        if ((attacker as { removed?: boolean }).removed || !attacker.activeHit()) break
      }
    }
  }

  // ── 練習場 ──────────────────────────────────────────

  private respawnTraining(): void {
    const alive = this.enemies.filter((g) => !g.isGone).length
    if (alive >= TRAINING_GRUNTS) {
      this.respawnAt = this.realFrame + 90
    } else if (this.realFrame >= this.respawnAt) {
      const type = ENEMY_TYPE_IDS[Math.floor(Math.random() * ENEMY_TYPE_IDS.length)]
      this.spawn({ type, side: Math.random() < 0.5 ? 'left' : 'right' })
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
    drawBackground(ctx, this.theme, camX, this.floor && !this.floor.final ? this.floor.stairsX : null)
    for (const i of this.items) if (i.state === 'ground') i.draw(ctx, camX)
    this.drawPickupPrompt(ctx, camX)
    for (const g of this.enemies) g.draw(ctx, camX)
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
