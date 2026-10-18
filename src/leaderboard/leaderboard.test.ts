import { describe, expect, it } from 'vitest'
import { CLEARED_FLOOR, LocalLeaderboard, bestPerNickname, compareEntries, floorLabel, normalizeNickname, type LeaderboardEntry } from './leaderboard'

const entry = (nickname: string, floor: number, score: number, at = 0): LeaderboardEntry => ({ nickname, floor, score, at })

function memoryStore() {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data }
}

describe('compareEntries', () => {
  it('ranks by floor first, then score', () => {
    const sorted = [entry('a', 2, 9000), entry('b', 3, 100), entry('c', 3, 5000), entry('d', CLEARED_FLOOR, 1)].sort(compareEntries)
    expect(sorted.map((e) => e.nickname)).toEqual(['d', 'c', 'b', 'a'])
  })

  it('earlier achievement wins a tie', () => {
    const sorted = [entry('late', 2, 100, 20), entry('early', 2, 100, 10)].sort(compareEntries)
    expect(sorted[0].nickname).toBe('early')
  })
})

describe('normalizeNickname', () => {
  it('trims, collapses spaces and caps the length', () => {
    expect(normalizeNickname('  Agent   47  ')).toBe('Agent 47')
    expect(normalizeNickname('ABCDEFGHIJKLMNOP')).toBe('ABCDEFGHIJKL')
  })

  it('treats blank as no nickname', () => {
    expect(normalizeNickname('   ')).toBeNull()
  })
})

describe('floorLabel', () => {
  it('shows the floor or CLEAR', () => {
    expect(floorLabel(2)).toBe('2F')
    expect(floorLabel(CLEARED_FLOOR)).toBe('CLEAR')
  })
})

describe('LocalLeaderboard', () => {
  it('stores submissions and returns them ranked', async () => {
    const board = new LocalLeaderboard(memoryStore())
    await board.submit(entry('a', 1, 500))
    await board.submit(entry('b', 2, 100))
    expect((await board.top(10)).map((e) => e.nickname)).toEqual(['b', 'a'])
  })

  it('limits the result count', async () => {
    const board = new LocalLeaderboard(memoryStore())
    for (let i = 0; i < 5; i++) await board.submit(entry(`p${i}`, 1, i))
    expect(await board.top(3)).toHaveLength(3)
  })

  it('survives corrupted storage', async () => {
    const store = memoryStore()
    store.setItem('stickman.leaderboard', '{not json')
    const board = new LocalLeaderboard(store)
    expect(await board.top(10)).toEqual([])
    await board.submit(entry('a', 1, 1))
    expect(await board.top(10)).toHaveLength(1)
  })

  it('works with no storage at all', async () => {
    const board = new LocalLeaderboard(null)
    await board.submit(entry('a', 1, 1))
    expect(await board.top(10)).toEqual([])
  })
})

describe('one entry per nickname (regression for "duplicate names on the leaderboard")', () => {
  function store() {
    const data = new Map<string, string>()
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
  }

  it('a better score replaces the old one; a worse score does not', async () => {
    const board = new LocalLeaderboard(store())
    await board.submit({ nickname: 'Bob', floor: 2, score: 1000, at: 1 })
    await board.submit({ nickname: 'bob', floor: 2, score: 500, at: 2 }) // 沒破紀錄
    expect((await board.top(10)).map((e) => e.score)).toEqual([1000])
    await board.submit({ nickname: 'BOB', floor: 3, score: 10, at: 3 }) // 樓層更高 = 破紀錄
    const top = await board.top(10)
    expect(top).toHaveLength(1)
    expect(top[0]).toMatchObject({ floor: 3, score: 10 })
  })

  it('different nicknames each keep their own entry', async () => {
    const board = new LocalLeaderboard(store())
    await board.submit({ nickname: 'A', floor: 1, score: 1, at: 1 })
    await board.submit({ nickname: 'B', floor: 1, score: 2, at: 2 })
    expect((await board.top(10)).map((e) => e.nickname)).toEqual(['B', 'A'])
  })

  it('bestPerNickname keeps the best per name, ignoring case', () => {
    const best = bestPerNickname([
      { nickname: 'x', floor: 1, score: 9, at: 1 },
      { nickname: 'X', floor: 2, score: 1, at: 2 },
    ])
    expect(best).toEqual([{ nickname: 'X', floor: 2, score: 1, at: 2 }])
  })
})
