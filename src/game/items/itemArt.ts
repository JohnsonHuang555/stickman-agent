import { GROUND_Y } from '../constants'
import type { ItemTypeId } from './itemTypes'

const BLOCKS: ReadonlySet<ItemTypeId> = new Set(['chair', 'cabinet', 'desk', 'ammo'])
/** 長條物件的長度，用來在地上置中擺放。 */
const LENGTH: Partial<Record<ItemTypeId, number>> = { bat: 21, crowbar: 20, knife: 11, katana: 32, pistol: 9, shotgun: 24 }

/** 以握把為原點、物件朝 +x 方向畫長條物件。 */
function drawLong(ctx: CanvasRenderingContext2D, type: ItemTypeId): void {
  const line = (color: string, width: number, pts: [number, number][]) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(...pts[0])
    for (const p of pts.slice(1)) ctx.lineTo(...p)
    ctx.stroke()
  }
  ctx.lineCap = 'round'
  switch (type) {
    case 'bat':
      line('#9b6b3c', 2, [[-2, 0], [8, 0]])
      line('#9b6b3c', 3.5, [[8, 0], [19, 0]])
      break
    case 'crowbar':
      line('#4b4f55', 1.8, [[0, 0], [18, 0], [20, -2], [19, -4]])
      break
    case 'knife':
      line('#222', 2, [[-1, 0], [3, 0]])
      line('#d8d8d8', 1.6, [[3, 0], [10, 0]])
      break
    case 'katana':
      line('#222', 2, [[-4, 0], [3, 0]])
      ctx.fillStyle = '#c9a227'
      ctx.fillRect(3, -2, 1.5, 4)
      line('#e6e6e6', 1.5, [[4.5, 0], [28, 0]])
      break
    case 'pistol':
      ctx.fillStyle = '#2b2b2b'
      ctx.fillRect(-1, -2, 9, 3.2)
      ctx.fillRect(-1, 0, 3, 4)
      break
    case 'shotgun':
      ctx.fillStyle = '#7a4f2a'
      ctx.fillRect(-7, -1.5, 7, 3.5)
      ctx.fillStyle = '#2b2b2b'
      ctx.fillRect(0, -1.5, 17, 2.6)
      break
    default:
      break
  }
}

/** 以中心為原點畫方塊類物件。 */
function drawBlock(ctx: CanvasRenderingContext2D, type: ItemTypeId): void {
  switch (type) {
    case 'chair':
      ctx.fillStyle = '#9b6b3c'
      ctx.fillRect(-7, 0, 14, 2)
      ctx.fillRect(5, -10, 2, 10)
      ctx.fillRect(-6, 2, 1.5, 7)
      ctx.fillRect(4.5, 2, 1.5, 7)
      break
    case 'cabinet':
      ctx.fillStyle = '#7d8590'
      ctx.fillRect(-9, -12, 18, 24)
      ctx.fillStyle = '#5c636c'
      ctx.fillRect(-9, -4, 18, 1)
      ctx.fillRect(-9, 4, 18, 1)
      ctx.fillStyle = '#dddddd'
      ctx.fillRect(-2, -9, 4, 1)
      ctx.fillRect(-2, -1, 4, 1)
      ctx.fillRect(-2, 7, 4, 1)
      break
    case 'desk':
      ctx.fillStyle = '#5a3a1e'
      ctx.fillRect(-15, -7, 30, 4)
      ctx.fillRect(-14, -3, 3, 10)
      ctx.fillRect(11, -3, 3, 10)
      ctx.fillStyle = '#7a5230'
      ctx.fillRect(-9, -3, 12, 7)
      ctx.fillStyle = '#c9a227'
      ctx.fillRect(-4, 0, 2, 1)
      break
    case 'ammo':
      ctx.fillStyle = '#6b7a3a'
      ctx.fillRect(-4, -3, 8, 6)
      ctx.fillStyle = '#e8d27a'
      ctx.fillRect(-2, -1.5, 4, 1)
      break
    default:
      break
  }
}

/** 拿在手上：長條物件沿前臂方向；方塊類舉在手的上方。 */
export function drawItemHeld(
  ctx: CanvasRenderingContext2D,
  type: ItemTypeId,
  hand: { x: number; y: number; dx: number; dy: number },
): void {
  ctx.save()
  if (BLOCKS.has(type)) {
    ctx.translate(hand.x, hand.y - 10)
    drawBlock(ctx, type)
  } else {
    ctx.translate(hand.x, hand.y)
    ctx.rotate(Math.atan2(hand.dy, hand.dx))
    if (hand.dx < 0) ctx.scale(1, -1)
    drawLong(ctx, type)
  }
  ctx.restore()
}

/** 放在地上：長條物件平躺，方塊類站立。 */
export function drawItemOnGround(ctx: CanvasRenderingContext2D, type: ItemTypeId, x: number, liftY: number): void {
  ctx.save()
  if (BLOCKS.has(type)) {
    const half = type === 'cabinet' ? 12 : type === 'chair' ? 9 : 3
    ctx.translate(x, GROUND_Y - half - liftY)
    drawBlock(ctx, type)
  } else {
    ctx.translate(x - (LENGTH[type] ?? 10) / 2, GROUND_Y - 2 - liftY)
    drawLong(ctx, type)
  }
  ctx.restore()
}

/** 飛行中：繞中心旋轉。 */
export function drawItemFlying(ctx: CanvasRenderingContext2D, type: ItemTypeId, x: number, y: number, angle: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  if (BLOCKS.has(type)) drawBlock(ctx, type)
  else {
    ctx.translate(-(LENGTH[type] ?? 10) / 2, 0)
    drawLong(ctx, type)
  }
  ctx.restore()
}
