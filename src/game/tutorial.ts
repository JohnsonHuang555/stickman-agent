import { GRAB_HITS } from './agent/grab'
import { MOVES } from './agent/moves'
import type { HitSpec } from './combat/types'
import { VIEW_W } from './constants'
import { text } from './render/hud'
import type { World } from './world'

/**
 * 練習模式的教學：一次一個技巧，玩家真的使出來（打中）才打勾、換下一個。
 * 遊戲畫面不顯示按鍵提示，這裡是讓玩家學會那些藏起來的技巧的地方。
 */
interface LessonState {
  world: World
  /** 這一幀特務打中的招式。 */
  hits: readonly HitSpec[]
  /** 練習開始後在地上走過的距離。 */
  walked: number
}

export interface Lesson {
  title: string
  keys: string
  touch: string
  done(s: LessonState): boolean
}

const landed = (spec: HitSpec) => (s: LessonState) => s.hits.includes(spec)

export const LESSONS: readonly Lesson[] = [
  { title: '移動', keys: 'A D 左右走', touch: '搖桿左右走', done: (s) => s.walked >= 60 },
  { title: '跑步', keys: 'A 或 D 連按兩下並按住', touch: '搖桿往同一邊推兩下並推住', done: (s) => s.world.agent.isRunning },
  { title: '跳', keys: 'W', touch: '搖桿往上推', done: (s) => s.world.agent.h > 12 },
  { title: '三段拳', keys: 'J 連按三下（第三拳擊倒）', touch: '拳 連按三下', done: landed(MOVES.punch3.hit) },
  { title: '踢', keys: 'K', touch: '踢', done: landed(MOVES.kick.hit) },
  { title: '挑空技', keys: 'S → W + J（下、上、拳）', touch: '搖桿下、上，再按 拳', done: landed(MOVES.launcher.hit) },
  { title: '空中連段', keys: '挑空後按 W 跳起來，J → J → K', touch: '挑空後搖桿往上跳，拳 → 拳 → 踢', done: landed(MOVES.airSpike.hit) },
  { title: '閃身步', keys: 'Shift（按方向往那邊閃）', touch: '閃', done: (s) => s.world.agent.isDodging },
  {
    title: '閃過反擊',
    keys: '敵人攻擊快打到時按 Shift，出現 COUNTER! 時按 J',
    touch: '敵人攻擊快打到時按 閃，出現 COUNTER! 時按 拳',
    done: (s) => s.hits.some((h) => h.counter),
  },
  { title: '踢下體', keys: 'K K 快速連按', touch: '踢 快速連按兩下', done: (s) => s.hits.some((h) => h.groin) },
  { title: '抓人', keys: '走到敵人面前按 L', touch: '走到敵人面前按 抓', done: (s) => s.world.agent.isGrabbing },
  {
    title: '抓住後的招式',
    keys: '抓住後 J 膝撞、K 往前摔、後 + K 過肩摔',
    touch: '抓住後 拳 膝撞、踢 往前摔、搖桿往後 + 踢 過肩摔',
    done: (s) => s.hits.includes(GRAB_HITS.throw) || s.hits.includes(GRAB_HITS.suplex) || s.hits.includes(GRAB_HITS.lastKnee),
  },
  {
    title: '大風車',
    keys: '抓住後快速按 前 → 後 → 前 + K',
    touch: '抓住後搖桿快速 前 → 後 → 前，再按 踢',
    done: landed(GRAB_HITS.swingRelease),
  },
  { title: '撿武器', keys: '站在武器上按 L（武器用 J 攻擊，再按 L 丟出去）', touch: '站在武器上按 抓', done: (s) => !!s.world.agent.held },
]

/** 完成一課後「完成！」停留的幀數，之後換下一課。 */
const DONE_PAUSE = 50
/** 練習時血量低於這個比例就補滿：專心練，不會死。 */
const HEAL_BELOW = 0.4

export class Tutorial {
  index = 0
  private walked = 0
  private lastX: number | null = null
  /** 剛完成一課的實際幀（顯示「完成！」用）；-1 = 沒有。 */
  private doneAt = -1

  get finished(): boolean {
    return this.index >= LESSONS.length
  }

  /** 每幀在 world.update 之後呼叫。 */
  update(world: World): void {
    const agent = world.agent
    if (agent.life.hp < agent.life.max * HEAL_BELOW) agent.life.heal(agent.life.max)
    if (this.lastX !== null && agent.h === 0) this.walked += Math.abs(agent.x - this.lastX)
    this.lastX = agent.x

    if (this.finished) return
    if (this.doneAt >= 0) {
      if (world.realFrame - this.doneAt >= DONE_PAUSE) {
        this.doneAt = -1
        this.index++
      }
      return
    }
    if (LESSONS[this.index].done({ world, hits: world.agentHits, walked: this.walked })) {
      this.doneAt = world.realFrame
      world.sound('coin')
    }
  }

  draw(ctx: CanvasRenderingContext2D, frame: number, touch: boolean): void {
    const y = 44
    ctx.fillStyle = 'rgba(20,16,24,0.6)'
    ctx.fillRect(VIEW_W / 2 - 190, y - 6, 380, 42)
    if (this.finished) {
      text(ctx, '全部完成！', VIEW_W / 2, y, 10, 'center')
      text(ctx, '可以繼續自由練習；暫停 → QUIT TO TITLE 回主畫面', VIEW_W / 2, y + 17, 7, 'center')
      return
    }
    const lesson = LESSONS[this.index]
    const progress = `${this.index + 1}/${LESSONS.length}`
    if (this.doneAt >= 0) {
      text(ctx, `✓ ${lesson.title}  完成！`, VIEW_W / 2, y + 6, 10, 'center')
      return
    }
    text(ctx, `練習 ${progress}  ${lesson.title}`, VIEW_W / 2, y, 9, 'center')
    // 提示文字輕輕上下浮動，引導視線
    const bob = Math.round(Math.sin(frame / 20))
    text(ctx, touch ? lesson.touch : lesson.keys, VIEW_W / 2, y + 17 + bob, 7, 'center')
  }
}
