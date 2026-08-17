// ============================================================
// profileBus — 画像事件总线（F1 画像引擎地基 · 事件总线）
// ============================================================
// 单一写入口原则：
//   所有"写画像"操作（答题/推导/讲解/复述/诊断快照）一律经 profileBus
//   广播学习事件，由 profileStore 统一消费并更新 knowledge_state，
//   禁止各模块（F2 拍题 / F3 模考 / F4 费曼 / 现有 practice/diagnosis）
//   各写一套回写逻辑——这是"地基先行"的核心目的。
//
// 事件契约：
//   'learning-event'   增量学习事件（单题作答 / 单次推导 / 单轮复述）
//     { topic, outcome:'correct'|'incorrect', questionType, errorType?, timestamp }
//   'mastery-snapshot' 绝对掌握度快照（诊断完成批量设定）
//     { items: [{ topic, mastery, source }], timestamp }
//   'profile-updated'  画像状态变更完成广播（读侧监听以触发刷新）
//     { source, topics }
//
// 实现说明：零依赖 mitt 风格微型 emitter；同一事件多监听器按注册序调用。
// ============================================================

const handlers = new Map()

function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set())
  handlers.get(event).add(fn)
  return () => off(event, fn)
}

function off(event, fn) {
  const set = handlers.get(event)
  if (set) set.delete(fn)
}

function emit(event, payload) {
  const set = handlers.get(event)
  if (!set) return
  // 拷贝一份，防止监听器内 on/off 改动迭代
  for (const fn of [...set]) {
    try {
      fn(payload)
    } catch (e) {
      // 单个监听器抛错不影响其余监听器与事件链
      console.warn('[profileBus] listener error on "' + event + '":', e)
    }
  }
}

function clear() {
  handlers.clear()
}

export const profileBus = { on, off, emit, clear }

// 事件名常量（避免各处硬编码字符串拼错）
export const EVT = {
  LEARNING_EVENT: 'learning-event',
  MASTERY_SNAPSHOT: 'mastery-snapshot',
  PROFILE_UPDATED: 'profile-updated',
}
