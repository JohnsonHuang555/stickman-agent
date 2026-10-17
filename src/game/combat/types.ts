import type { Clip } from '../stickman/clip'
import type { Fighter } from '../fighter'

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

export interface ActionDef {
  clip: Clip
  /** 總幀數；空中動作為 Infinity，落地即結束。 */
  length: number
  hit?: HitSpec
  aerial?: boolean
  /** 連擊：accept 幀起接受下一拳輸入，at 幀起才接下一段。 */
  chain?: { accept: number; at: number; next: string }
  /** 起手幾幀內可被 z+x 取消成保命招。 */
  cancelToDesperation?: boolean
  invuln?: boolean
  /** 霸體：被打只扣血，不會被打斷。 */
  armor?: boolean
  onStart?: (f: Fighter) => void
  tick?: (f: Fighter, frame: number) => void
}

export interface ActionInstance {
  def: ActionDef
  frame: number
  hitIds: Set<number>
  chainQueued: boolean
}

export const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
