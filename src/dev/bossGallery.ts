import { Agent } from '../game/agent/agent'
import { Boss } from '../game/enemies/boss'
import { newItem } from '../game/items/itemTypes'
import { drawBackground } from '../game/render/background'

/** 開發用：在 ?bosses 頁面並排三個 Boss（含 Johnson 各階段）與特務比較體型。 */
export function drawBossGallery(ctx: CanvasRenderingContext2D): void {
  drawBackground(ctx, 'office', 0, null)
  const agent = new Agent(40)
  agent.draw(ctx, 0)
  const kane = new Boss(110, 'kane')
  const ryu = new Boss(190, 'ryu')
  const johnson1 = new Boss(270, 'johnson')
  const johnson2 = new Boss(350, 'johnson')
  johnson2.held = newItem('pistol')
  const johnson3 = new Boss(430, 'johnson')
  johnson3.held = newItem('desk')
  for (const b of [kane, ryu, johnson1, johnson2, johnson3]) {
    b.facing = -1
    b.draw(ctx, 0)
  }
}
