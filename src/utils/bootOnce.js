// ============================================================
// Boot 序列克制化（V2.6 迭代 · 评审演示 + 日常使用平衡）
// ============================================================
// 业界标准做法：每个 Agent 仅在会话内首次进入时播放启动序列，
// 用 sessionStorage（非 localStorage）标记——
//   · 评委演示：8 个栏目各看一次启动序列（仪式感保留）
//   · 同一会话内重复进出：不再打断
//   · 刷新页面重开会话：评委/新访客仍能看到一次完整演示
// ============================================================

const PREFIX = 'yxt_boot_shown_'

function key(agent) {
  return `${PREFIX}${agent}`
}

/** 该 Agent 的启动序列是否已在本会话播放过 */
export function bootShown(agent) {
  try {
    return sessionStorage.getItem(key(agent)) === '1'
  } catch {
    return false
  }
}

/** 标记该 Agent 的启动序列已播放 */
export function markBootShown(agent) {
  try {
    sessionStorage.setItem(key(agent), '1')
  } catch {
    // sessionStorage 不可用（隐私模式等）时静默降级——每次都播放
  }
}

/** 清除所有 Agent 的启动标记（调试/重置用） */
export function resetBootFlags() {
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => sessionStorage.removeItem(k))
  } catch {
    // ignore
  }
}
