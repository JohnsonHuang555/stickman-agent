import { describe, expect, it } from 'vitest'
import type { FloorDef } from './floors'
import { SPAWN_STAGGER, WAVE_PAUSE, ZoneDirector } from './zoneDirector'

const floor: FloorDef = {
  label: 'T',
  subtitle: 'TEST',
  theme: 'lobby',
  width: 2000,
  stairsX: 1900,
  items: [],
  zones: [
    {
      start: 100,
      waves: [
        [{ type: 'thug', side: 'right' }, { type: 'thug', side: 'left' }],
        [{ type: 'heavy', side: 'right' }],
      ],
    },
    { start: 800, waves: [[{ type: 'knifer', side: 'right' }]] },
  ],
}

/** 跑 frames 幀，回傳期間所有出場的敵人。 */
function runFor(d: ZoneDirector, from: number, frames: number, agentX: number, alive: number) {
  const spawned = []
  for (let f = from; f < from + frames; f++) spawned.push(...d.update(f, agentX, alive))
  return spawned
}

describe('ZoneDirector', () => {
  it('does nothing before the agent reaches the middle of the first zone', () => {
    const d = new ZoneDirector(floor)
    expect(runFor(d, 0, 100, 339, 0)).toEqual([])
    expect(d.locked).toBe(false)
  })

  it('locks the camera and spawns the first wave, staggered', () => {
    const d = new ZoneDirector(floor)
    expect(d.update(0, 340, 0)).toEqual([{ type: 'thug', side: 'right' }])
    expect(d.locked).toBe(true)
    expect(d.lockLeft).toBe(100)
    expect(runFor(d, 1, SPAWN_STAGGER - 1, 340, 1)).toEqual([])
    expect(d.update(SPAWN_STAGGER, 340, 1)).toEqual([{ type: 'thug', side: 'left' }])
  })

  it('waits for the wave to be wiped out, pauses, then sends the next one', () => {
    const d = new ZoneDirector(floor)
    runFor(d, 0, 30, 340, 2)
    expect(runFor(d, 30, 100, 340, 1)).toEqual([])
    const next = runFor(d, 130, WAVE_PAUSE + 1, 340, 0)
    expect(next).toEqual([{ type: 'heavy', side: 'right' }])
  })

  it('unlocks once the last wave is cleared and shows GO until the agent moves on', () => {
    const d = new ZoneDirector(floor)
    runFor(d, 0, 30, 340, 2)
    runFor(d, 30, WAVE_PAUSE + 1, 340, 0)
    runFor(d, 100, 10, 340, 1)
    runFor(d, 110, 1, 340, 0)
    expect(d.locked).toBe(false)
    expect(d.allCleared).toBe(false)
    expect(d.showGo(340)).toBe(true)
    expect(d.showGo(800)).toBe(false)
  })

  it('reports all cleared after the final zone, and the next target is the stairs', () => {
    const d = new ZoneDirector(floor)
    runFor(d, 0, 30, 340, 2)
    runFor(d, 30, WAVE_PAUSE + 1, 340, 0)
    runFor(d, 100, 10, 340, 1)
    runFor(d, 110, 1, 340, 0)
    expect(d.update(200, 1040, 0)).toEqual([{ type: 'knifer', side: 'right' }])
    runFor(d, 201, 10, 1040, 1)
    runFor(d, 211, 1, 1040, 0)
    expect(d.allCleared).toBe(true)
    expect(d.nextTarget).toBe(1900)
  })
})
