import { Clip, still } from './clip'
import type { Limb, Pose } from './pose'

const P = (lean: number, armF: Limb, armB: Limb, legF: Limb, legB: Limb, lift = 0): Pose => ({
  lean,
  armF,
  armB,
  legF,
  legB,
  lift,
})

/** 共用姿勢。 */
export const POSES = {
  idleA: P(4, [30, 150], [10, 140], [14, 4], [-14, -4]),
  idleB: P(7, [36, 144], [16, 134], [15, 6], [-13, -2]),
  walk1: P(8, [40, 150], [0, 130], [28, 8], [-24, -40]),
  walk2: P(8, [30, 150], [10, 140], [2, -26], [6, 0]),
  walk3: P(8, [22, 145], [20, 150], [-24, -40], [28, 8]),
  walk4: P(8, [30, 150], [10, 140], [6, 0], [2, -26]),
  crouch: P(22, [40, 150], [25, 140], [80, -12], [8, -80]),
  jumpUp: P(10, [120, 160], [-30, -10], [70, -10], [-10, -60]),
  jumpFall: P(6, [80, 130], [-20, 10], [30, -10], [-15, -30]),
  land: P(20, [40, 150], [20, 140], [60, -15], [-5, -50]),
  hurt: P(-22, [-20, 40], [-40, 20], [10, 0], [-15, -5]),
  launched: P(-50, [-120, -90], [-150, -100], [60, 40], [30, 10]),
  lying: P(-90, [-100, -95], [-110, -100], [88, 90], [82, 92], 1),
  getup: P(30, [20, 10], [10, 0], [70, -20], [10, -80]),
  pickup: P(40, [40, 10], [30, 5], [80, -12], [8, -80]),
} as const

/** 持有物件時覆蓋手臂的姿勢。 */
export const HOLD_ARMS = {
  /** 雙手把投擲物舉過頭。 */
  carry: { armF: [172, 178], armB: [166, 176] },
  /** 槍口朝前下。 */
  gun: { armF: [62, 84], armB: [20, 140] },
} as const satisfies Record<string, Pick<Pose, 'armF' | 'armB'>>

export const CLIPS = {
  idle: new Clip(
    [
      { pose: POSES.idleA, dur: 30 },
      { pose: POSES.idleB, dur: 30 },
    ],
    true,
  ),
  walk: new Clip(
    [
      { pose: POSES.walk1, dur: 8 },
      { pose: POSES.walk2, dur: 8 },
      { pose: POSES.walk3, dur: 8 },
      { pose: POSES.walk4, dur: 8 },
    ],
    true,
  ),
  crouch: still(POSES.crouch),
  jumpUp: still(POSES.jumpUp),
  jumpFall: still(POSES.jumpFall),
  land: still(POSES.land),
  hurt: still(POSES.hurt),
  launched: still(POSES.launched),
  lying: still(POSES.lying),
  getup: still(POSES.getup),
  pickup: still(POSES.pickup),
} as const

/** 預備 → 出手 → 收招 的三段式動畫。 */
export function attackClip(
  [windup, strike]: readonly Pose[],
  windupFrames: number,
  strikeFrames: number,
  recoverFrames: number,
  recoverPose: Pose = POSES.idleA,
  /** 進入預備姿勢的補間幀數；敵人用較大的值讓起手更容易看出來。 */
  windupBlend = 2,
): Clip {
  return new Clip([
    { pose: windup, dur: windupFrames, blend: windupBlend },
    { pose: strike, dur: strikeFrames, blend: 2 },
    { pose: recoverPose, dur: recoverFrames },
  ])
}

/** 空中動作：預備後保持出手姿勢直到落地。 */
export function aerialClip([windup, strike]: readonly Pose[], windupFrames: number): Clip {
  return new Clip([
    { pose: windup, dur: windupFrames, blend: 2 },
    { pose: strike, dur: 1, blend: 2 },
  ])
}

/** 攻擊姿勢：[預備, 出手]。 */
export const ATTACK_POSES = {
  punch1: [P(6, [25, 160], [10, 140], [16, 4], [-16, -6]), P(14, [88, 90], [5, 140], [18, 4], [-18, -8])],
  punch2: [P(10, [20, 150], [40, 160], [18, 4], [-18, -8]), P(20, [30, 150], [88, 92], [20, 6], [-20, -10])],
  punch3: [P(25, [20, 60], [10, 140], [30, 0], [-15, -10]), P(-8, [150, 170], [0, 120], [10, 0], [-20, -10], 2)],
  kick: [P(-5, [40, 150], [-20, 130], [80, -10], [-5, 0]), P(-18, [50, 150], [-30, 120], [92, 92], [-8, -4])],
  flyingKick: [P(0, [60, 140], [-30, -10], [60, -20], [-10, -60]), P(-10, [-40, -20], [-60, -30], [70, 75], [20, -60])],
  diveSmash: [P(-5, [175, 175], [165, 170], [40, -10], [-10, -40]), P(35, [70, 40], [60, 30], [30, -10], [-20, -40])],
  dashPunch: [P(20, [30, 160], [-20, 120], [40, 0], [-30, -40]), P(28, [90, 90], [-50, -20], [50, 10], [-45, -60])],
  sweep: [P(25, [20, 10], [30, 10], [60, -20], [10, -80]), P(30, [15, 5], [30, 10], [96, 92], [10, -80])],
  spinA: [P(0, [100, 100], [-100, -100], [95, 95], [-60, -30], 10)],
  spinB: [P(0, [-100, -100], [100, 100], [-60, -30], [95, 95], 10)],
  /** 近戰武器由後上方揮到前下方。 */
  swing: [P(-8, [-150, -175], [10, 140], [20, 0], [-20, -10]), P(25, [80, 70], [20, 140], [30, 0], [-25, -15])],
  /** 舉槍瞄準 → 後座力。 */
  aim: [P(4, [88, 90], [20, 140], [18, 4], [-18, -8]), P(-4, [100, 110], [20, 140], [16, 4], [-20, -8])],
  /** 雙手由頭後方往前丟出。 */
  throw: [P(-15, [-160, -175], [-150, -170], [15, 0], [-25, -15]), P(25, [110, 120], [100, 115], [35, 5], [-30, -20])],
  /** 壯漢的雙手過頂重砸。 */
  heavySlam: [P(-15, [175, 160], [170, 150], [20, 0], [-20, -10]), P(40, [70, 30], [65, 25], [35, -5], [-25, -20])],
} as const
