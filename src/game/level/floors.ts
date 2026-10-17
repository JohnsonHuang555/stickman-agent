import type { BossId } from '../enemies/bosses'
import type { EnemyType } from '../enemies/enemyTypes'
import type { ItemTypeId } from '../items/itemTypes'

export type Theme = 'lobby' | 'casino' | 'office'

export interface GruntSpawn {
  type: EnemyType
  side: 'left' | 'right'
  /** 覆寫登場時的持有物；null 表示空手，省略則用敵人類型的預設。 */
  held?: ItemTypeId | null
}

export interface BossSpawn {
  boss: BossId
  side: 'left' | 'right'
}

export type Spawn = GruntSpawn | BossSpawn

export interface ZoneDef {
  /** 鏡頭鎖定時畫面左緣的地板座標。特務走到畫面中央（start + 240）時觸發。 */
  start: number
  /** 依序出場的波次；前一波全滅才出下一波。 */
  waves: Spawn[][]
}

export interface FloorDef {
  label: string
  subtitle: string
  theme: Theme
  width: number
  zones: ZoneDef[]
  /** 樓梯所在的地板座標；清完所有區段後走到這裡就上樓。 */
  stairsX: number
  /** 最終樓層：沒有樓梯，清完即通關。 */
  final?: boolean
  items: [ItemTypeId, number][]
  /** 可打破的箱子：[x, 指定掉落物（省略則隨機）]。 */
  crates: [number, ItemTypeId?][]
}

const L = 'left'
const R = 'right'

export const FLOORS: readonly FloorDef[] = [
  {
    label: '1F',
    subtitle: 'LOBBY',
    theme: 'lobby',
    width: 1600,
    stairsX: 1550,
    items: [['chair', 330], ['bat', 560], ['chair', 900], ['cabinet', 1180]],
    crates: [[450], [980], [1120, 'medkit']],
    zones: [
      {
        start: 160,
        waves: [
          [{ type: 'thug', side: R }, { type: 'thug', side: R }],
          [{ type: 'thug', side: L }, { type: 'bruiser', side: R, held: 'bat' }],
        ],
      },
      {
        start: 620,
        waves: [
          [{ type: 'knifer', side: R }, { type: 'thug', side: L }],
          [{ type: 'bruiser', side: R }, { type: 'thug', side: R }, { type: 'thug', side: L }],
        ],
      },
      {
        start: 1060,
        waves: [
          [{ type: 'gunman', side: R }, { type: 'thug', side: R }],
          [{ type: 'heavy', side: R }, { type: 'bruiser', side: L, held: 'crowbar' }, { type: 'thug', side: L }],
          [{ boss: 'kane', side: R }, { type: 'thug', side: L }],
        ],
      },
    ],
  },
  {
    label: '2F',
    subtitle: 'CASINO',
    theme: 'casino',
    width: 1800,
    stairsX: 1750,
    items: [['chair', 300], ['knife', 520], ['chair', 820], ['shotgun', 1150], ['chair', 1420]],
    crates: [[420], [1000], [1300, 'medkit']],
    zones: [
      {
        start: 200,
        waves: [
          [{ type: 'knifer', side: R }, { type: 'thug', side: L }, { type: 'thug', side: R }],
          [{ type: 'gunman', side: R }, { type: 'bruiser', side: L }],
        ],
      },
      {
        start: 700,
        waves: [
          [{ type: 'heavy', side: R }, { type: 'knifer', side: L }],
          [{ type: 'gunman', side: L }, { type: 'gunman', side: R }, { type: 'thug', side: R }],
        ],
      },
      {
        start: 1240,
        waves: [
          [{ type: 'bruiser', side: R, held: 'katana' }, { type: 'knifer', side: R }, { type: 'thug', side: L }],
          [{ type: 'heavy', side: L }, { type: 'gunman', side: R }, { type: 'knifer', side: R }],
          [{ boss: 'ryu', side: R }],
        ],
      },
    ],
  },
  {
    label: '3F',
    subtitle: 'PENTHOUSE',
    theme: 'office',
    width: 1400,
    stairsX: 1350,
    final: true,
    items: [['cabinet', 280], ['chair', 600], ['pistol', 760], ['cabinet', 1000], ['chair', 1180]],
    crates: [[400], [850, 'medkit'], [1060, 'medkit']],
    zones: [
      {
        start: 160,
        waves: [
          [{ type: 'gunman', side: R }, { type: 'knifer', side: L }, { type: 'bruiser', side: R }],
          [{ type: 'heavy', side: R }, { type: 'heavy', side: L }],
        ],
      },
      {
        start: 660,
        waves: [
          [{ type: 'knifer', side: R }, { type: 'knifer', side: L }, { type: 'gunman', side: R }],
          [{ type: 'bruiser', side: L, held: 'katana' }, { type: 'gunman', side: R }, { type: 'heavy', side: R }],
        ],
      },
      {
        start: 920,
        waves: [[{ boss: 'johnson', side: R }]],
      },
    ],
  },
]
