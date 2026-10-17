import type { Box } from '../combat/types'
import { GROUND_Y } from '../constants'
import { newItem, type ItemTypeId } from '../items/itemTypes'
import type { World } from '../world'

/** 打幾下才會碎。 */
export const CRATE_HITS = 2
const LOOT_WEAPONS: readonly ItemTypeId[] = ['bat', 'crowbar', 'knife', 'pistol']

/** 箱子必掉一項：醫療箱 50%、武器 30%、分數道具 20%（現金較常見）。 */
export function rollCrateLoot(rng: () => number = Math.random): ItemTypeId {
  const r = rng()
  if (r < 0.5) return 'medkit'
  if (r < 0.8) return LOOT_WEAPONS[Math.floor(rng() * LOOT_WEAPONS.length)]
  return rng() < 0.7 ? 'cash' : 'gold'
}

// 與角色 id 分開，避免在攻擊的 hitIds 裡撞號
let nextCrateId = 1_000_000

/** 可被特務打破的木箱。 */
export class Crate {
  readonly id = nextCrateId++
  hp = CRATE_HITS
  broken = false
  private wobble = 0

  constructor(
    readonly x: number,
    /** 指定掉落物；省略則隨機。 */
    readonly loot?: ItemTypeId,
  ) {}

  /** 受擊範圍比外觀高，讓拳頭和子彈也打得到。 */
  get box(): Box {
    return { x: this.x - 10, y: GROUND_Y - 34, w: 20, h: 34 }
  }

  hit(world: World): void {
    this.hp--
    this.wobble = 8
    if (this.hp > 0) return
    this.broken = true
    world.burst(this.x, GROUND_Y - 9, '#a8783f')
    world.burst(this.x, GROUND_Y - 9, '#7a5428')
    world.dropItem(newItem(this.loot ?? rollCrateLoot()), this.x, 0)
  }

  draw(ctx: CanvasRenderingContext2D, camX: number): void {
    if (this.wobble > 0) this.wobble--
    const x = this.x - camX - 10 + (this.wobble % 2 ? 1 : 0)
    const y = GROUND_Y - 18
    ctx.fillStyle = '#a8783f'
    ctx.fillRect(x, y, 20, 18)
    ctx.fillStyle = '#7a5428'
    ctx.fillRect(x, y, 20, 2)
    ctx.fillRect(x, y + 16, 20, 2)
    ctx.fillRect(x, y, 2, 18)
    ctx.fillRect(x + 18, y, 2, 18)
    ctx.fillRect(x + 9, y + 2, 2, 14)
    if (this.hp < CRATE_HITS) {
      ctx.fillStyle = '#3d2a14'
      ctx.fillRect(x + 4, y + 5, 4, 1)
      ctx.fillRect(x + 7, y + 6, 1, 5)
      ctx.fillRect(x + 13, y + 9, 3, 1)
    }
  }
}
