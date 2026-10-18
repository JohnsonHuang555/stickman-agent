export const VIEW_W = 480
/** 遊戲世界的鏡頭放大倍率：人物和場景在畫面上放大，場地不會顯得空（HUD 不放大）。 */
export const WORLD_ZOOM = 1.5
/** 遊戲中背景建築（窗戶、柱子、天花板）的縮放：讓人物和建築的比例合理（頭碰得到窗戶）。 */
export const BACKGROUND_SCALE = 0.55
/** 畫面上看得到的世界寬度（鏡頭、鎖定區段、出場位置都用這個）。 */
export const WORLD_VIEW_W = VIEW_W / WORLD_ZOOM
export const VIEW_H = 270
/** 地面的螢幕 y 座標。 */
export const GROUND_Y = 232
export const GRAVITY = 0.42
