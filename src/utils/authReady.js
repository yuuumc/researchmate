// ============================================================
// Auth 启动就绪门（v2.5 · UI 层）
// ============================================================
// router guard 需要等 useAuthBootstrap().bootstrap() 完成后再判断登录态，
// 否则首屏刷新时 guard 会读到 user=null 误跳 /login。
// main.js 在 auth bootstrap 结束后调 setAuthReady()。
// ============================================================

let ready = false
let bootError = null
const waiters = []

export function setAuthReady() {
  ready = true
  waiters.splice(0).forEach((resolve) => resolve())
}

export function setAuthBootError(err) {
  bootError = err
}

export function isAuthReady() {
  return ready
}

export function getAuthBootError() {
  return bootError
}

/** router guard 用：等 auth bootstrap 完成（失败也放行，由页面级降级处理） */
export function whenAuthReady() {
  if (ready) return Promise.resolve()
  return new Promise((resolve) => waiters.push(resolve))
}
