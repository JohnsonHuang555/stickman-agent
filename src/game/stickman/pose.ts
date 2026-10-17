/**
 * 火柴人骨架。所有肢段角度皆為「絕對角度」（度），以角色面向為準：
 * 0 = 朝下、90 = 朝前、180 = 朝上、-90 = 朝後。
 */
export type Limb = readonly [upper: number, lower: number]

export interface Pose {
  /** 軀幹前傾角，0 = 直立，正值前傾。 */
  lean: number
  armF: Limb
  armB: Limb
  legF: Limb
  legB: Limb
  /** 額外抬高骨盆（px），用於旋風腿等離地姿勢。 */
  lift: number
}

/** 約 5.5 頭身、身高約 48px：頭小、手腳長，翻滾與踢腿比較有張力。 */
export const BODY = {
  headR: 4.5,
  neck: 1.5,
  torso: 14.5,
  upperArm: 9.5,
  foreArm: 9.5,
  thigh: 11.5,
  shin: 11.5,
} as const

/** 站立時的身高（受擊框用）。 */
export const STAND_HEIGHT = 46
/** 蹲下時的高度；高處攻擊（敵人刺拳、高的子彈）要高於這個值才躲得掉。 */
export const CROUCH_HEIGHT = 30

type Vec = readonly [x: number, y: number]

interface Skeleton {
  hip: Vec
  neck: Vec
  head: Vec
  elbowF: Vec
  handF: Vec
  elbowB: Vec
  handB: Vec
  kneeF: Vec
  footF: Vec
  kneeB: Vec
  footB: Vec
}

/** 角度 → 單位向量（x 朝前、y 朝下）。 */
function dir(deg: number): Vec {
  const r = (deg * Math.PI) / 180
  return [Math.sin(r), Math.cos(r)]
}

function step(from: Vec, deg: number, len: number): Vec {
  const [dx, dy] = dir(deg)
  return [from[0] + dx * len, from[1] + dy * len]
}

/** 以骨盆為原點的正向運動學。 */
function solve(p: Pose): Skeleton {
  const hip: Vec = [0, 0]
  const spine = 180 - p.lean
  const neck = step(hip, spine, BODY.torso)
  const head = step(neck, spine, BODY.neck + BODY.headR)
  const elbowF = step(neck, p.armF[0], BODY.upperArm)
  const elbowB = step(neck, p.armB[0], BODY.upperArm)
  const kneeF = step(hip, p.legF[0], BODY.thigh)
  const kneeB = step(hip, p.legB[0], BODY.thigh)
  return {
    hip,
    neck,
    head,
    elbowF,
    handF: step(elbowF, p.armF[1], BODY.foreArm),
    elbowB,
    handB: step(elbowB, p.armB[1], BODY.foreArm),
    kneeF,
    footF: step(kneeF, p.legF[1], BODY.shin),
    kneeB,
    footB: step(kneeB, p.legB[1], BODY.shin),
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/**
 * 角度走最短的那條弧。例如揮棒從後上方（-150°）到前方（80°），
 * 會經過頭頂（±180°），而不是從身體下方繞過去。
 */
const lerpAngle = (a: number, b: number, t: number) => {
  const diff = ((((b - a) % 360) + 540) % 360) - 180
  return a + diff * t
}
const lerpLimb = (a: Limb, b: Limb, t: number): Limb => [lerpAngle(a[0], b[0], t), lerpAngle(a[1], b[1], t)]

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    lean: lerp(a.lean, b.lean, t),
    armF: lerpLimb(a.armF, b.armF, t),
    armB: lerpLimb(a.armB, b.armB, t),
    legF: lerpLimb(a.legF, b.legF, t),
    legB: lerpLimb(a.legB, b.legB, t),
    lift: lerp(a.lift, b.lift, t),
  }
}

function hipHeightOf(s: Skeleton, pose: Pose): number {
  return Math.max(s.footF[1], s.footB[1], 0) + pose.lift
}

export interface Anchor {
  x: number
  y: number
  /** 方向（螢幕向量）：手為前臂方向，頭為脊椎方向。 */
  dx: number
  dy: number
}

function anchor(pose: Pose, x: number, footY: number, facing: 1 | -1, scale: number, part: 'handF' | 'handB' | 'head'): Anchor {
  const s = solve(pose)
  const oy = footY - hipHeightOf(s, pose) * scale
  const deg = part === 'handF' ? pose.armF[1] : part === 'handB' ? pose.armB[1] : 180 - pose.lean
  const [dx, dy] = dir(deg)
  const p = s[part]
  return { x: x + p[0] * facing * scale, y: oy + p[1] * scale, dx: dx * facing, dy }
}

/** 前手的螢幕位置與前臂方向，用來把持有物畫在手上。 */
export const frontHand = (pose: Pose, x: number, footY: number, facing: 1 | -1, scale = 1) =>
  anchor(pose, x, footY, facing, scale, 'handF')

export const backHand = (pose: Pose, x: number, footY: number, facing: 1 | -1, scale = 1) =>
  anchor(pose, x, footY, facing, scale, 'handB')

/** 頭的中心與脊椎方向，用來畫帽子、墨鏡等裝扮。 */
export const headAnchor = (pose: Pose, x: number, footY: number, facing: 1 | -1, scale = 1) =>
  anchor(pose, x, footY, facing, scale, 'head')

export interface Palette {
  body: string
  /** 遠側手腳的顏色，用來分辨前後。 */
  back: string
}

/**
 * 畫一個火柴人。footY 是角色腳底所在的螢幕 y（地面減去跳躍高度）；
 * 骨盆會自動抬到讓最低的腳碰到 footY。
 */
export function drawStickman(
  ctx: CanvasRenderingContext2D,
  pose: Pose,
  x: number,
  footY: number,
  facing: 1 | -1,
  palette: Palette,
  scale = 1,
): void {
  const s = solve(pose)
  const ox = x
  const oy = footY - hipHeightOf(s, pose) * scale
  const at = (v: Vec): Vec => [ox + v[0] * facing * scale, oy + v[1] * scale]

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 2.5 * scale

  const chain = (color: string, ...pts: Vec[]) => {
    ctx.strokeStyle = color
    ctx.beginPath()
    const [x0, y0] = at(pts[0])
    ctx.moveTo(x0, y0)
    for (const p of pts.slice(1)) {
      const [px, py] = at(p)
      ctx.lineTo(px, py)
    }
    ctx.stroke()
  }

  chain(palette.back, s.neck, s.elbowB, s.handB)
  chain(palette.back, s.hip, s.kneeB, s.footB)
  chain(palette.body, s.hip, s.neck)
  chain(palette.body, s.hip, s.kneeF, s.footF)
  chain(palette.body, s.neck, s.elbowF, s.handF)

  const [hx, hy] = at(s.head)
  ctx.fillStyle = palette.body
  ctx.beginPath()
  ctx.arc(hx, hy, BODY.headR * scale, 0, Math.PI * 2)
  ctx.fill()
}
