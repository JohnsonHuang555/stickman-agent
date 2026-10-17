import { VIEW_H, VIEW_W } from '../constants'
import { ITEM_TYPES } from '../items/itemTypes'
import type { LifePool } from '../life/lifePool'
import type { World } from '../world'

/** 命條顏色，索引 0 為最後一條。 */
export const BAR_COLORS = ['#e8322b', '#f5c518', '#3cc35a'] as const

const FONT = '"Press Start 2P", monospace'

export function drawLifeBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, life: LifePool) {
  const remaining = life.barsRemaining
  ctx.fillStyle = '#000'
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2)
  ctx.fillStyle = remaining >= 2 ? BAR_COLORS[remaining - 2] ?? BAR_COLORS[0] : '#3a0d0d'
  ctx.fillRect(x, y, w, h)
  if (remaining >= 1) {
    ctx.fillStyle = BAR_COLORS[remaining - 1] ?? BAR_COLORS[BAR_COLORS.length - 1]
    ctx.fillRect(x, y, Math.round(w * life.currentBarFill), h)
  }
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size = 8, align: CanvasTextAlign = 'left') {
  ctx.font = `${size}px ${FONT}`
  ctx.textAlign = align
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#000'
  ctx.fillText(s, x + 1, y + 1)
  ctx.fillStyle = '#fff'
  ctx.fillText(s, x, y)
}

export function drawHud(ctx: CanvasRenderingContext2D, world: World): void {
  text(ctx, `SCORE ${String(world.score).padStart(6, '0')}`, 8, 8)
  text(ctx, 'AGENT', 8, 20, 6)
  drawLifeBar(ctx, 44, 20, 110, 6, world.agent.life)
  const held = world.agent.held
  if (held) {
    const category = ITEM_TYPES[held.type].category
    const suffix = category === 'firearm' ? ` x${held.uses}` : category === 'melee' ? ` ${'|'.repeat(held.uses)}` : ''
    text(ctx, ITEM_TYPES[held.type].label + suffix, 44, 30, 6)
  }

  const focus = world.focus
  if (focus && focus.until > world.realFrame && !focus.target.removed) {
    text(ctx, focus.target.label, VIEW_W - 8, 8, 6, 'right')
    drawLifeBar(ctx, VIEW_W - 118, 18, 110, 5, focus.target.life)
  }

  ctx.font = '7px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillText('←→ 移動  ↓ 蹲  Z 拳/用  X 踢  空白 跳  C 撿/丟  Z+X 保命招  →→Z 衝刺拳  P 暫停  ` 判定框', VIEW_W / 2, VIEW_H - 3)

  if (world.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    text(ctx, 'GAME OVER', VIEW_W / 2, VIEW_H / 2 - 20, 16, 'center')
    text(ctx, `SCORE ${String(world.score).padStart(6, '0')}`, VIEW_W / 2, VIEW_H / 2 + 6, 8, 'center')
    if (Math.floor(world.realFrame / 30) % 2 === 0) text(ctx, 'PRESS Z', VIEW_W / 2, VIEW_H / 2 + 26, 8, 'center')
  }

  if (world.paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    text(ctx, 'PAUSE', VIEW_W / 2, VIEW_H / 2 - 8, 16, 'center')
  }
}
