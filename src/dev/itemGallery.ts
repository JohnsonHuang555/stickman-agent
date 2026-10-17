import { GROUND_Y } from '../game/constants'
import { drawItemFlying, drawItemHeld, drawItemOnGround } from '../game/items/itemArt'
import { ITEM_TYPES, type ItemTypeId } from '../game/items/itemTypes'
import { Crate } from '../game/level/crate'
import { drawLobby } from '../game/render/background'
import { drawStickman, frontHand, type Pose } from '../game/stickman/pose'
import { ATTACK_POSES, HOLD_ARMS, POSES } from '../game/stickman/poses'

/** 開發用：在 ?items 頁面列出每件物件拿在手上、揮擊、放在地上、飛行中的樣子。 */
export function drawItemGallery(ctx: CanvasRenderingContext2D): void {
  drawLobby(ctx, 0)
  const types = Object.keys(ITEM_TYPES) as ItemTypeId[]
  const palette = { body: '#111111', back: '#4a4a4a' }
  types.forEach((type, i) => {
    const x = 20 + i * 38
    const category = ITEM_TYPES[type].category
    const holdPose: Pose =
      category === 'throwable'
        ? { ...POSES.idleA, ...HOLD_ARMS.carry }
        : category === 'firearm'
          ? { ...POSES.idleA, ...HOLD_ARMS.gun }
          : POSES.idleA
    const rows: [Pose, number][] = [
      [holdPose, GROUND_Y - 130],
      [category === 'firearm' ? ATTACK_POSES.aim[0] : category === 'throwable' ? ATTACK_POSES.throw[0] : ATTACK_POSES.swing[0], GROUND_Y - 75],
      [category === 'firearm' ? ATTACK_POSES.aim[1] : category === 'throwable' ? ATTACK_POSES.throw[1] : ATTACK_POSES.swing[1], GROUND_Y - 20],
    ]
    for (const [pose, footY] of rows) {
      drawStickman(ctx, pose, x, footY, 1, palette)
      drawItemHeld(ctx, type, frontHand(pose, x, footY, 1))
    }
    drawItemOnGround(ctx, type, x + 18, 0)
    drawItemFlying(ctx, type, x, 40, i * 0.6)
    ctx.font = '6px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#000'
    ctx.fillText(type, x, 30)
  })
  new Crate(450).draw(ctx, 0)
  const damaged = new Crate(420)
  damaged.hp = 1
  damaged.draw(ctx, 0)
}
