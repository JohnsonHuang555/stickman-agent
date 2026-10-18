import { describe, expect, it } from 'vitest'
import type { Button } from './input/buttons'
import type { Pose } from './stickman/pose'
import { World } from './world'

/** 一幀之內關節角度（含身體前傾）變化最大的量。 */
const angleDiff = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180)
function biggestJump(a: Pose, b: Pose): number {
  const limbs = (p: Pose) => [p.lean, ...p.armF, ...p.armB, ...p.legF, ...p.legB]
  const la = limbs(a)
  const lb = limbs(b)
  return Math.max(...la.map((v, i) => angleDiff(v, lb[i])))
}

function jumpTrace(held: Button[] = []) {
  const world = new World({ mode: 'sandbox' })
  world.enemies = []
  const tick = (pressed: Button[] = []) => world.update({ pressed, held: new Set([...held, ...pressed]) })
  for (let i = 0; i < 10; i++) tick()
  const poses = [world.agent.pose()]
  tick(['jump'])
  poses.push(world.agent.pose())
  for (let i = 0; i < 70; i++) {
    tick()
    poses.push(world.agent.pose())
  }
  return poses
}

// 補間前：起跳、最高點、落地、落地後站起來，每一處都一幀跳 100° 以上
const MAX_STEP = 45

describe('jump animation is continuous (regression for "the jump looks choppy")', () => {
  it.each([
    ['standing jump', []],
    ['jump while walking', ['right']],
  ] as [string, Button[]][])('%s: no joint snaps more than MAX_STEP degrees in one frame', (_n, held) => {
    const poses = jumpTrace(held)
    const steps = poses.slice(1).map((p, i) => biggestJump(poses[i], p))
    expect(Math.max(...steps)).toBeLessThanOrEqual(MAX_STEP)
  })
})
