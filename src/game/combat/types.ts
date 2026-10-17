import type { Clip } from '../stickman/clip'
import type { Fighter } from '../fighter'
import type { Facing } from '../input/commands'
import type { World } from '../world'

export type Team = 'agent' | 'gang'

/** 螢幕座標矩形（左上角）。 */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** 以角色為基準的相對矩形：forward 為朝面向方向的近側邊距離，up 為離腳底的高度。 */
export interface RelBox {
  forward: number
  up: number
  w: number
  h: number
}

export interface HitSpec {
  /** 判定生效的動作幀區間（含）。 */
  from: number
  to: number
  box: RelBox
  damage: number
  hitstun: number
  knockback: number
  knockdown?: boolean
  /** 重擊：頓幀較長並震動畫面。 */
  heavy?: boolean
  /** 挑空：把雜兵打上空中的初速（Boss 不受影響）。 */
  launch?: number
  /** 下砸：把空中的雜兵往下打，著地時反彈。 */
  spike?: boolean
}

/** 這一幀正在生效的攻擊判定。 */
export interface ActiveHit {
  spec: HitSpec
  box: Box
  /** 本次攻擊已命中過的對象，避免同一招重複命中。 */
  hitIds: Set<number>
  /** 只打同陣營（例如被擊飛的雜兵撞到同伴）。 */
  hitsAllies?: boolean
}

/** 任何能造成傷害的東西：角色、子彈、被丟出的物件。 */
export interface Hitter {
  readonly team: Team
  x: number
  vx: number
  facing: Facing
  activeHit(): ActiveHit | null
  onHitLanded?(world: World): void
}

export interface ActionDef {
  clip: Clip
  /** 總幀數；空中動作為 Infinity，落地即結束。 */
  length: number
  hit?: HitSpec
  aerial?: boolean
  /** 連擊：accept 幀起接受輸入 on（預設為出拳），at 幀起才接下一段 next。 */
  chain?: { accept: number; at: number; next: string; on?: string }
  /** 從這一幀起按跳可以取消收招直接起跳（挑空技接追擊用）。 */
  jumpCancel?: number
  /** 起手幾幀內可被 z+x 取消成保命招。 */
  cancelToDesperation?: boolean
  invuln?: boolean
  /** 霸體：被打只扣血，不會被打斷。 */
  armor?: boolean
  /** 使用近戰武器的動作；命中時消耗耐久度。 */
  itemUse?: boolean
  /** 武器長度：判定框改為「手到武器尖端」這一段，跟著畫面上的武器走。 */
  weaponLength?: number
  onStart?: (f: Fighter) => void
  tick?: (f: Fighter, frame: number, world: World) => void
}

export interface ActionInstance {
  def: ActionDef
  frame: number
  hitIds: Set<number>
  chainQueued: boolean
}

export const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
