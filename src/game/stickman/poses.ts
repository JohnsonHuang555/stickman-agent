import { Clip, still } from './clip'
import { BODY, type Limb, type Pose } from './pose'

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

/*
 * 走路：不用關鍵影格，而是先決定腳踩在哪裡，再用反向運動學算出大腿與小腿的角度。
 * - 踩地的腳相對身體等速往後移，速度剛好等於前進速度 → 在地上完全不滑
 * - 抬起的腳畫一個小弧線往前跨
 * - 手維持護架，只跟著步伐小幅晃動
 * 動畫依實際走過的距離播放，走得慢的敵人腳步也跟著變慢。
 */
/** 一個循環（兩步）前進的距離。 */
export const WALK_CYCLE_DISTANCE = 44
/** 腳離骨盆最遠的水平距離（一步 22px）。 */
const STEP_HALF = WALK_CYCLE_DISTANCE / 4
/** 支撐腳伸到腿長的這個比例：經過身體正下方時腿幾乎打直，骨盆因此自然上下起伏（太直的話另一隻腳得彎很多才離得了地）。 */
const STANCE_REACH = 0.97
/** 抬腳離地的高度：剛好擦過地面，膝蓋不會抬太高。 */
/** 抬腳離地的高度：剛好擦過地面，膝蓋只比站姿高一點，不會抬太高。 */
const SWING_LIFT = 2
/** 走路時護架跟著步伐晃動的角度。 */
const GUARD_SWAY = 6

/** 兩段式腿的反向運動學：骨盆到腳的位置 (x 朝前, y 朝下) → [大腿, 小腿] 角度，膝蓋往前彎。 */
function legIK(fx: number, fy: number): Limb {
  const l1 = BODY.thigh
  const l2 = BODY.shin
  const d = Math.min(Math.hypot(fx, fy), l1 + l2 - 0.01)
  const base = Math.atan2(fx, fy)
  const atHip = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))
  const atFoot = Math.acos((l2 * l2 + d * d - l1 * l1) / (2 * l2 * d))
  const deg = 180 / Math.PI
  return [(base + atHip) * deg, (base - atFoot) * deg]
}

/** 一隻腳在一個循環 phase（0..1）的水平位置與抬高量：前半段踩地往後移，後半段抬起往前跨。 */
function footAt(phase: number): { x: number; lift: number } {
  if (phase < 0.5) return { x: STEP_HALF - 4 * STEP_HALF * phase, lift: 0 }
  const t = (phase - 0.5) / 0.5
  return { x: -STEP_HALF + 2 * STEP_HALF * t, lift: SWING_LIFT * Math.sin(Math.PI * t) }
}

/** 走過 stride px 時的走路姿勢。 */
export function walkPose(stride: number): Pose {
  const phase = (((stride / WALK_CYCLE_DISTANCE) % 1) + 1) % 1
  const front = footAt(phase)
  const back = footAt((phase + 0.5) % 1)
  // 骨盆高度由支撐腳決定：支撐腳保持接近打直
  const stance = front.lift === 0 ? front : back
  const reach = (BODY.thigh + BODY.shin) * STANCE_REACH
  const hip = Math.sqrt(Math.max(0, reach * reach - stance.x * stance.x))
  // 手維持護架（和站姿一樣），只跟著步伐小幅晃動，不放下來
  const sway = Math.cos(phase * Math.PI * 2) * GUARD_SWAY
  const armF: Limb = [GUARD_F[0] - sway, GUARD_F[1] - sway]
  const armB: Limb = [GUARD_B[0] + sway, GUARD_B[1] + sway]
  return P(8, armF, armB, legIK(front.x, hip - front.lift), legIK(back.x, hip - back.lift))
}

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

/**
 * 空中動作：預備後保持出手姿勢直到落地。
 * 出手那一格的長度要和補間幀數相同，播完時才會完全到位
 * （之前是 1 幀配 2 幀補間，結果永遠卡在補間 75% 的半成品姿勢）。
 */
export function aerialClip([windup, strike]: readonly Pose[], windupFrames: number): Clip {
  const strikeBlend = 2
  return new Clip([
    { pose: windup, dur: windupFrames, blend: 2 },
    { pose: strike, dur: strikeBlend, blend: strikeBlend },
  ])
}

/** 飛踢：[收腳預備, 出腳]。標題畫面（封面）也用這個姿勢。 */
const FLYING_KICK = [
  P(0, [60, 140], [-30, 0], [60, -20], [-10, -60]),
  P(-10, [-40, -10], [-60, -30], [75, 75], [20, -60]),
] as const

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
  /** 空中踢與飛踢共用封面上的飛踢姿勢（前腳斜往前下伸直、後腳收起、雙手往後）；兩者只差在會不會往前衝。 */
  airKick: FLYING_KICK,
  flyingKick: FLYING_KICK,
  diveSmash: [P(-5, [170, -160], [160, -170], [40, -10], [-10, -40]), P(35, [70, 80], [60, 75], [30, -10], [-20, -40])],
  dashPunch: [P(20, [30, 160], [-20, 40], [40, 0], [-30, -40]), P(28, [90, 90], [-50, -10], [50, 10], [-45, -60])],
  /** 掃腿：雙手撐地、後腳跪地，前腳貼地橫掃。 */
  sweep: [P(25, [20, 30], [30, 40], [60, -20], [10, -80]), P(30, [15, 25], [30, 40], [96, 92], [10, -80])],
  /** 蹲拳：腿完全維持蹲姿，只有前手出拳、後手護下巴。 */
  crouchPunch: [
    P(20, [30, 150], [25, 155], POSES.crouch.legF, POSES.crouch.legB),
    P(26, [88, 92], [25, 155], POSES.crouch.legF, POSES.crouch.legB),
  ],
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
