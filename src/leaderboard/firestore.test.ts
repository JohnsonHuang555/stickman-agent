import { describe, expect, it } from 'vitest'
import { FallbackLeaderboard, FirestoreLeaderboard, firestoreConfigFrom } from './firestore'
import { CLEARED_FLOOR, LocalLeaderboard, type LeaderboardEntry } from './leaderboard'

const CONFIG = { projectId: 'stickman-test', apiKey: 'KEY123' }

function memoryStore() {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

/** 假的 fetch：記錄每次請求，回傳指定的 JSON。 */
function fakeFetch(reply: unknown = {}, status = 200) {
  const calls: { url: string; method?: string; body: any }[] = []
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method, body: JSON.parse(String(init?.body)) })
    return new Response(JSON.stringify(reply), { status })
  }
  return { fn, calls }
}

const entry = (nickname: string, floor: number, score: number, at = 1): LeaderboardEntry => ({ nickname, floor, score, at })

const doc = (e: LeaderboardEntry) => ({
  document: {
    fields: {
      nickname: { stringValue: e.nickname },
      floor: { integerValue: String(e.floor) },
      score: { integerValue: String(e.score) },
      at: { integerValue: String(e.at) },
    },
  },
})

describe('FirestoreLeaderboard', () => {
  it('writes one document per nickname (lower-cased id) with typed fields, overwriting via PATCH', async () => {
    const { fn, calls } = fakeFetch()
    await new FirestoreLeaderboard(CONFIG, fn).submit(entry('AGENT', 3, 12345, 99))
    expect(calls[0].url).toBe(
      'https://firestore.googleapis.com/v1/projects/stickman-test/databases/(default)/documents/scores/agent?key=KEY123',
    )
    expect(calls[0].method).toBe('PATCH')
    expect(calls[0].body).toEqual({
      fields: {
        nickname: { stringValue: 'AGENT' },
        floor: { integerValue: '3' },
        score: { integerValue: '12345' },
        at: { integerValue: '99' },
      },
    })
  })

  it('reads the top N ordered by floor, then score, then earliest', async () => {
    const rows = [doc(entry('B', 2, 900)), doc(entry('A', CLEARED_FLOOR, 100)), { readTime: 'x' }, doc(entry('C', 2, 1500))]
    const { fn, calls } = fakeFetch(rows)
    const top = await new FirestoreLeaderboard(CONFIG, fn).top(20)
    expect(calls[0].url).toContain('/documents:runQuery?key=KEY123')
    expect(calls[0].body.structuredQuery.limit).toBe(50) // 多抓一些再去掉重複暱稱（上限 50）
    expect(calls[0].body.structuredQuery.orderBy.map((o: any) => o.field.fieldPath)).toEqual(['floor', 'score', 'at'])
    expect(top.map((e) => e.nickname)).toEqual(['A', 'C', 'B'])
  })

  it('shows each nickname once, keeping the best (old data may have duplicates)', async () => {
    const rows = [doc(entry('Bob', 2, 900)), doc(entry('bob', 3, 100)), doc(entry('BOB', 2, 5000)), doc(entry('Amy', 1, 50))]
    const { fn } = fakeFetch(rows)
    const top = await new FirestoreLeaderboard(CONFIG, fn).top(10)
    expect(top.map((e) => [e.nickname, e.floor, e.score])).toEqual([
      ['bob', 3, 100],
      ['Amy', 1, 50],
    ])
  })

  it('throws on an HTTP error so the caller can fall back', async () => {
    const { fn } = fakeFetch({ error: 'denied' }, 403)
    await expect(new FirestoreLeaderboard(CONFIG, fn).top(20)).rejects.toThrow('403')
  })
})

describe('FallbackLeaderboard', () => {
  const failing = { submit: async () => Promise.reject(new Error('offline')), top: async () => Promise.reject(new Error('offline')) }

  it('always keeps a local copy, and shows local scores when the online board cannot be reached', async () => {
    const local = new LocalLeaderboard(memoryStore())
    const board = new FallbackLeaderboard(failing, local)
    await board.submit(entry('ME', 2, 500))
    expect((await board.top(20)).map((e) => e.nickname)).toEqual(['ME'])
  })

  it('uses the online board when it works', async () => {
    const { fn } = fakeFetch([doc(entry('WORLD', 3, 9999))])
    const board = new FallbackLeaderboard(new FirestoreLeaderboard(CONFIG, fn), new LocalLeaderboard(memoryStore()))
    expect((await board.top(20)).map((e) => e.nickname)).toEqual(['WORLD'])
  })
})

describe('firestoreConfigFrom', () => {
  it('needs both the project id and the api key', () => {
    expect(firestoreConfigFrom({})).toBeNull()
    expect(firestoreConfigFrom({ VITE_FIREBASE_PROJECT_ID: 'p' })).toBeNull()
    expect(firestoreConfigFrom({ VITE_FIREBASE_PROJECT_ID: ' p ', VITE_FIREBASE_API_KEY: 'k' })).toEqual({ projectId: 'p', apiKey: 'k' })
  })
})
