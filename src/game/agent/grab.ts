import type { HitSpec } from '../combat/types'
import { Clip } from '../stickman/clip'
import { ATTACK_POSES } from '../stickman/poses'

/**
 * 抓技（空手、腳邊沒東西時，在雜兵面前按 C 抓住）：
 * - Z 膝撞，第三下撞倒
 * - X／→+X 往前摔，←+X（往後）過肩摔到身後
 * - 空白 大風車：原地轉兩圈掃倒旁邊的敵人，最後甩出去
 * 過肩摔與大風車途中無敵；什麼都不做 GRAB.hold 幀後對方會掙脫。
 */
export const GRAB = {
  /** 抓著不出招，對方多久後掙脫。 */
  hold: 120,
  /** 敵人被抓著時站在特務前方的距離。 */
  distance: 14,
  knee: { length: 16, hitAt: 5, max: 3 },
  throw: { length: 22, releaseAt: 8 },
  suplex: { length: 34, liftFrom: 3, slamAt: 19, radius: 18, height: 42 },
  swing: { length: 50, releaseAt: 40, turns: 2, radius: 24, height: 10, sweepFrom: 6 },
} as const

export type GrabMove = 'hold' | 'knee' | 'throw' | 'suplex' | 'swing'

const spec = (s: Omit<HitSpec, 'from' | 'to' | 'box'>): HitSpec => ({ from: 0, to: 0, box: { forward: 0, up: 0, w: 1, h: 1 }, ...s })

export const GRAB_HITS = {
  knee: spec({ damage: 6, hitstun: 16, knockback: 0 }),
  lastKnee: spec({ damage: 8, hitstun: 20, knockback: 2.4, knockdown: true, heavy: true }),
  throw: spec({ damage: 12, hitstun: 20, knockback: 5, knockdown: true, heavy: true }),
  suplex: spec({ damage: 16, hitstun: 24, knockback: 1.2, knockdown: true, heavy: true }),
  /** 大風車途中被掃到的其他敵人。 */
  swingSweep: spec({ damage: 10, hitstun: 20, knockback: 3, knockdown: true, heavy: true }),
  swingRelease: spec({ damage: 14, hitstun: 20, knockback: 5.5, knockdown: true, heavy: true }),
} as const

const [clinch] = ATTACK_POSES.clinch
const [giantSwing] = ATTACK_POSES.giantSwing

export const GRAB_CLIPS: Record<GrabMove, Clip> = {
  hold: new Clip([{ pose: clinch, dur: 1 }]),
  knee: new Clip([
    { pose: ATTACK_POSES.knee[0], dur: GRAB.knee.hitAt - 2, blend: 2 },
    { pose: ATTACK_POSES.knee[1], dur: 4, blend: 2 },
    { pose: clinch, dur: GRAB.knee.length - GRAB.knee.hitAt - 2, blend: 6 },
  ]),
  throw: new Clip([
    { pose: ATTACK_POSES.grabThrow[0], dur: GRAB.throw.releaseAt - 2, blend: 4 },
    { pose: ATTACK_POSES.grabThrow[1], dur: GRAB.throw.length - GRAB.throw.releaseAt + 2, blend: 2 },
  ]),
  suplex: new Clip([
    { pose: ATTACK_POSES.suplex[0], dur: 9, blend: 6 },
    { pose: ATTACK_POSES.suplex[1], dur: GRAB.suplex.length - 9, blend: GRAB.suplex.slamAt - 9 },
  ]),
  swing: new Clip([{ pose: giantSwing, dur: GRAB.swing.length, blend: 4 }]),
}

/** 大風車第 frame 幀轉到的角度（弧度）：越轉越快。 */
export function swingAngle(frame: number): number {
  const t = Math.min(1, frame / GRAB.swing.releaseAt)
  return GRAB.swing.turns * Math.PI * 2 * t ** 1.5
}
