import { Grunt } from '../game/enemies/grunt'
import { newItem } from '../game/items/itemTypes'
import { World } from '../game/world'

/** 開發用：?scene=N 把第 N 層的一個畫面擺上特務與敵人，檢查背景上的角色是否清楚。 */
export function sceneGallery(floor: number, camX: number, combo = 0) {
  const world = new World({ startFloor: floor - 1 })
  world.phase = 'play'
  world.camX = camX
  world.agent.x = camX + 140
  world.agent.held = newItem('bat')
  world.agent.bag = newItem('pistol', 5)
  world.enemies = [
    new Grunt(camX + 220, 'thug', { passive: true }),
    new Grunt(camX + 280, 'bruiser', { passive: true }),
    new Grunt(camX + 340, 'gunman', { passive: true }),
    new Grunt(camX + 400, 'heavy', { passive: true }),
  ]
  for (let i = 0; i < combo; i++) world.combo.hit(world.realFrame)
  world.combo.bumpedAt = -Infinity
  return (ctx: CanvasRenderingContext2D) => world.render(ctx)
}
