import { GROUND_Y } from '../game/constants'
import { drawBackground } from '../game/render/background'
import { drawStickman } from '../game/stickman/pose'
import { WALK_CYCLE_DISTANCE, walkPose } from '../game/stickman/poses'

/** 開發用：?walk 並排畫出一個走路循環的 8 個瞬間。 */
export function drawWalkGallery(ctx: CanvasRenderingContext2D): void {
  drawBackground(ctx, 'lobby', 0, null)
  for (let i = 0; i < 8; i++) {
    const stride = (i / 8) * WALK_CYCLE_DISTANCE
    drawStickman(ctx, walkPose(stride), 40 + i * 55, GROUND_Y, 1, { body: '#111111', back: '#7a7a7a' })
  }
  ctx.fillStyle = '#c00'
  ctx.fillRect(0, GROUND_Y, 480, 1)
}
