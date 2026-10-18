import { describe, expect, it } from 'vitest'
import { posePoints, type Pose } from './pose'
import { ATTACK_POSES, HOLD_ARMS, POSES, WALK_CYCLE_DISTANCE, runPose, walkPose } from './poses'

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

describe('walk leg lift (regression for "legs lift too high")', () => {
  it('the swinging foot barely clears the ground and the knee stays near its standing height', () => {
    const stand = posePoints(POSES.idleA)
    const standingKnee = Math.max(stand[6][1], stand[8][1])
    let foot = 0
    let knee = 0
    for (let i = 0; i < 64; i++) {
      const p = posePoints(walkPose((i / 64) * WALK_CYCLE_DISTANCE))
      foot = Math.max(foot, p[7][1], p[9][1])
      knee = Math.max(knee, p[6][1], p[8][1])
    }
    expect(foot).toBeLessThanOrEqual(3)
    expect(knee - standingKnee).toBeLessThan(2.5)
  })
})

describe('air kicks look like the title screen (regression for "the flying kick should look like the cover")', () => {
  it('the air kick and the flying kick share the cover pose', () => {
    expect(ATTACK_POSES.airKick).toBe(ATTACK_POSES.flyingKick)
  })
})

describe('run cycle (regression for "the running animation looks odd")', () => {
  // 全速與剛起跑兩種強度都檢查
  const frames = [1, 0, 0.5].flatMap((intensity) => Array.from({ length: 60 }, (_, i) => runPose(i / 60, intensity)))

  it('knees and elbows only bend the natural way throughout the cycle', () => {
    for (const p of frames) {
      for (const [thigh, shin] of [p.legF, p.legB]) expect(diff(thigh, shin)).toBeGreaterThanOrEqual(-TOLERANCE)
      for (const [upper, fore] of [p.armF, p.armB]) expect(diff(fore, upper)).toBeGreaterThanOrEqual(-TOLERANCE)
    }
  })

  it('each arm swings opposite to the leg on the same side', () => {
    for (const p of frames) {
      // 前腳往前（大腿角度大）時前手往後（上臂角度小）
      if (p.legF[0] > p.legB[0] + 20) expect(p.armF[0]).toBeLessThan(p.armB[0])
      if (p.legB[0] > p.legF[0] + 20) expect(p.armB[0]).toBeLessThan(p.armF[0])
    }
  })

  it('when the thigh is at its most forward the knee is bent (knee drive), not a straight lunge', () => {
    const forward = frames.reduce((a, b) => (b.legF[0] > a.legF[0] ? b : a))
    expect(diff(forward.legF[0], forward.legF[1])).toBeGreaterThan(40)
  })

  it.each([1, 0.5, 0])('motion is continuous at intensity %f: no joint jumps more than 15° between neighbouring frames (60 per cycle)', (intensity) => {
    const cycle = Array.from({ length: 60 }, (_, i) => runPose(i / 60, intensity))
    const joints = (p: Pose) => [...p.armF, ...p.armB, ...p.legF, ...p.legB]
    for (let i = 0; i < cycle.length; i++) {
      const a = joints(cycle[i])
      const b = joints(cycle[(i + 1) % cycle.length])
      for (let j = 0; j < a.length; j++) expect(Math.abs(diff(a[j], b[j]))).toBeLessThan(15)
    }
  })

  it('a fresh run (jog) is more upright with smaller strides than full speed', () => {
    const jog = runPose(0.25, 0)
    const sprint = runPose(0.25, 1)
    expect(jog.lean).toBeLessThan(sprint.lean)
    expect(jog.legF[0]).toBeLessThan(sprint.legF[0])
  })
})

describe('run arm swing (regression for "the arms should swing more")', () => {
  it('at full speed each upper arm sweeps at least 170° front to back', () => {
    const ups = Array.from({ length: 60 }, (_, i) => runPose(i / 60, 1).armF[0])
    expect(Math.max(...ups) - Math.min(...ups)).toBeGreaterThanOrEqual(170)
  })
})
