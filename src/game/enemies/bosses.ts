import type { ItemTypeId } from '../items/itemTypes'
import type { GruntSpawn } from '../level/floors'
import type { Palette } from '../stickman/pose'
import type { BossMoveId } from './bossMoves'

export type BossId = 'kane' | 'ryu' | 'johnson'
export type Costume = 'kane' | 'ryu' | 'johnson'

export interface BossPhase {
  moves: readonly BossMoveId[]
  walkSpeed: number
  cooldown: readonly [min: number, max: number]
  /** 這個階段手上（外觀）拿的東西。 */
  held?: ItemTypeId
  heldBack?: ItemTypeId
  /** 進入此階段時叫來的手下；之後每 summonEvery 幀，手下少於 summon.length 時再叫。 */
  summon?: readonly GruntSpawn[]
  summonEvery?: number
}

export interface BossDef {
  label: string
  /** 出場時的副標。 */
  title: string
  palette: Palette
  scale: number
  bars: number
  barSize: number
  score: number
  costume: Costume
  /** 依已失去的命條數切換：phases[0] 為第一條命條。 */
  phases: readonly BossPhase[]
}

const DARK_RED: Palette = { body: '#8b1a1a', back: '#5e1010' }
const GOLD: Palette = { body: '#d4a017', back: '#9c7410' }

export const BOSSES: Readonly<Record<BossId, BossDef>> = {
  kane: {
    label: 'KANE',
    title: 'THE CROWBAR',
    palette: DARK_RED,
    scale: 1.25,
    bars: 2,
    barSize: 120,
    score: 2000,
    costume: 'kane',
    phases: [
      { moves: ['crowbarSwing', 'crowbarSwing', 'crowbarCharge', 'crowbarSlam'], walkSpeed: 0.9, cooldown: [50, 90], held: 'crowbar' },
      { moves: ['crowbarSwing', 'crowbarCharge', 'crowbarCharge', 'crowbarSlam'], walkSpeed: 1.2, cooldown: [28, 55], held: 'crowbar' },
    ],
  },
  ryu: {
    label: 'RYU',
    title: 'TWIN BLADES',
    palette: DARK_RED,
    scale: 1.05,
    bars: 2,
    barSize: 130,
    score: 2000,
    costume: 'ryu',
    phases: [
      { moves: ['bladeSlash', 'bladeSlash', 'bladeDash', 'bladeSpin'], walkSpeed: 1.3, cooldown: [40, 70], held: 'katana', heldBack: 'katana' },
      { moves: ['bladeSlash', 'bladeDash', 'bladeDash', 'bladeSpin'], walkSpeed: 1.6, cooldown: [22, 45], held: 'katana', heldBack: 'katana' },
    ],
  },
  johnson: {
    label: 'JOHNSON',
    title: 'THE BOSS',
    palette: GOLD,
    scale: 1.3,
    bars: 3,
    barSize: 150,
    score: 10000,
    costume: 'johnson',
    phases: [
      { moves: ['bossJab', 'bossJab', 'bossCharge'], walkSpeed: 1.0, cooldown: [45, 80] },
      {
        moves: ['bossSpray', 'bossSpray', 'bossJab'],
        walkSpeed: 1.0,
        cooldown: [40, 70],
        held: 'pistol',
        summon: [{ type: 'thug', side: 'left' }, { type: 'gunman', side: 'right', held: null }],
        summonEvery: 600,
      },
      { moves: ['bossDesk', 'bossCharge', 'bossJab', 'bossDesk'], walkSpeed: 1.5, cooldown: [20, 45] },
    ],
  },
}
