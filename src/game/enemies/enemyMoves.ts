import type { ActionDef, HitSpec } from '../combat/types'
import { ATTACK_POSES, POSES, attackClip } from '../stickman/poses'

/** 雜兵抓住特務後：每隔幾幀膝撞一次、撞幾下後摔出去；特務狂按幾下可以掙脫。 */
export const ENEMY_HOLD = { kneeEvery: 28, knees: 3, throwAt: 100, escapePresses: 10, kneeShow: 8 } as const
const holdSpec = (damage: number, extra: Partial<HitSpec> = {}): HitSpec => ({
  from: 0,
  to: 0,
  box: { forward: 0, up: 0, w: 1, h: 1 },
  damage,
  hitstun: 16,
  knockback: 0,
  ...extra,
})
export const ENEMY_HOLD_HITS = {
  knee: holdSpec(6, { holdHit: true }),
  throw: holdSpec(10, { hitstun: 20, knockback: 3, knockdown: true, heavy: true }),
} as const

/** 特務被踢到下體時摀著彎腰的幀數（比雜兵短，約 0.75 秒）。 */
export const AGENT_GROIN_STUN = 45

export interface EnemyMove extends ActionDef {
  /** 與特務距離小於此值才會出這招。 */
  range: number
}

/** 敵人的招式起手都比特務長，讓玩家看得出來、來得及反應。 */
export const ENEMY_MOVES = {
  jab: {
    clip: attackClip(ATTACK_POSES.punch1, 12, 5, 12, undefined, 8),
    length: 29,
    range: 24,
    // up 33 起算，蹲下（受擊框高 30）可以躲過
    hit: { from: 12, to: 14, box: { forward: 2, up: 33, w: 20, h: 9 }, damage: 8, hitstun: 18, knockback: 1.5 },
  },
  kick: {
    clip: attackClip(ATTACK_POSES.kick, 14, 6, 12, undefined, 8),
    length: 32,
    range: 28,
    hit: { from: 14, to: 17, box: { forward: 4, up: 12, w: 22, h: 12 }, damage: 10, hitstun: 20, knockback: 2.2 },
  },
  /** 往前上方踢特務的下體：起手和踢腿一樣長，看得出來；蹲下躲不掉，要跳開或先打斷。 */
  groinKick: {
    clip: attackClip(ATTACK_POSES.groinKick, 14, 4, 12, undefined, 8),
    length: 30,
    range: 26,
    hit: { from: 14, to: 17, box: { forward: 2, up: 14, w: 24, h: 12 }, damage: 5, hitstun: AGENT_GROIN_STUN, knockback: 0.3, groin: true },
  },
  /** 壯漢伸手抓特務（起手 12 幀看得到）：抓到就膝撞、最後摔出去。 */
  grab: {
    clip: attackClip([POSES.idleA, ATTACK_POSES.clinch[0]], 12, 4, 14),
    length: 30,
    range: 22,
    hit: { from: 12, to: 15, box: { forward: 0, up: 10, w: 22, h: 32 }, damage: 0, hitstun: 0, knockback: 0, grab: true },
  },
  thrust: {
    clip: attackClip(ATTACK_POSES.dashPunch, 16, 10, 14, undefined, 10),
    length: 40,
    range: 60,
    hit: { from: 16, to: 26, box: { forward: 2, up: 28, w: 18, h: 9 }, damage: 10, hitstun: 18, knockback: 2 },
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
      box: { forward: 0, up: 8, w: 26, h: 34 },
      damage: 18,
      hitstun: 24,
      knockback: 3,
      knockdown: true,
      heavy: true,
    },
  },
} satisfies Record<string, EnemyMove>

export type EnemyMoveId = keyof typeof ENEMY_MOVES
