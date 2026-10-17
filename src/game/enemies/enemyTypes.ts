import type { Palette } from '../stickman/pose'
import type { EnemyMoveId } from './enemyMoves'

export type EnemyType = 'thug' | 'bruiser' | 'knifer' | 'gunman' | 'heavy'

interface EnemyTypeDef {
  label: string
  hue: number
  sat: number
  light: number
  hp: number
  /** 擊倒時的得分。 */
  score: number
  scale: number
  walkSpeed: number
  /** 出完招後的冷卻幀數範圍。 */
  cooldown: readonly [min: number, max: number]
  /** 沒有攻擊名額時與特務保持的距離。 */
  hoverDistance: number
  moves: readonly EnemyMoveId[]
}

// 打手、刀手、槍手的武器會在持有物系統加入後補上；目前先用拳腳。
export const ENEMY_TYPES: Readonly<Record<EnemyType, EnemyTypeDef>> = {
  thug: {
    label: 'THUG', hue: 0, sat: 0, light: 55, hp: 40, score: 100, scale: 1,
    walkSpeed: 1.0, cooldown: [50, 100], hoverDistance: 70, moves: ['jab', 'jab', 'kick'],
  },
  bruiser: {
    label: 'BRUISER', hue: 215, sat: 60, light: 50, hp: 60, score: 150, scale: 1,
    walkSpeed: 0.9, cooldown: [45, 90], hoverDistance: 65, moves: ['jab', 'kick', 'kick'],
  },
  knifer: {
    label: 'KNIFER', hue: 135, sat: 50, light: 40, hp: 45, score: 200, scale: 1,
    walkSpeed: 1.4, cooldown: [40, 80], hoverDistance: 90, moves: ['thrust', 'thrust', 'jab'],
  },
  gunman: {
    label: 'GUNMAN', hue: 275, sat: 45, light: 50, hp: 45, score: 200, scale: 1,
    walkSpeed: 1.0, cooldown: [70, 120], hoverDistance: 120, moves: ['kick'],
  },
  heavy: {
    label: 'HEAVY', hue: 28, sat: 85, light: 52, hp: 100, score: 300, scale: 1.2,
    walkSpeed: 0.7, cooldown: [70, 120], hoverDistance: 60, moves: ['slam', 'jab'],
  },
}

export const ENEMY_TYPE_IDS = Object.keys(ENEMY_TYPES) as EnemyType[]

/** 同類型內的些微色差。 */
export function randomPalette(type: EnemyType, rng: () => number = Math.random): Palette {
  const t = ENEMY_TYPES[type]
  const hue = t.hue + (rng() * 2 - 1) * 8
  const light = t.light + (rng() * 2 - 1) * 6
  return {
    body: `hsl(${hue} ${t.sat}% ${light}%)`,
    back: `hsl(${hue} ${t.sat}% ${light - 14}%)`,
  }
}
