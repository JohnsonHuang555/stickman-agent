import type { ActionDef } from '../combat/types'
import { ATTACK_POSES, attackClip } from '../stickman/poses'

export interface EnemyMove extends ActionDef {
  /** 與特務距離小於此值才會出這招。 */
  range: number
}

/** 敵人的招式起手都比特務長，讓玩家看得出來、來得及反應。 */
export const ENEMY_MOVES = {
  jab: {
    clip: attackClip(ATTACK_POSES.punch1, 12, 5, 12, undefined, 8),
    length: 29,
    range: 22,
    // up 27 起算，蹲下（受擊框高 26）可以躲過
    hit: { from: 12, to: 14, box: { forward: 2, up: 27, w: 16, h: 8 }, damage: 8, hitstun: 18, knockback: 1.5 },
  },
  kick: {
    clip: attackClip(ATTACK_POSES.kick, 14, 6, 12, undefined, 8),
    length: 32,
    range: 26,
    hit: { from: 14, to: 17, box: { forward: 4, up: 11, w: 18, h: 10 }, damage: 10, hitstun: 20, knockback: 2.2 },
  },
  thrust: {
    clip: attackClip(ATTACK_POSES.dashPunch, 16, 10, 14, undefined, 10),
    length: 40,
    range: 60,
    hit: { from: 16, to: 26, box: { forward: 2, up: 24, w: 16, h: 8 }, damage: 10, hitstun: 18, knockback: 2 },
    tick: (f, frame) => {
      f.vx = frame >= 16 && frame <= 26 ? f.facing * 3.2 : 0
    },
  },
  slam: {
    clip: attackClip(ATTACK_POSES.heavySlam, 22, 6, 18, undefined, 14),
    length: 46,
    range: 26,
    armor: true,
    hit: {
      from: 22,
      to: 25,
      box: { forward: 0, up: 8, w: 24, h: 28 },
      damage: 18,
      hitstun: 24,
      knockback: 3,
      knockdown: true,
      heavy: true,
    },
  },
} satisfies Record<string, EnemyMove>

export type EnemyMoveId = keyof typeof ENEMY_MOVES
