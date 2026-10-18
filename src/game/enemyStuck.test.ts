import { describe, expect, it } from 'vitest'
import { VIEW_W } from './constants'
import { Grunt } from './enemies/grunt'
import type { Button } from './input/buttons'
import { FLOORS } from './level/floors'
import { World } from './world'

const tick = (world: World) => world.update({ pressed: [], held: new Set() })

/** 雜兵「貼著牆還一直往牆裡走」的幀數。 */
function framesPushingWall(world: World, g: Grunt, frames: number): number {
  let n = 0
  for (let i = 0; i < frames; i++) {
    tick(world)
    const { left, right } = world.wallBounds()
    if ((g.x <= left + 1 && g.vx < 0) || (g.x >= right - 1 && g.vx > 0)) n++
  }
  return n
}

function lockedZone() {
  const world = new World()
  const zone = FLOORS[0].zones[0]
  world.agent.x = zone.start + VIEW_W / 2
  tick(world)
  expect(world.director?.locked).toBe(true)
  return { world, left: zone.start + 8, right: zone.start + VIEW_W - 8 }
}

describe('enemies do not keep walking into a wall (regression for "enemies get stuck walking toward the wall")', () => {
  it('a weapon lying outside the locked screen is not worth walking into the wall for', () => {
    const { world, right } = lockedZone()
    const g = new Grunt(right - 40, 'bruiser', { held: null })
    g.entered = true
    world.enemies = [g]
    world.items = []
    world.placeItem('bat', right + 60) // 鎖定畫面外，走不到
    expect(framesPushingWall(world, g, 300)).toBeLessThan(10)
  })

  it('a cornered enemy backing away from the agent stops at the wall instead of walking in place', () => {
    const world = new World({ mode: 'sandbox' })
    world.agent.x = 45
    const g = new Grunt(20, 'thug')
    world.enemies = [g]
    // 攻擊名額都被佔走：這個雜兵只能在旁邊等
    world.slots.request(9001)
    world.slots.request(9002)
    expect(framesPushingWall(world, g, 200)).toBeLessThan(10)
  })
})

describe('enemies walking toward each other pass instead of locking up (regression for "one walks right, one walks left, they get stuck")', () => {
  it('in real fights, two enemies never stay pressed together walking into each other for more than 20 frames', () => {
    let worst = 0
    for (let run = 0; run < 4; run++) {
      const world = new World()
      world.agent.life.hp = 1e9
      const streak = new Map<string, number>()
      let held: Button[] = ['right']
      for (let f = 0; f < 5000; f++) {
        if (f % 25 === 0) held = Math.random() < 0.55 ? ['right'] : Math.random() < 0.5 ? ['left'] : []
        const pressed: Button[] = Math.random() < 0.08 ? [Math.random() < 0.5 ? 'punch' : 'kick'] : []
        world.update({ pressed, held: new Set([...held, ...pressed]) })
        const standing = world.enemies.filter((e) => !e.airborne && e.hurtbox())
        const seen = new Set<string>()
        for (let i = 0; i < standing.length; i++) {
          for (let j = i + 1; j < standing.length; j++) {
            const [a, b] = standing[i].x < standing[j].x ? [standing[i], standing[j]] : [standing[j], standing[i]]
            if (b.x - a.x >= 10 || a.vx <= 0.3 || b.vx >= -0.3) continue
            const key = `${a.id}-${b.id}`
            seen.add(key)
            const n = (streak.get(key) ?? 0) + 1
            streak.set(key, n)
            worst = Math.max(worst, n)
          }
        }
        for (const key of [...streak.keys()]) if (!seen.has(key)) streak.delete(key)
      }
    }
    expect(worst).toBeLessThan(20)
  }, 120000)
})
