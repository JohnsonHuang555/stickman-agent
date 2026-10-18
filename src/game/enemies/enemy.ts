import { Fighter } from '../fighter'
import type { World } from '../world'

/** 走路時離牆多近就算「已經貼牆」。 */
const WALL_TOUCH = 1

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

  /** 自己走得到的範圍：走進鎖定畫面後是畫面兩側，否則是整層樓。 */
  protected walkBounds(world: World): { left: number; right: number } {
    if (world.director?.lockLeft != null && this.entered) return world.wallBounds()
    return { left: 8, right: world.floorWidth - 8 }
  }

  /** 已經貼著牆還要往牆裡走：停下來，不要原地踏步。 */
  protected stopAtWall(world: World): void {
    if (this.airborne) return
    const { left, right } = this.walkBounds(world)
    if ((this.vx < 0 && this.x <= left + WALL_TOUCH) || (this.vx > 0 && this.x >= right - WALL_TOUCH)) this.vx = 0
  }
}
