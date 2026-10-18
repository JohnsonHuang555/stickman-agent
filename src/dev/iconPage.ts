import { drawStickman } from '../game/stickman/pose'
import { ATTACK_POSES } from '../game/stickman/poses'

/** 開發用：?icon=<尺寸> 畫出主畫面圖示（截圖存成 public/icons 的 PNG）。 */
export function drawIconPage(size: number): void {
  document.body.innerHTML = ''
  document.body.style.cssText = 'margin:0;background:#0b0b10'
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.style.cssText = `position:fixed;left:0;top:0;transform:none;width:${size}px;height:${size}px`
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')!
  const s = size / 64
  // 金黃底、深色圓角內框，中間是封面上的飛踢火柴人
  ctx.fillStyle = '#f5c518'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#15151c'
  const pad = 6 * s
  const r = 10 * s
  ctx.beginPath()
  ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, r)
  ctx.fill()
  ctx.save()
  ctx.scale(s, s)
  drawStickman(ctx, ATTACK_POSES.flyingKick[1], 28, 50, 1, { body: '#f5c518', back: '#b8930f' }, 0.95)
  ctx.restore()
}
