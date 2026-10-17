import { GROUND_Y, VIEW_W } from '../game/constants'
import { drawLobby } from '../game/render/background'
import { drawStickman, type Pose } from '../game/stickman/pose'
import { ATTACK_POSES, POSES } from '../game/stickman/poses'

/** 開發用：在 ?poses 頁面列出所有姿勢，方便調整關鍵影格。 */
export function drawPoseGallery(ctx: CanvasRenderingContext2D): void {
  const entries: [string, Pose][] = [
    ...Object.entries(POSES),
    ...Object.entries(ATTACK_POSES).flatMap(([name, poses]) =>
      poses.map((p, i): [string, Pose] => [`${name}${poses.length > 1 ? (i ? '+' : '-') : ''}`, p]),
    ),
  ]
  drawLobby(ctx, 0)
  const perRow = 12
  const rowGap = 70
  entries.forEach(([name, pose], i) => {
    const col = i % perRow
    const row = Math.floor(i / perRow)
    const x = 22 + col * ((VIEW_W - 30) / perRow)
    const footY = GROUND_Y - (2 - row) * rowGap
    drawStickman(ctx, pose, x, footY, 1, { body: '#111111', back: '#4a4a4a' })
    ctx.fillStyle = '#c00'
    ctx.fillRect(x - 10, footY, 20, 1)
    ctx.font = '6px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#000'
    ctx.fillText(name, x, footY + 8)
  })
}
