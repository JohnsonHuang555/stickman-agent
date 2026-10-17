import { GROUND_Y, VIEW_H, VIEW_W } from '../constants'

/** 1F 大廳背景：天花板燈、落地窗、柱子、木質護牆板與磁磚地板。 */
export function drawLobby(ctx: CanvasRenderingContext2D, camX: number): void {
  ctx.fillStyle = '#d6cdb9'
  ctx.fillRect(0, 0, VIEW_W, GROUND_Y)

  // 落地窗外的夜景（視差 0.5）
  for (let wx = Math.floor((camX * 0.5) / 160) * 160 - 160; wx < camX * 0.5 + VIEW_W + 160; wx += 160) {
    const x = Math.round(wx - camX * 0.5) + 40
    ctx.fillStyle = '#1d2540'
    ctx.fillRect(x, 50, 90, 120)
    ctx.fillStyle = '#f2d36b'
    for (let i = 0; i < 9; i++) {
      const lx = x + 8 + ((i * 37 + wx) % 74)
      const ly = 70 + ((i * 53 + wx) % 90)
      ctx.fillRect(lx, ly, 3, 3)
    }
    ctx.fillStyle = '#3b3328'
    ctx.fillRect(x - 3, 47, 96, 3)
    ctx.fillRect(x - 3, 170, 96, 3)
    ctx.fillRect(x + 44, 50, 2, 120)
  }

  // 天花板
  ctx.fillStyle = '#2d2a26'
  ctx.fillRect(0, 0, VIEW_W, 24)
  for (let wx = Math.floor(camX / 120) * 120; wx < camX + VIEW_W + 120; wx += 120) {
    ctx.fillStyle = '#fff6d0'
    ctx.fillRect(Math.round(wx - camX) + 30, 24, 40, 3)
  }

  // 柱子
  for (let wx = Math.floor(camX / 240) * 240; wx < camX + VIEW_W + 240; wx += 240) {
    const x = Math.round(wx - camX)
    ctx.fillStyle = '#b5a98f'
    ctx.fillRect(x, 24, 20, GROUND_Y - 24)
    ctx.fillStyle = '#9a8e76'
    ctx.fillRect(x + 14, 24, 6, GROUND_Y - 24)
  }

  // 護牆板
  ctx.fillStyle = '#7c5a3c'
  ctx.fillRect(0, GROUND_Y - 30, VIEW_W, 30)
  ctx.fillStyle = '#5f432b'
  ctx.fillRect(0, GROUND_Y - 30, VIEW_W, 2)

  // 地板
  ctx.fillStyle = '#6f655a'
  ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y)
  ctx.fillStyle = '#3d362f'
  ctx.fillRect(0, GROUND_Y, VIEW_W, 2)
  ctx.fillStyle = '#62594f'
  for (let wx = Math.floor(camX / 32) * 32; wx < camX + VIEW_W + 32; wx += 32) {
    ctx.fillRect(Math.round(wx - camX), GROUND_Y + 2, 1, VIEW_H - GROUND_Y)
  }
  ctx.fillRect(0, GROUND_Y + 18, VIEW_W, 1)
}
