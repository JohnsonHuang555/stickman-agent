import { describe, expect, it } from 'vitest'
import { posePoints, type Pose } from './pose'
import { ATTACK_POSES, HOLD_ARMS, POSES, WALK_CYCLE_DISTANCE, walkPose } from './poses'

/** 角度差正規化到 (-180, 180]。 */
const diff = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180

const ALL: [string, Pose][] = [
  ...Object.entries(POSES),
  ...Object.entries(ATTACK_POSES).flatMap(([n, ps]) => ps.map((p, i): [string, Pose] => [`${n}[${i}]`, p])),
  ...Object.entries(HOLD_ARMS).map(([n, a]): [string, Pose] => [`hold.${n}`, { ...POSES.idleA, ...a }]),
]

/** 容許幾度的誤差（視覺上看不出來的輕微過伸）。 */
const TOLERANCE = 5
const MAX_BEND = 160

describe('pose anatomy (regression for "limbs look uncoordinated")', () => {
  it.each(ALL)('%s: knees only bend forward (shin folds back behind the thigh)', (_name, p) => {
    for (const [thigh, shin] of [p.legF, p.legB]) {
      const bend = diff(thigh, shin)
      expect(bend).toBeGreaterThanOrEqual(-TOLERANCE)
      expect(bend).toBeLessThanOrEqual(MAX_BEND)
    }
  })

  it.each(ALL)('%s: elbows only bend one way (forearm folds forward / up)', (_name, p) => {
    for (const [upper, fore] of [p.armF, p.armB]) {
      const bend = diff(fore, upper)
      expect(bend).toBeGreaterThanOrEqual(-TOLERANCE)
      expect(bend).toBeLessThanOrEqual(MAX_BEND)
    }
  })
})

describe('walk (regression for "arm swing looks unnatural" and feet sliding)', () => {
  const STEPS = 64
  const samples = Array.from({ length: STEPS }, (_, i) => (i / STEPS) * WALK_CYCLE_DISTANCE)

  it('knees and elbows bend the right way at every point of the cycle', () => {
    for (const stride of samples) {
      const p = walkPose(stride)
      for (const [thigh, shin] of [p.legF, p.legB]) expect(diff(thigh, shin)).toBeGreaterThanOrEqual(-TOLERANCE)
      for (const [upper, fore] of [p.armF, p.armB]) expect(diff(fore, upper)).toBeGreaterThanOrEqual(-TOLERANCE)
    }
  })

  it('hands stay up in the guard the whole time (regression for "arms dropping while walking")', () => {
    const idle = posePoints(POSES.idleA)
    const chest = idle[1][1] * 0.75 // 站姿頸部高度的 75%
    for (const stride of samples) {
      const pts = posePoints(walkPose(stride))
      expect(pts[3][1]).toBeGreaterThan(chest) // 前手
      expect(pts[5][1]).toBeGreaterThan(chest) // 後手
    }
  })

  it('one foot is always on the ground', () => {
    for (const stride of samples) {
      const pts = posePoints(walkPose(stride))
      expect(Math.min(pts[7][1], pts[9][1])).toBeCloseTo(0, 1)
    }
  })

  it('the planted foot does not slide: it stays put in the world while the body walks forward', () => {
    let prev: { foot: number; x: number } | null = null
    let maxSlip = 0
    for (const stride of samples) {
      const pts = posePoints(walkPose(stride))
      const planted = pts[7][1] <= pts[9][1] ? 7 : 9
      const worldX = stride + pts[planted][0]
      if (prev && prev.foot === planted) maxSlip = Math.max(maxSlip, Math.abs(worldX - prev.x))
      prev = { foot: planted, x: worldX }
    }
    expect(maxSlip).toBeLessThan(0.3)
  })
})

describe('walk posture (regression for "crouch-walking")', () => {
  it('the supporting leg is nearly straight as it passes under the body', () => {
    const p = walkPose(WALK_CYCLE_DISTANCE / 4) // 前腳正踩在身體正下方
    expect(diff(p.legF[0], p.legF[1])).toBeLessThan(30)
  })

  it('the hips bob a little through the step', () => {
    const heights = [0, WALK_CYCLE_DISTANCE / 8, WALK_CYCLE_DISTANCE / 4].map((s) =>
      Math.max(...posePoints(walkPose(s)).map(([, up]) => up)),
    )
    const bob = Math.max(...heights) - Math.min(...heights)
    expect(bob).toBeGreaterThan(1)
    expect(bob).toBeLessThan(6)
  })
})
