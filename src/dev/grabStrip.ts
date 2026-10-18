import { GROUND_Y, VIEW_W } from '../game/constants'
import { Grunt } from '../game/enemies/grunt'
import type { Fighter } from '../game/fighter'
import type { Button } from '../game/input/buttons'
import { drawLobby } from '../game/render/background'
import { World } from '../game/world'

/** 開發用：?grabs=suplex|swing（&step=幀距&cols=欄數）把抓技動作畫成分鏡，檢查被抓的人有沒有跟著手走。 */
export function makeStrip(move: string): (ctx: CanvasRenderingContext2D) => void {
  const w = new World({ mode: 'sandbox' })
  w.items = []
  w.agent.x = 300
  const g = new Grunt(316, 'bruiser', { passive: true, held: null })
  g.life.hp = 999
  w.enemies = [g]
  const t = (p: Button[] = [], h: Button[] = []) => w.update({ pressed: p, held: new Set([...h, ...p]) })
  t(['grab']); for (let i = 0; i < 6; i++) t()
  // 過肩摔：後 + K；大風車：前 → 後 → 前 + K
  if (move === 'suplex') t(['kick'], ['left'])
  else {
    t(['right'])
    t(['left'])
    t(['right'])
    t(['kick'])
  }
  const snap = (f: Fighter) => ({ x: f.x, h: f.h, rotation: f.rotation, pose: f.pose(), facing: f.facing, squash: f.squash ? { ...f.squash } : null })
  const frames: { a: ReturnType<typeof snap>; g: ReturnType<typeof snap> }[] = []
  for (let i = 0; i < 56; i++) { frames.push({ a: snap(w.agent), g: snap(g) }); t() }
  const step = Number(new URLSearchParams(location.search).get("step") ?? 3)
  const picks = frames.filter((_, i) => i % step === 0).slice(0, 16)
  return (ctx) => {
    drawLobby(ctx, 0)
    const cols = Number(new URLSearchParams(location.search).get("cols") ?? 8)
    const cw = VIEW_W / cols
    picks.forEach((fr, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      ctx.save()
      ctx.translate(0, -(1 - row) * 120)
      const cx = col * cw + cw / 2
      for (const [f, s] of [[g, fr.g], [w.agent, fr.a]] as const) {
        f.display = { x: s.x, h: s.h, rotation: s.rotation, pose: s.pose }
        f.squash = s.squash
        const facing = f.facing
        f.facing = s.facing
        f.draw(ctx, 300 - cx)
        f.facing = facing
        f.display = null
        f.squash = null
      }
      ctx.fillStyle = '#000'
      ctx.font = '7px monospace'
      ctx.fillText('f' + i * step, col * cw + 4, GROUND_Y + 10)
      ctx.restore()
    })
  }
}
