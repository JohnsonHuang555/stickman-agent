import { Fighter } from '../fighter'

/** 所有敵人（雜兵、小 Boss、魔王）的共同介面。 */
export abstract class Enemy extends Fighter {
  readonly team = 'gang' as const
  removed = false
  /** 已經走進鎖定的畫面；之後不能再離開。 */
  entered = false

  abstract readonly label: string
  /** 擊倒時的得分。 */
  abstract readonly score: number
  /** 正在倒地消失，不算存活。 */
  abstract readonly isGone: boolean

  /** 是否正持有（或想取得）攻擊名額；離開時由 World 收回名額。 */
  get wantsSlot(): boolean {
    return false
  }

  /** 強制陣亡（魔王被打倒時，剩下的手下一起倒下）。 */
  abstract defeat(): void
}
