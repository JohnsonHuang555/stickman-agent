import { NICKNAME_MAX, bestPerNickname, nicknameKey, type Leaderboard, type LeaderboardEntry } from './leaderboard'

/**
 * 線上排行榜：直接呼叫 Firestore REST API（不載入 Firebase SDK，遊戲檔案不會變大）。
 * 每個暱稱一份文件（文件 ID = 小寫暱稱）：寫入時整份覆蓋，firestore.rules 只允許「比原本好」的成績覆蓋，
 * 所以排行榜上同一個人只會有最高的那筆。
 */
export interface FirestoreConfig {
  projectId: string
  apiKey: string
}

export const SCORES_COLLECTION = 'scores'
/** 生存模式的排行榜存在另一個集合。 */
export const SURVIVAL_COLLECTION = 'survival'
/** 讀取時多抓一些再去掉重複的暱稱（舊資料可能有同名的多筆）；Firestore 規則上限 50。 */
const QUERY_HEADROOM = 3
const QUERY_MAX = 50
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
    private readonly collection: string = SCORES_COLLECTION,
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
    // PATCH 到固定的文件：沒有就建立，有就覆蓋（不比原本好的會被規則擋下來，視為失敗即可）
    const id = encodeURIComponent(nicknameKey(entry.nickname))
    await this.request(`${this.base}/${this.collection}/${id}?key=${this.config.apiKey}`, body, 'PATCH')
  }

  async top(limit: number): Promise<LeaderboardEntry[]> {
    // 需要複合索引：floor ↓、score ↓、at ↑（見 firestore.indexes.json）
    const query = {
      structuredQuery: {
        from: [{ collectionId: this.collection }],
        orderBy: [
          { field: { fieldPath: 'floor' }, direction: 'DESCENDING' },
          { field: { fieldPath: 'score' }, direction: 'DESCENDING' },
          { field: { fieldPath: 'at' }, direction: 'ASCENDING' },
        ],
        limit: Math.min(QUERY_MAX, limit * QUERY_HEADROOM),
      },
    }
    const rows = (await this.request(`${this.base}:runQuery?key=${this.config.apiKey}`, query)) as {
      document?: { fields?: Record<string, FirestoreValue> }
    }[]
    const entries = rows.map((row) => toEntry(row.document?.fields)).filter((e): e is LeaderboardEntry => e !== null)
    return bestPerNickname(entries).slice(0, limit)
  }

  private async request(url: string, body: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<unknown> {
    const controller = typeof AbortController === 'undefined' ? null : new AbortController()
    const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null
    try {
      const res = await this.fetchFn(url, {
        method,
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
