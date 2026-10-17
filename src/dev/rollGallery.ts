import { Agent } from '../game/agent/agent'
import { MOVES } from '../game/agent/moves'
import { GROUND_Y } from '../game/constants'
import { drawBackground } from '../game/render/background'

/** 開發用：?roll 把翻滾過程的 9 個瞬間並排畫出來，檢查身體是否貼地。 */
export function drawRollGallery(ctx: CanvasRenderingContext2D): void {
  drawBackground(ctx, 'lobby', 0, null)
  for (let i = 0; i <= 8; i++) {
    const agent = new Agent(40 + i * 50)
    const internal = agent as unknown as { startAction(def: unknown): void; act: { frame: number } }
    internal.startAction(MOVES.roll)
    internal.act.frame = Math.round((i / 8) * 17)
    agent.rotation = (i / 8) * Math.PI * 2
    agent.draw(ctx, 0)
  }
  ctx.fillStyle = '#c00'
  ctx.fillRect(0, GROUND_Y, 480, 1)
}
