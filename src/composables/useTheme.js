// ============================================================
// useTheme · 深浅双主题切换 composable
// ============================================================
// 用法：
//   App.vue onMounted → initTheme()
//   TopBar → toggleTheme()
// 主题选择持久化到 localStorage，默认暗色
// ============================================================

const STORAGE_KEY = 'yanxintong-theme'

/** 初始化主题：读 localStorage，无值默认 dark */
export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY) || 'dark'
  document.documentElement.dataset.theme = saved
}

/** 获取当前主题 */
export function getCurrentTheme() {
  return document.documentElement.dataset.theme || 'dark'
}

/** 切换主题：dark ↔ light，持久化 */
export function toggleTheme() {
  const current = document.documentElement.dataset.theme || 'dark'
  const next = current === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  localStorage.setItem(STORAGE_KEY, next)
  // 派发自定义事件，ECharts 等组件可监听后重渲染
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: next } }))
  return next
}
