// ============================================================
// useChatShortcut.js — 聊天输入框聚焦的跨组件协调
// ============================================================
// 用途：AppLayout 捕获 `/` 快捷键后，需要聚焦 ChatWindow 内的 textarea。
//   但 ChatWindow 仅在 /chat 路由挂载，跨页时需先导航再聚焦。
//
// 机制（两路互补）：
//   1. 已在 /chat：focusChatInputNow() 派发 window 事件，
//      ChatWindow 监听到后立即 focus textarea。
//   2. 不在 /chat：requestChatFocus() 置 pending 标记，
//      AppLayout 随后 router.push('/chat')，
//      ChatWindow onMounted 调 consumePendingChatFocus() 取走标记并 focus。
//
// 这样无论当前在哪个页面，`/` 都能把焦点送到聊天输入框。
// ============================================================

// 模块级待聚焦标记（跨组件共享，无需 store）
let pendingFocus = false

/** 标记：ChatWindow 下次挂载时需要自动聚焦（跨页导航场景） */
export function requestChatFocus() {
  pendingFocus = true
}

/** ChatWindow onMounted 调用：取走并清除待聚焦标记 */
export function consumePendingChatFocus() {
  const v = pendingFocus
  pendingFocus = false
  return v
}

/** 已挂载场景：派发事件让 ChatWindow 立即聚焦 */
export function focusChatInputNow() {
  window.dispatchEvent(new CustomEvent('yx:focus-chat-input'))
}

/**
 * AppLayout 在 `/` 快捷键里调用：统一入口
 * @param {import('vue-router').Router} router
 */
export function triggerChatFocus(router) {
  if (router?.currentRoute?.value?.path === '/chat') {
    focusChatInputNow()
  } else {
    requestChatFocus()
    router?.push('/chat')
  }
}

/** ChatWindow 监听的事件名 */
export const CHAT_FOCUS_EVENT = 'yx:focus-chat-input'
