import type { HitSpec } from '../combat/types'
import { Clip } from '../stickman/clip'
import { ATTACK_POSES, POSES } from '../stickman/poses'

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
  suplex: { length: 30, slamAt: 19 },
  /** 大風車：抓腳踝甩，被甩的人身體長度 bodyLength；前 liftFrames 幀從站著被拉成橫的。 */
  swing: {
    length: 50,
    releaseAt: 40,
    turns: 2,
    bodyLength: 40,
    liftFrames: 6,
    sweepFrom: 6,
    /** 轉到最快時身體比水平再往上翹的角度（弧度）；一開始頭拖在地上。 */
    riseAngle: 0.25,
    /** 甩出去時往上飛的速度。 */
    releaseLift: 4.5,
  },
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
const [swingLow, swingHigh] = ATTACK_POSES.giantSwing

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
  // 沉身 → 舉過頭 → 往後仰 → 摔下（第 slamAt 幀落地）→ 站回來
  suplex: new Clip([
    { pose: ATTACK_POSES.suplex[0], dur: 4, blend: 4 },
    { pose: ATTACK_POSES.suplex[1], dur: 6, blend: 6 },
    { pose: ATTACK_POSES.suplex[2], dur: 5, blend: 5 },
    { pose: ATTACK_POSES.suplex[3], dur: GRAB.suplex.slamAt - 15, blend: GRAB.suplex.slamAt - 15 },
    { pose: POSES.idleA, dur: GRAB.suplex.length - GRAB.suplex.slamAt, blend: 10 },
  ]),
  // 越轉越快，手也越抬越高，把對方從地上甩到空中
  swing: new Clip([
    { pose: swingLow, dur: GRAB.swing.liftFrames, blend: 4 },
    { pose: swingHigh, dur: GRAB.swing.length - GRAB.swing.liftFrames, blend: GRAB.swing.releaseAt - GRAB.swing.liftFrames },
  ]),
}

/** 大風車第 frame 幀轉到的角度（弧度）：越轉越快。 */
export function swingAngle(frame: number): number {
  const t = Math.min(1, frame / GRAB.swing.releaseAt)
  return GRAB.swing.turns * Math.PI * 2 * t ** 1.5
}
