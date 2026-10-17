import { describe, expect, it } from 'vitest'
import type { Pose } from './pose'
import { ATTACK_POSES, HOLD_ARMS, POSES } from './poses'

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

describe('walk cycle', () => {
  it('arms swing opposite to the legs', () => {
    for (const p of [POSES.walk1, POSES.walk3]) {
      const legs = Math.sign(p.legF[0] - p.legB[0])
      const arms = Math.sign(p.armF[0] - p.armB[0])
      expect(legs).not.toBe(0)
      expect(arms).toBe(-legs)
    }
  })

  it('the second half mirrors the first half', () => {
    expect(POSES.walk3.legF).toEqual(POSES.walk1.legB)
    expect(POSES.walk3.armF).toEqual(POSES.walk1.armB)
    expect(POSES.walk4.legF).toEqual(POSES.walk2.legB)
  })
})
