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

/*
 * 姿勢設計規則（有自動測試檢查）：
 * - 膝蓋只往前彎：小腿角度 ≤ 大腿角度（小腿往後折）
 * - 手肘只往前上方彎：前臂角度 ≥ 上臂角度
 * - 走路時手和腳反向擺動；出拳時另一隻手護在下巴；踢腿時張手保持平衡
 */

/** 格鬥站姿的雙腳：前腳在前、後腳在後，兩膝微彎，兩隻腳都踩在地上。 */
const STANCE_F: Limb = [25, 10]
const STANCE_B: Limb = [-15, -28]
/** 護架：前手在臉前、後手護下巴。 */
const GUARD_F: Limb = [35, 150]
const GUARD_B: Limb = [15, 155]

/** 共用姿勢。 */
export const POSES = {
  idleA: P(8, GUARD_F, GUARD_B, STANCE_F, STANCE_B),
  idleB: P(10, [38, 148], [18, 152], [26, 10], [-14, -28]),
  // 跑步：手和腳反向擺動（前腳在前時前手在後），手肘彎約 90°
  walk1: P(12, [-35, 55], [40, 130], [35, 15], [-30, -60]),
  walk2: P(10, [0, 90], [5, 95], [5, -5], [35, -45]),
  walk3: P(12, [40, 130], [-35, 55], [-30, -60], [35, 15]),
  walk4: P(10, [5, 95], [0, 90], [35, -45], [5, -5]),
  crouch: P(20, [40, 150], [25, 155], [75, -15], [10, -80]),
  jumpUp: P(10, [130, 160], [-50, -10], [70, -10], [20, -50]),
  jumpFall: P(6, [80, 110], [-60, -30], [35, 15], [-10, -30]),
  land: P(25, [50, 100], [20, 90], [70, -15], [-10, -80]),
  hurt: P(-25, [-40, -10], [-70, -40], [20, 5], [-15, -30]),
  launched: P(-50, [-130, -100], [-160, -120], [60, 30], [30, 0]),
  lying: P(-90, [-100, -90], [-110, -95], [90, 85], [85, 80], 1),
  getup: P(30, [20, 40], [10, 30], [70, -20], [10, -80]),
  pickup: P(50, [30, 40], [20, 30], [70, -20], [10, -70]),
  /** 翻滾時縮成一團：膝蓋往前收、雙手往前抱住小腿（軀幹和大腿要分開，轉起來才不會像一根棍子）。 */
  tuck: P(30, [60, 110], [50, 100], [95, -60], [85, -70]),
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
  /** 前手刺拳：後手留在下巴，前腳稍往前踩。 */
  punch1: [P(6, [30, 150], GUARD_B, STANCE_F, STANCE_B), P(15, [88, 92], GUARD_B, [30, 12], [-20, -32])],
  /** 後手直拳：前手收回護臉，身體跟著轉過去。 */
  punch2: [P(10, [40, 140], [30, 160], STANCE_F, STANCE_B), P(22, [20, 150], [88, 92], [32, 12], [-25, -38])],
  /** 上勾拳：先沉下去，再整個人往上頂。 */
  punch3: [P(25, [20, 80], GUARD_B, [40, 0], [-20, -50]), P(-8, [150, 170], [10, 150], [15, 5], [-20, -30], 2)],
  /** 前踢：先收膝，再踢出；兩手張開保持平衡、支撐腳微彎。 */
  kick: [P(-5, [40, 140], [-30, 30], [80, -10], [-5, -15]), P(-25, [50, 120], [-50, -10], [95, 95], [-12, -22])],
  flyingKick: [P(0, [60, 140], [-30, 0], [60, -20], [-10, -60]), P(-10, [-40, -10], [-60, -30], [75, 75], [20, -60])],
  diveSmash: [P(-5, [170, -160], [160, -170], [40, -10], [-10, -40]), P(35, [70, 80], [60, 75], [30, -10], [-20, -40])],
  dashPunch: [P(20, [30, 160], [-20, 40], [40, 0], [-30, -40]), P(28, [90, 90], [-50, -10], [50, 10], [-45, -60])],
  /** 掃腿：雙手撐地、後腳跪地，前腳貼地橫掃。 */
  sweep: [P(25, [20, 30], [30, 40], [60, -20], [10, -80]), P(30, [15, 25], [30, 40], [96, 92], [10, -80])],
  /** 保命招的旋風腿：雙手張開，一腳橫踢、一腳往後收。 */
  spinA: [P(0, [100, 100], [-100, -100], [95, 95], [-60, -90], 10)],
  spinB: [P(0, [-100, -100], [100, 100], [-60, -90], [95, 95], 10)],
  /** 空中直拳（左右手交替）。 */
  airPunch1: [P(5, [40, 150], [10, 140], [60, -20], [-10, -60]), P(15, [92, 92], [10, 140], [55, -25], [-15, -60])],
  airPunch2: [P(5, [30, 150], [40, 160], [50, -30], [0, -50]), P(18, [20, 140], [95, 95], [45, -30], [-10, -55])],
  /** 空中下砸踢：腳往前下方踩。 */
  airSpike: [P(-10, [120, 160], [-40, -20], [100, 20], [-10, -60]), P(10, [140, 170], [-60, -30], [40, 40], [-20, -50])],
  /** 近戰武器：先舉到頭後方（武器朝後上），再揮到前方。 */
  swing: [P(-8, [-150, -120], GUARD_B, [20, 5], [-20, -35]), P(25, [75, 80], [20, 150], [30, 10], [-25, -40])],
  /** 舉槍瞄準 → 後座力。 */
  aim: [P(4, [88, 90], [20, 140], STANCE_F, STANCE_B), P(-4, [100, 110], [20, 140], [22, 8], [-18, -30])],
  /** 雙手由頭後方往前丟出。 */
  throw: [P(-15, [-160, -130], [-150, -120], [15, 0], [-25, -40]), P(25, [110, 120], [100, 115], [35, 5], [-30, -45])],
  /** 壯漢的雙手過頂重砸。 */
  heavySlam: [P(-15, [175, -160], [170, -165], [20, 0], [-20, -35]), P(40, [70, 80], [65, 75], [35, -5], [-25, -40])],
} as const
