import type { Sound } from '../audio/sfx'
import { CLEARED_FLOOR } from '../leaderboard/leaderboard'
import { Agent } from './agent/agent'
import { ComboCounter } from './combat/comboCounter'
import { overlaps, type HitSpec, type Hitter } from './combat/types'
import { GROUND_Y, VIEW_W } from './constants'
import { AttackSlots } from './enemies/attackSlots'
import { Boss } from './enemies/boss'
import { Enemy } from './enemies/enemy'
import { ENEMY_TYPE_IDS } from './enemies/enemyTypes'
import { Grunt } from './enemies/grunt'
import type { Fighter, FighterDisplay } from './fighter'
import { InputBuffer, type InputSnapshot } from './input/buttons'
import type { Facing } from './input/commands'
import { Bullet } from './items/bullet'
import { ItemEntity } from './items/itemEntity'
import { categoryOf, newItem, type Item, type ItemTypeId } from './items/itemTypes'
import { FLOORS, type FloorDef, type Spawn, type Theme } from './level/floors'
import { Crate } from './level/crate'
import { ZoneDirector } from './level/zoneDirector'
import { drawBackground } from './render/background'
import { drawHud } from './render/hud'
import { ImpactFx } from './render/impact'
import { lerpPose } from './stickman/pose'
import { Particles } from './render/particles'

const TRAINING_GRUNTS = 3
const TRAINING_ITEMS: ItemTypeId[] = ['bat', 'crowbar', 'knife', 'katana', 'pistol', 'shotgun', 'chair', 'cabinet']
const SEPARATION = 14
/** 兩個雜兵迎面走過時，速度超過這個值就讓他們錯身，不互推。 */
const PASS_SPEED = 0.05
/** 空中追擊時特務與浮空敵人之間的最小間距。 */
const AIR_SPACING = 16
/** 浮空的雜兵在這個水平距離內時，特務的空中招式才會懸停、收招拉長（空中連段輔助）。 */
const JUGGLE_ASSIST_RANGE = 70
/** 撿東西的距離。 */
const PICKUP_REACH = 16
const INTRO_FRAMES = 110
const BOSS_BANNER_FRAMES = 150
const POPUP_FRAMES = 50
/** 每次命中的基本分，乘上連擊倍率。 */
const HIT_SCORE = 10
/** 按 C 抓人時，敵人離特務最遠的距離。 */
const GRAB_RANGE = 30
const snapshot = (f: Fighter): FighterDisplay => ({ x: f.x, h: f.h, rotation: f.rotation, pose: f.pose() })
/** 被打飛撞到牆時的額外傷害。 */
const WALL_BOUNCE_DAMAGE = 6
const MUZZLE_FRAMES = 5
/** 打倒區段最後一個敵人／魔王：慢動作長度（實際幀數）與速度（每幾幀推進一次）。 */
const FINISH_SLOWMO_FRAMES = 60
const SLOWMO_RATE = 3
/** 自動撿起醫療箱、分數道具的距離。 */
const CONSUME_REACH = 12

/** 子彈命中後消失、丟出的物件碎掉或已經命中過，就不再打中其他目標。 */
const spent = (h: Hitter) => (h as { removed?: boolean }).removed || !h.activeHit()
/** 魔王倒下到顯示 MISSION COMPLETE 的幀數。 */
const MISSION_CLEAR_DELAY = 150
const CLEAR_FRAMES = 200
/** 過層獎勵：每點血量的分數，以及用時獎勵的上限與每秒扣分。 */
const LIFE_BONUS_PER_HP = 20
const TIME_BONUS_MAX = 5000
const TIME_BONUS_PER_SECOND = 25
/** 破完一層樓補一條命條的 20%（可補回上一條）。 */
export const FLOOR_CLEAR_HEAL = 20

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
  readonly combo = new ComboCounter()
  enemies: Enemy[] = []
  items: ItemEntity[] = []
  bullets: Bullet[] = []
  crates: Crate[] = []
  /** 槍口火光（螢幕 y）。 */
  flashes: { x: number; y: number; size: number; born: number }[] = []
  /** 撿到道具時浮起的文字。 */
  popups: { x: number; text: string; color: string; born: number }[] = []

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
  /** 音效輸出；測試時保持靜音。 */
  sound: (s: Sound) => void = () => {}
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
  readonly fx = new ImpactFx()
  /** 剩下幾個實際幀的慢動作。 */
  slowmo = 0
  /** 慢動作中上一次模擬推進前的畫面狀態，與推進的實際幀；畫面在兩者之間補間，動作才不會一頓一頓。 */
  private slowPrev: { at: number; camX: number; fighters: Map<Fighter, FighterDisplay> } | null = null
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
      this.crates = [new Crate(300), new Crate(700), new Crate(1150)]
    }
  }

  /** 這一局的成績：到達樓層（通關為 CLEARED_FLOOR）與分數。 */
  get result(): { floor: number; score: number; cleared: boolean } {
    const cleared = this.phase === 'complete'
    return { floor: cleared ? CLEARED_FLOOR : this.floorIndex + 1, score: this.score, cleared }
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
    this.crates = this.floor.crates.map(([x, loot]) => new Crate(x, loot))
    this.popups = []
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
    this.fx.update(this.realFrame)
    if (this.hitstop > 0) {
      this.hitstop--
      return
    }
    // 慢動作：每 SLOWMO_RATE 個實際幀才推進一次
    if (this.slowmo > 0) {
      this.slowmo--
      if (this.slowmo % SLOWMO_RATE !== 0) return
      this.slowPrev = { at: this.realFrame, camX: this.camX, fighters: new Map(this.fighters.map((f) => [f, snapshot(f)])) }
    } else {
      this.slowPrev = null
    }
    this.floorFrames++

    this.agent.update(this)
    for (const g of this.enemies) g.update(this)
    for (const i of this.items) i.update(this)
    for (const b of this.bullets) b.update(this)
    this.particles.update()
    this.combo.update(this.realFrame)
    this.separateGrunts()
    this.keepAirSpacing()
    this.resolveHits()

    for (const g of this.enemies) if (!g.wantsSlot) this.slots.release(g.id)
    this.enemies = this.enemies.filter((g) => !g.removed)
    this.items = this.items.filter((i) => !i.removed)
    this.bullets = this.bullets.filter((b) => !b.removed)
    this.crates = this.crates.filter((c) => !c.broken)
    this.collectConsumables()
    this.items = this.items.filter((i) => !i.removed)
    this.popups = this.popups.filter((p) => this.realFrame - p.born < POPUP_FRAMES)

    if (this.mode === 'training') this.respawnTraining()
    if (this.director && !this.gameOver) this.runDirector()
    this.confineToLock()
    if (this.agent.defeated && !this.gameOver) {
      this.gameOver = true
      this.sound('gameOver')
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
        if (--this.missionClearIn <= 0) {
          this.setPhase('complete')
          this.sound('clear')
        }
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
      // 血量獎勵用補血前的血量算，再補血
      this.agent.life.heal(FLOOR_CLEAR_HEAL)
      this.setPhase('clear')
      this.sound('clear')
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
      this.sound('warning')
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
      const category = categoryOf(e.item)
      if (category === 'consumable') continue
      if (category === 'ammo' && !this.gunToReload(f)) continue
      const d = Math.abs(e.x - f.x)
      if (d <= PICKUP_REACH && (!best || d < Math.abs(best.x - f.x))) best = e
    }
    return best
  }

  takeItem(e: ItemEntity, f: Fighter): void {
    e.removed = true
    if (categoryOf(e.item) === 'ammo') {
      const gun = this.gunToReload(f)
      if (gun) gun.uses += e.item.uses
    } else {
      f.held = e.item
      this.sound('pickup')
    }
  }

  /** 彈藥包要補的槍：優先手上的槍，其次背包裡的槍。 */
  private gunToReload(f: Fighter): Item | null {
    if (f.held && categoryOf(f.held) === 'firearm') return f.held
    if (f.bag && categoryOf(f.bag) === 'firearm') return f.bag
    return null
  }

  /**
   * V 鍵（背包）：
   * - 背包有醫療箱 → 使用（滿血時不用，避免浪費）
   * - 背包有槍 → 掏出來；手上是槍就互換，手上是其他東西就丟到地上
   * - 背包空著、手上拿槍 → 把槍收進背包
   * 回傳是否有動作。
   */
  useBag(f: Fighter): boolean {
    const bag = f.bag
    if (bag?.type === 'medkit') {
      if (f.life.hp >= f.life.max) return false
      f.life.heal(bag.uses)
      f.bag = null
      this.popup(f.x, 'HEAL', '#7dff8a')
      this.sound('heal')
      return true
    }
    if (bag && categoryOf(bag) === 'firearm') {
      if (f.held && categoryOf(f.held) !== 'firearm') this.dropHeld(f)
      f.bag = f.held
      f.held = bag
      this.sound('pickup')
      return true
    }
    if (!bag && f.held && categoryOf(f.held) === 'firearm') {
      f.bag = f.held
      f.held = null
      this.sound('pickup')
      return true
    }
    return false
  }

  throwHeld(f: Fighter): void {
    if (!f.held) return
    this.items.push(ItemEntity.thrown(f.held, f))
    this.sound('throw')
    f.held = null
  }

  fire(f: Fighter): void {
    const gun = f.held
    if (!gun || categoryOf(gun) !== 'firearm' || gun.uses <= 0) return
    gun.uses--
    const hand = f.handPosition()
    const h = GROUND_Y - hand.y
    const x = hand.x + f.facing * 6
    this.muzzleFlash(x, hand.y, gun.type === 'shotgun' ? 9 : 6)
    if (gun.type === 'shotgun') {
      const hitIds = new Set([f.id])
      for (const vh of [-0.45, 0, 0.45]) {
        this.bullets.push(new Bullet(x, h, f.facing * 6.5, vh, f.team, SHOTGUN_PELLET, 130, hitIds))
      }
      this.shake = Math.max(this.shake, 3)
      this.sound('shotgun')
    } else {
      this.bullets.push(new Bullet(x, h, f.facing * 7, 0, f.team, PISTOL_BULLET, 320, new Set([f.id])))
      this.shake = Math.max(this.shake, 1.5)
      this.sound('shot')
    }
  }

  /** 沒子彈時扣扳機：「喀」一聲並在頭上冒出 CLICK（接著由動作把空槍丟出去）。 */
  dryFire(f: Fighter): void {
    this.sound('click')
    this.popup(f.x, 'CLICK', '#d0d0d0')
  }

  /** 從手上往面對的方向開一槍，子彈高度指定（魔王連射用）。 */
  shoot(f: Fighter, height: number): void {
    const hand = f.handPosition()
    this.bullets.push(new Bullet(hand.x + f.facing * 6, height, f.facing * 6, 0, f.team, PISTOL_BULLET, 360, new Set([f.id])))
    this.muzzleFlash(hand.x + f.facing * 6, GROUND_Y - height, 6)
    this.shake = Math.max(this.shake, 1.5)
    this.sound('shot')
  }

  private muzzleFlash(x: number, y: number, size: number): void {
    this.flashes.push({ x, y, size, born: this.realFrame })
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

  /** 牆的位置：鎖定區段時是畫面左右邊緣，否則是樓層兩端。 */
  wallBounds(): { left: number; right: number } {
    const lock = this.director?.lockLeft
    if (lock !== null && lock !== undefined) return { left: lock + 8, right: lock + VIEW_W - 8 }
    return { left: 8, right: this.floorWidth - 8 }
  }

  /** 命中的打擊演出：衝擊閃光、下砸／斷條時推近鏡頭、清場時慢動作。 */
  /**
   * 一次命中的所有後續：受擊、頓幀、音效、震動、連擊、得分與打擊演出。
   * (x, y) 是衝擊閃光的位置。一般攻擊與抓技（膝撞、摔、大風車）共用。
   */
  landHit(attacker: Hitter, target: Fighter, spec: HitSpec, dir: Facing, x: number, y: number, hitsAllies = false): void {
    const wasAlive = !target.life.isDead
    const wasJuggled = target instanceof Grunt && target.juggled
    const barsBefore = target.life.barsRemaining
    target.receiveHit(spec, dir, this)
    attacker.onHitLanded?.(this)
    this.hitEffects(spec, x, y, target, dir, wasAlive, barsBefore)

    // 空中追擊的輕擊頓幀較短，連段才流暢、敵人不會像定格在空中
    this.hitstop = Math.max(this.hitstop, spec.heavy ? 7 : wasJuggled ? 2 : 4)
    this.sound(target === this.agent ? 'hurt' : spec.heavy ? 'heavyHit' : 'hit')
    if (spec.heavy || target === this.agent) this.shake = Math.max(this.shake, spec.heavy ? 4 : 2)

    if (target === this.agent) this.combo.break()
    if (target instanceof Enemy) {
      this.focus = { target, until: this.realFrame + 180 }
      if (attacker.team === 'agent') this.combo.hit(this.realFrame)
      if (attacker.team === 'agent' || hitsAllies) {
        this.score += HIT_SCORE * this.combo.multiplier
        if (wasAlive && target.life.isDead) {
          this.score += target.score
          this.sound('ko')
        }
      }
    }
  }

  private hitEffects(spec: HitSpec, x: number, y: number, target: Fighter, dir: Facing, wasAlive: boolean, barsBefore: number): void {
    const finishing = target instanceof Enemy && wasAlive && target.life.isDead && this.isFinishingBlow(target)
    const heavy = !!(spec.heavy || spec.knockdown || spec.launch) || finishing
    this.fx.spark(x, y, heavy, target === this.agent, dir, this.realFrame)

    if (!(target instanceof Enemy)) return
    if (finishing) {
      this.slowmo = FINISH_SLOWMO_FRAMES
      this.fx.whiteFlash(8, this.realFrame)
      this.fx.pushIn(x, y, 0.22, FINISH_SLOWMO_FRAMES - 10, this.realFrame)
    } else if (spec.spike) {
      this.fx.pushIn(x, y, 0.1, 6, this.realFrame)
    } else if (target instanceof Boss && target.life.barsRemaining < barsBefore) {
      this.fx.pushIn(x, y, 0.14, 12, this.realFrame)
    }
  }

  /** 打倒的是魔王，或區段最後一波的最後一個敵人。 */
  private isFinishingBlow(target: Enemy): boolean {
    if (target instanceof Boss) return true
    if (!this.director?.finalWaveOut) return false
    return this.enemies.every((e) => e === target || e.isGone || e.life.isDead)
  }

  /** 被打飛的雜兵撞到牆：額外受傷、震動畫面、牆邊揚起碎屑，算一次連擊。 */
  wallBounce(g: Grunt, side: Facing): void {
    const wasAlive = !g.life.isDead
    g.life.damage(WALL_BOUNCE_DAMAGE)
    g.flash = 4
    this.burst(g.x + side * 6, GROUND_Y - g.h - 20, '#d8d0c0')
    this.hitstop = Math.max(this.hitstop, 5)
    this.quake(4)
    this.fx.spark(g.x + side * 6, GROUND_Y - g.h - 20, true, false, side, this.realFrame)
    this.fx.pushIn(g.x, GROUND_Y - g.h - 20, 0.12, 8, this.realFrame)
    this.sound('heavyHit')
    this.combo.hit(this.realFrame)
    this.score += HIT_SCORE * this.combo.multiplier
    if (wasAlive && g.life.isDead) {
      this.score += g.score
      this.sound('ko')
    }
  }

  /** 特務面前抓得住的雜兵（站在地上、距離 GRAB_RANGE 內）；Boss 抓不住。 */
  grabTarget(f: Fighter): Grunt | null {
    let best: Grunt | null = null
    for (const e of this.enemies) {
      if (!(e instanceof Grunt) || !e.grabbable) continue
      const ahead = (e.x - f.x) * f.facing
      if (ahead < -4 || ahead > GRAB_RANGE) continue
      if (!best || Math.abs(e.x - f.x) < Math.abs(best.x - f.x)) best = e
    }
    return best
  }

  /** 這個位置附近有沒有正在浮空的雜兵（決定空中連段輔助要不要啟用）。 */
  hasJuggledEnemyNear(x: number, h: number): boolean {
    return this.enemies.some(
      (e) => e instanceof Grunt && e.juggled && Math.abs(e.x - x) < JUGGLE_ASSIST_RANGE && Math.abs(e.h - h) < 70,
    )
  }

  /**
   * 空中追擊時，特務最多貼近浮空的敵人到 AIR_SPACING，不會穿過去跑到前面
   *（一直按著方向鍵追打時，特務會自然停在打得到的位置）。
   */
  private keepAirSpacing(): void {
    const agent = this.agent
    if (!agent.airborne) return
    for (const e of this.enemies) {
      if (!(e instanceof Grunt) || !e.juggled || Math.abs(e.h - agent.h) > 50) continue
      const dx = e.x - agent.x
      if (Math.abs(dx) >= AIR_SPACING) continue
      const side = dx === 0 ? agent.facing : Math.sign(dx)
      agent.x = e.x - side * AIR_SPACING
      if (Math.sign(agent.vx) === side) agent.vx = 0
    }
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
        // 兩人迎面走向對方（一個往右、一個往左）：讓他們錯身走過去，不然互推會卡在一起
        const [left, right] = dx >= 0 ? [a, b] : [b, a]
        if (left.vx > PASS_SPEED && right.vx < -PASS_SPEED) continue
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
        // 閃光畫在判定框和受擊框重疊的中心
        const x0 = Math.max(hit.box.x, hurtbox.x)
        const x1 = Math.min(hit.box.x + hit.box.w, hurtbox.x + hurtbox.w)
        const y0 = Math.max(hit.box.y, hurtbox.y)
        const y1 = Math.min(hit.box.y + hit.box.h, hurtbox.y + hurtbox.h)
        this.landHit(attacker, target, hit.spec, dir, (x0 + x1) / 2, (y0 + y1) / 2, !!hit.hitsAllies)
        // 子彈、碎掉或已命中的投擲物不再打中同一幀的其他人
        if (spent(attacker)) break
      }

      // 只有特務這一方（拳腳、子彈、丟出的物件）打得破箱子
      if (attacker.team !== 'agent' || hit.hitsAllies) continue
      for (const crate of this.crates) {
        if (spent(attacker)) break
        if (crate.broken || hit.hitIds.has(crate.id) || !overlaps(hit.box, crate.box)) continue
        hit.hitIds.add(crate.id)
        crate.hit(this)
        this.sound(crate.broken ? 'break' : 'hit')
        attacker.onHitLanded?.(this)
        this.hitstop = Math.max(this.hitstop, 3)
      }
    }
  }

  // ── 自動撿起的道具 ──────────────────────────────────────────

  /** 特務站在醫療箱或分數道具上就自動撿起並生效。 */
  private collectConsumables(): void {
    const agent = this.agent
    if (agent.airborne || agent.life.isDead) return
    for (const e of this.items) {
      if (!e.pickable || categoryOf(e.item) !== 'consumable' || Math.abs(e.x - agent.x) > CONSUME_REACH) continue
      // 背包空著：醫療箱收進背包，之後按 V 使用
      if (e.item.type === 'medkit' && !agent.bag) {
        e.removed = true
        agent.bag = e.item
        this.popup(e.x, 'BAG', '#7dff8a')
        this.sound('pickup')
        continue
      }
      // 背包滿了就直接補血；滿血時醫療箱留在地上，需要時再回來拿
      if (e.item.type === 'medkit' && agent.life.hp >= agent.life.max) continue
      e.removed = true
      if (e.item.type === 'medkit') {
        agent.life.heal(e.item.uses)
        this.popup(e.x, 'HEAL', '#7dff8a')
        this.sound('heal')
      } else {
        this.score += e.item.uses
        this.popup(e.x, `+${e.item.uses}`, '#ffe36b')
        this.sound('coin')
      }
    }
  }

  private popup(x: number, text: string, color: string): void {
    this.popups.push({ x, text, color, born: this.realFrame })
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
    const camX = this.applySlowmoDisplay()
    this.fx.applyZoom(ctx, camX, this.realFrame)
    drawBackground(ctx, this.theme, camX, this.floor && !this.floor.final ? this.floor.stairsX : null, this.realFrame)
    for (const c of this.crates) c.draw(ctx, camX)
    for (const i of this.items) if (i.state === 'ground') i.draw(ctx, camX)
    this.drawPickupPrompt(ctx, camX)
    for (const g of this.enemies) g.draw(ctx, camX)
    this.agent.draw(ctx, camX)
    for (const i of this.items) if (i.state === 'flying') i.draw(ctx, camX)
    for (const b of this.bullets) b.draw(ctx, camX)
    this.flashes = this.flashes.filter((f) => this.realFrame - f.born < MUZZLE_FRAMES)
    for (const f of this.flashes) {
      const t = 1 - (this.realFrame - f.born) / MUZZLE_FRAMES
      ctx.fillStyle = `rgba(255, 190, 60, ${0.6 * t})`
      ctx.beginPath()
      ctx.arc(f.x - camX, f.y, f.size, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = `rgba(255, 255, 230, ${t})`
      ctx.beginPath()
      ctx.arc(f.x - camX, f.y, f.size * 0.45, 0, Math.PI * 2)
      ctx.fill()
    }
    this.particles.draw(ctx, camX)
    this.fx.drawSparks(ctx, camX, this.realFrame)
    ctx.font = '8px "Press Start 2P", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    for (const p of this.popups) {
      const age = this.realFrame - p.born
      const y = GROUND_Y - 30 - age * 0.5
      ctx.fillStyle = '#000'
      ctx.fillText(p.text, p.x - camX + 1, y + 1)
      ctx.fillStyle = p.color
      ctx.fillText(p.text, p.x - camX, y)
    }
    if (this.debug) this.drawBoxes(ctx, camX)
    for (const f of this.fighters) f.display = null
    ctx.restore()
    this.fx.drawWhite(ctx, this.realFrame)
    drawHud(ctx, this)
  }

  /**
   * 慢動作時，模擬每 SLOWMO_RATE 幀才推進一次；中間的幀把角色與鏡頭畫在上一步和這一步之間，
   * 看起來是平順的慢動作而不是低幀率。回傳這一幀要用的鏡頭位置。
   */
  private applySlowmoDisplay(): number {
    const prev = this.slowPrev
    if (!prev) return this.camX
    const t = Math.min(1, (this.realFrame - prev.at + 1) / SLOWMO_RATE)
    if (t >= 1) return this.camX
    for (const f of this.fighters) {
      const a = prev.fighters.get(f)
      if (!a) continue
      const b = snapshot(f)
      f.display = {
        x: a.x + (b.x - a.x) * t,
        h: a.h + (b.h - a.h) * t,
        rotation: a.rotation + (b.rotation - a.rotation) * t,
        pose: lerpPose(a.pose, b.pose, t),
      }
    }
    return prev.camX + (this.camX - prev.camX) * t
  }

  /** 慢動作補間時角色實際畫出來的位置（測試用）。 */
  displayX(f: Fighter): number {
    this.applySlowmoDisplay()
    const x = f.display?.x ?? f.x
    for (const g of this.fighters) g.display = null
    return x
  }

  private drawPickupPrompt(ctx: CanvasRenderingContext2D, camX: number): void {
    if (this.agent.airborne) return
    const e = this.pickupCandidate(this.agent)
    if (!e || (this.agent.held && categoryOf(e.item) !== 'ammo')) return
    const x = e.x - camX
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
