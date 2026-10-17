import { GROUND_Y, VIEW_H, VIEW_W } from '../constants'
import type { Theme } from '../level/floors'

/** 對地板座標每隔 step 重複呼叫 draw(螢幕 x, 地板 x)。 */
function repeat(camX: number, step: number, parallax: number, draw: (x: number, wx: number) => void): void {
  const offset = camX * parallax
  for (let wx = Math.floor(offset / step) * step - step; wx < offset + VIEW_W + step; wx += step) {
    draw(wx - offset, wx)
  }
}

function floorTiles(ctx: CanvasRenderingContext2D, camX: number, base: string, edge: string, line: string): void {
  ctx.fillStyle = base
  ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y)
  ctx.fillStyle = edge
  ctx.fillRect(0, GROUND_Y, VIEW_W, 2)
  ctx.fillStyle = line
  repeat(camX, 32, 1, (x) => ctx.fillRect(x, GROUND_Y + 2, 1, VIEW_H - GROUND_Y))
  ctx.fillRect(0, GROUND_Y + 18, VIEW_W, 1)
}

function cityWindow(ctx: CanvasRenderingContext2D, x: number, wx: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#1d2540'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#f2d36b'
  for (let i = 0; i < 9; i++) {
    ctx.fillRect(x + 6 + ((i * 37 + wx) % (w - 12)), y + 14 + ((i * 53 + wx) % (h - 24)), 3, 3)
  }
}

/** 1F 大廳：落地窗、柱子、木質護牆板。 */
function lobby(ctx: CanvasRenderingContext2D, camX: number): void {
  ctx.fillStyle = '#d6cdb9'
  ctx.fillRect(0, 0, VIEW_W, GROUND_Y)
  repeat(camX, 160, 0.5, (x, wx) => {
    cityWindow(ctx, x + 40, wx, 50, 90, 120)
    ctx.fillStyle = '#3b3328'
    ctx.fillRect(x + 37, 47, 96, 3)
    ctx.fillRect(x + 37, 170, 96, 3)
    ctx.fillRect(x + 84, 50, 2, 120)
  })
  ctx.fillStyle = '#2d2a26'
  ctx.fillRect(0, 0, VIEW_W, 24)
  repeat(camX, 120, 1, (x) => {
    ctx.fillStyle = '#fff6d0'
    ctx.fillRect(x + 30, 24, 40, 3)
  })
  repeat(camX, 240, 1, (x) => {
    ctx.fillStyle = '#b5a98f'
    ctx.fillRect(x, 24, 20, GROUND_Y - 24)
    ctx.fillStyle = '#9a8e76'
    ctx.fillRect(x + 14, 24, 6, GROUND_Y - 24)
  })
  ctx.fillStyle = '#7c5a3c'
  ctx.fillRect(0, GROUND_Y - 30, VIEW_W, 30)
  ctx.fillStyle = '#5f432b'
  ctx.fillRect(0, GROUND_Y - 30, VIEW_W, 2)
  floorTiles(ctx, camX, '#6f655a', '#3d362f', '#62594f')
}

/** 2F 賭場：紅色壁紙、金色燈飾、拉霸機、牌桌。 */
function casino(ctx: CanvasRenderingContext2D, camX: number): void {
  ctx.fillStyle = '#6b1420'
  ctx.fillRect(0, 0, VIEW_W, GROUND_Y)
  repeat(camX * 0.5, 24, 1, (x) => {
    ctx.fillStyle = '#5a101a'
    ctx.fillRect(x, 24, 12, GROUND_Y - 24)
  })
  ctx.fillStyle = '#1a0a0c'
  ctx.fillRect(0, 0, VIEW_W, 24)
  repeat(camX, 90, 1, (x, wx) => {
    const on = Math.floor(wx / 90) % 2 === 0
    ctx.fillStyle = on ? '#ffd75e' : '#c99a2e'
    for (let i = 0; i < 5; i++) ctx.fillRect(x + 20 + i * 10, 26, 4, 4)
  })
  // 拉霸機（視差 0.8）
  repeat(camX, 200, 0.8, (x) => {
    ctx.fillStyle = '#2b2b33'
    ctx.fillRect(x + 20, 120, 34, 80)
    ctx.fillStyle = '#c9a227'
    ctx.fillRect(x + 20, 116, 34, 6)
    ctx.fillStyle = '#e8e2c8'
    ctx.fillRect(x + 25, 135, 24, 14)
    ctx.fillStyle = '#c0182c'
    ctx.fillRect(x + 28, 139, 4, 6)
    ctx.fillRect(x + 35, 139, 4, 6)
    ctx.fillRect(x + 42, 139, 4, 6)
    ctx.fillStyle = '#888'
    ctx.fillRect(x + 56, 130, 2, 20)
    ctx.fillStyle = '#e33'
    ctx.fillRect(x + 55, 126, 4, 4)
  })
  // 牌桌
  repeat(camX, 320, 1, (x) => {
    ctx.fillStyle = '#0f5a2e'
    ctx.fillRect(x + 140, GROUND_Y - 26, 90, 8)
    ctx.fillStyle = '#4a2a14'
    ctx.fillRect(x + 140, GROUND_Y - 18, 90, 3)
    ctx.fillRect(x + 150, GROUND_Y - 15, 4, 15)
    ctx.fillRect(x + 216, GROUND_Y - 15, 4, 15)
    ctx.fillStyle = '#eee'
    ctx.fillRect(x + 170, GROUND_Y - 28, 5, 2)
    ctx.fillRect(x + 185, GROUND_Y - 28, 5, 2)
  })
  floorTiles(ctx, camX, '#5a1c22', '#2a0c10', '#4c171c')
}

/** 3F 頂樓：深色木牆、大片城市夜景窗。 */
function office(ctx: CanvasRenderingContext2D, camX: number): void {
  ctx.fillStyle = '#6a5440'
  ctx.fillRect(0, 0, VIEW_W, GROUND_Y)
  repeat(camX, 260, 0.6, (x, wx) => {
    cityWindow(ctx, x + 20, wx, 40, 200, 140)
    ctx.fillStyle = '#16110c'
    ctx.fillRect(x + 17, 37, 206, 3)
    ctx.fillRect(x + 17, 180, 206, 3)
    ctx.fillRect(x + 118, 40, 3, 140)
  })
  ctx.fillStyle = '#120d09'
  ctx.fillRect(0, 0, VIEW_W, 24)
  repeat(camX, 300, 1, (x) => {
    ctx.fillStyle = '#7d6449'
    ctx.fillRect(x, 24, 16, GROUND_Y - 24)
  })
  ctx.fillStyle = '#8f765c'
  ctx.fillRect(0, GROUND_Y - 24, VIEW_W, 24)
  floorTiles(ctx, camX, '#5e4a38', '#2a1f15', '#544232')
}

/** 樓層終點往上的樓梯與 UP 標示。 */
function stairs(ctx: CanvasRenderingContext2D, camX: number, stairsX: number): void {
  const x = stairsX - camX - 30
  if (x > VIEW_W || x < -100) return
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(x, 40, 70, GROUND_Y - 40)
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#8a8a8a' : '#a0a0a0'
    ctx.fillRect(x + i * 8, GROUND_Y - (i + 1) * 20, 70 - i * 8, 6)
  }
  ctx.fillStyle = '#1f8a3a'
  ctx.fillRect(x + 14, 46, 42, 14)
  ctx.fillStyle = '#fff'
  ctx.font = '8px "Press Start 2P", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('UP', x + 35, 49)
}

export function drawBackground(ctx: CanvasRenderingContext2D, theme: Theme, camX: number, stairsX: number | null): void {
  if (theme === 'casino') casino(ctx, camX)
  else if (theme === 'office') office(ctx, camX)
  else lobby(ctx, camX)
  if (stairsX !== null) stairs(ctx, camX, stairsX)
}

export function drawLobby(ctx: CanvasRenderingContext2D, camX: number): void {
  lobby(ctx, camX)
}
