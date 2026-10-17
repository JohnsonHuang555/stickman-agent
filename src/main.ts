import { Keyboard } from './engine/keyboard'
import { startLoop } from './engine/loop'
import { VIEW_H, VIEW_W } from './game/constants'
import { World } from './game/world'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

function fit() {
  const scale = Math.max(1, Math.floor(Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H)))
  canvas.style.width = `${VIEW_W * scale}px`
  canvas.style.height = `${VIEW_H * scale}px`
}
addEventListener('resize', fit)
fit()

if (import.meta.env.DEV && location.search.includes('poses')) {
  import('./dev/poseGallery').then(({ drawPoseGallery }) => {
    const draw = () => drawPoseGallery(ctx)
    draw()
    document.fonts.ready.then(draw)
  })
} else {
  const keyboard = new Keyboard()
  keyboard.attach(window)

  let world = new World()
  startLoop(
    () => {
      world.update(keyboard.poll())
      if (world.restartRequested) world = new World()
    },
    () => world.render(ctx),
  )
}
