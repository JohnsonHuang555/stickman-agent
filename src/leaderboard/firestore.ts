import { NICKNAME_MAX, compareEntries, type Leaderboard, type LeaderboardEntry } from './leaderboard'

/**
 * 線上排行榜：直接呼叫 Firestore REST API（不載入 Firebase SDK，遊戲檔案不會變大）。
 * 寫入格式由 firestore.rules 把關：只能新增、欄位與數值範圍固定，不能修改或刪除。
 */
export interface FirestoreConfig {
  projectId: string
  apiKey: string
}

export const SCORES_COLLECTION = 'scores'
/** 單次請求最多等這麼久，網路不好時不會卡住排行榜畫面。 */
const TIMEOUT_MS = 5000

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

interface FirestoreValue {
  stringValue?: string
  integerValue?: string
}

export class FirestoreLeaderboard implements Leaderboard {
  private readonly base: string

  constructor(
    private readonly config: FirestoreConfig,
    private readonly fetchFn: Fetch = (input, init) => fetch(input, init),
  ) {
    this.base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents`
  }

  async submit(entry: LeaderboardEntry): Promise<void> {
    const body = {
      fields: {
        nickname: { stringValue: entry.nickname.slice(0, NICKNAME_MAX) },
        floor: { integerValue: String(Math.round(entry.floor)) },
        score: { integerValue: String(Math.max(0, Math.round(entry.score))) },
        at: { integerValue: String(Math.round(entry.at)) },
      },
    }
    await this.request(`${this.base}/${SCORES_COLLECTION}?key=${this.config.apiKey}`, body)
  }

  async top(limit: number): Promise<LeaderboardEntry[]> {
    // 需要複合索引：floor ↓、score ↓、at ↑（見 firestore.indexes.json）
    const query = {
      structuredQuery: {
        from: [{ collectionId: SCORES_COLLECTION }],
        orderBy: [
          { field: { fieldPath: 'floor' }, direction: 'DESCENDING' },
          { field: { fieldPath: 'score' }, direction: 'DESCENDING' },
          { field: { fieldPath: 'at' }, direction: 'ASCENDING' },
        ],
        limit,
      },
    }
    const rows = (await this.request(`${this.base}:runQuery?key=${this.config.apiKey}`, query)) as {
      document?: { fields?: Record<string, FirestoreValue> }
    }[]
    return rows
      .map((row) => toEntry(row.document?.fields))
      .filter((e): e is LeaderboardEntry => e !== null)
      .sort(compareEntries)
      .slice(0, limit)
  }

  private async request(url: string, body: unknown): Promise<unknown> {
    const controller = typeof AbortController === 'undefined' ? null : new AbortController()
    const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null
    try {
      const res = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller?.signal,
      })
      if (!res.ok) throw new Error(`Firestore ${res.status}`)
      return await res.json()
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

function toEntry(fields: Record<string, FirestoreValue> | undefined): LeaderboardEntry | null {
  if (!fields) return null
  const nickname = fields.nickname?.stringValue
  const floor = Number(fields.floor?.integerValue)
  const score = Number(fields.score?.integerValue)
  const at = Number(fields.at?.integerValue)
  if (typeof nickname !== 'string' || !Number.isFinite(floor) || !Number.isFinite(score)) return null
  return { nickname, floor, score, at: Number.isFinite(at) ? at : 0 }
}

/**
 * 線上為主、本機備援：成績一律也存一份在本機；線上讀不到（沒網路、服務掛掉）時改顯示本機的排行榜。
 */
export class FallbackLeaderboard implements Leaderboard {
  constructor(
    private readonly remote: Leaderboard,
    private readonly local: Leaderboard,
  ) {}

  async submit(entry: LeaderboardEntry): Promise<void> {
    await this.local.submit(entry)
    try {
      await this.remote.submit(entry)
    } catch {
      // 上傳失敗不影響遊戲；本機已經有這筆成績
    }
  }

  async top(limit: number): Promise<LeaderboardEntry[]> {
    try {
      return await this.remote.top(limit)
    } catch {
      return this.local.top(limit)
    }
  }
}

/** 從 Vite 環境變數讀 Firebase 設定；沒設定就回傳 null（用本機排行榜）。 */
export function firestoreConfigFrom(env: Record<string, string | undefined>): FirestoreConfig | null {
  const projectId = env.VITE_FIREBASE_PROJECT_ID?.trim()
  const apiKey = env.VITE_FIREBASE_API_KEY?.trim()
  return projectId && apiKey ? { projectId, apiKey } : null
}
