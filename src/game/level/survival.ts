import type { BossId } from '../enemies/bosses'
import type { EnemyType } from '../enemies/enemyTypes'
import type { ItemTypeId } from '../items/itemTypes'
import type { Spawn, Theme } from './floors'

/**
 * 生存模式：單一畫面的場地，一波接一波，越後面敵人越多、種類越多，每 5 波一隻 Boss。
 * 一波清空後停一下（顯示 WAVE n）再出下一波；場上同時最多 MAX_ALIVE 個敵人，其餘排隊。
 */
export const SURVIVAL = {
  /** 第一波出場前、每波之間的停頓（幀）。 */
  pause: 100,
  /** 同一波敵人錯開出場的幀數。 */
  stagger: 30,
  /** 場上同時最多幾個敵人（其餘排隊等前面的倒下）。 */
  maxAlive: 4,
  /** 每清一波的獎勵分數 = bonus × 波數。 */
  bonus: 300,
  /** 每清一波回血（最大血量的比例）。 */
  heal: 0.15,
} as const

const BOSS_ORDER: readonly BossId[] = ['kane', 'ryu', 'johnson']
const THEMES: readonly Theme[] = ['lobby', 'casino', 'office']

/** 第 wave 波可以出現的雜兵種類：越後面越多種。 */
export function survivalPool(wave: number): EnemyType[] {
  if (wave <= 2) return ['thug']
  if (wave <= 4) return ['thug', 'bruiser', 'knifer']
  return ['thug', 'bruiser', 'knifer', 'gunman', 'heavy']
}

/** 第 wave 波的出場名單；rng 讓測試可以固定結果。 */
export function survivalWave(wave: number, rng: () => number = Math.random): Spawn[] {
  const side = (i: number) => (i % 2 === 0 ? 'right' : 'left') as 'left' | 'right'
  if (wave % 5 === 0) {
    const boss = BOSS_ORDER[(wave / 5 - 1) % BOSS_ORDER.length]
    const escorts = Math.min(3, Math.floor(wave / 5))
    return [{ boss, side: 'right' }, ...Array.from({ length: escorts }, (_, i): Spawn => ({ type: 'thug', side: side(i + 1) }))]
  }
  const pool = survivalPool(wave)
  const count = Math.min(2 + Math.floor((wave - 1) / 2), 7)
  return Array.from({ length: count }, (_, i): Spawn => ({ type: pool[Math.floor(rng() * pool.length)], side: side(i) }))
}

/** 每 5 波換一個場景：大廳 → 賭場 → 頂樓 → 大廳… */
export function survivalTheme(wave: number): Theme {
  return THEMES[Math.floor(Math.max(0, wave - 1) / 5) % THEMES.length]
}

/** 每波開始時掉在場上的東西：每 3 波一個醫療箱，其他波一把隨機武器。 */
export function survivalDrop(wave: number, rng: () => number = Math.random): ItemTypeId {
  if (wave % 3 === 0) return 'medkit'
  const weapons: ItemTypeId[] = ['bat', 'crowbar', 'knife', 'katana', 'pistol', 'chair']
  return weapons[Math.floor(rng() * weapons.length)]
}

export class SurvivalDirector {
  /** 目前（或剛清完）的波數；0 = 還沒開始。 */
  wave = 0
  /** 這一波還沒出場的敵人。 */
  private queue: Spawn[] = []
  private nextSpawnAt = 0
  /** 上一波清空的幀；null = 這一波還在打。 */
  private clearedAt: number | null = 0
  /** 這一波開始的幀（畫 WAVE n 標題用）。 */
  startedAt = -999

  /**
   * 每幀呼叫，alive = 場上還活著的敵人數。回傳本幀要出場的敵人；
   * waveCleared = 剛清完一波（World 據此給獎勵、回血）。
   */
  update(frame: number, alive: number): { spawns: Spawn[]; waveCleared: boolean; waveStarted: boolean } {
    let waveCleared = false
    let waveStarted = false
    const spawns: Spawn[] = []
    if (this.clearedAt === null && this.queue.length === 0 && alive === 0) {
      this.clearedAt = frame
      waveCleared = this.wave > 0
    }
    if (this.clearedAt !== null && frame - this.clearedAt >= SURVIVAL.pause) {
      this.clearedAt = null
      this.wave++
      this.queue = survivalWave(this.wave)
      this.nextSpawnAt = frame
      this.startedAt = frame
      waveStarted = true
    }
    if (this.queue.length && frame >= this.nextSpawnAt && alive + spawns.length < SURVIVAL.maxAlive) {
      spawns.push(this.queue.shift()!)
      this.nextSpawnAt = frame + SURVIVAL.stagger
    }
    return { spawns, waveCleared, waveStarted }
  }
}
