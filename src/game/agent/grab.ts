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
  /**
   * 大風車：頭槌撞暈（headbuttAt）→ 對方往後倒、頭著地，特務抓起雙腳（fallFrom～spinFrom）
   * → 從腰部的高度開始轉，越轉越快（spinFrom～releaseAt）→ 依慣性甩出去。
   */
  swing: {
    length: 68,
    headbuttAt: 5,
    fallFrom: 9,
    /** 往後倒到平躺的那一幀；之後特務才把雙腳抓起來。 */
    landAt: 14,
    spinFrom: 18,
    releaseAt: 58,
    turns: 2,
    sweepFrom: 22,
    /** 轉到最快時身體比水平再往上翹的角度（弧度）；一開始頭拖在地上。 */
    riseAngle: 0.25,
    /** 甩出去時往上飛的速度。 */
    releaseLift: 4.5,
  },
} as const

export type GrabMove = 'hold' | 'knee' | 'throw' | 'suplex' | 'swing'

const spec = (s: Omit<HitSpec, 'from' | 'to' | 'box'>): HitSpec => ({ from: 0, to: 0, box: { forward: 0, up: 0, w: 1, h: 1 }, ...s })

export const GRAB_HITS = {
  /** 大風車前的頭槌：不會撞倒，對方被撞暈後被抓住腳。 */
  headbutt: spec({ damage: 5, hitstun: 16, knockback: 0 }),
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
const SW = GRAB.swing

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
  // 頭槌 → 彎身抓住雙腳（手在腰部）→ 越轉越快手被甩得往外抬 → 甩出去後站回來
  swing: new Clip([
    { pose: clinch, dur: 2 },
    { pose: ATTACK_POSES.headbutt[0], dur: SW.headbuttAt - 2, blend: 3 },
    { pose: ATTACK_POSES.headbutt[1], dur: SW.fallFrom - SW.headbuttAt + 1, blend: 2 },
    { pose: swingLow, dur: SW.spinFrom - SW.fallFrom - 1, blend: SW.spinFrom - SW.fallFrom - 1 },
    { pose: swingHigh, dur: SW.releaseAt - SW.spinFrom, blend: SW.releaseAt - SW.spinFrom },
    { pose: POSES.idleA, dur: SW.length - SW.releaseAt, blend: 8 },
  ]),
}

/** 大風車第 frame 幀轉到的角度（弧度）：從 spinFrom 開始轉，越轉越快。 */
export function swingAngle(frame: number): number {
  const t = Math.min(1, Math.max(0, (frame - GRAB.swing.spinFrom) / (GRAB.swing.releaseAt - GRAB.swing.spinFrom)))
  return GRAB.swing.turns * Math.PI * 2 * t ** 1.5
}
