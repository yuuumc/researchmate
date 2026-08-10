// ============================================================
// localStorage 通用封装
// ============================================================
// 命名规范（规范.txt 数据契约）：
//   所有 key 必须以 researchmate_ 为前缀
//   严禁 JSON.stringify(Set/Map)，存读都是数组
// ============================================================

const PREFIX = 'researchmate_'

function buildKey(scope) {
  return PREFIX + scope
}

export const storage = {
  /**
   * 读取并解析 JSON
   * @param {string} scope - 业务域（不含前缀），如 'profile' / 'diagnosis_history'
   * @returns {*} 解析后的值，失败返回 null
   */
  get(scope) {
    try {
      const raw = localStorage.getItem(buildKey(scope))
      return raw ? JSON.parse(raw) : null
    } catch (e) {
      console.error(`[storage] get ${scope} failed:`, e)
      return null
    }
  },

  /**
   * 序列化并写入
   * @param {string} scope
   * @param {*} value - 必须是可序列化的（禁止 Set/Map）
   * @returns {boolean} 是否写入成功
   */
  set(scope, value) {
    try {
      // 防御性检查：禁止 Set/Map（规范.txt 铁律）
      if (value instanceof Set || value instanceof Map) {
        console.error(`[storage] set ${scope} 拒绝写入 Set/Map，请先转为数组`)
        return false
      }
      localStorage.setItem(buildKey(scope), JSON.stringify(value))
      return true
    } catch (e) {
      // 配额超限
      if (e.name === 'QuotaExceededError') {
        console.error(`[storage] set ${scope} 存储空间不足`)
      } else {
        console.error(`[storage] set ${scope} failed:`, e)
      }
      return false
    }
  },

  /**
   * 删除
   */
  remove(scope) {
    localStorage.removeItem(buildKey(scope))
  },

  /**
   * 清空所有 researchmate_ 前缀的 key
   */
  clearAll() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k))
  },

  /**
   * 清空用户业务数据（保留主题设置）
   * 用于登录/注册/退出时清除游客或旧用户的数据，实现数据隔离
   * 清除：profile / diagnosis / plan / wrong_book / journey / subject / chat history / seed flag
   * 保留：researchmate-theme（主题用连字符前缀，不在 researchmate_ 范围内）
   */
  clearUserData() {
    // 清除所有 researchmate_ 前缀的业务数据（含聊天记录 localStorage）
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k))
    // 清除非前缀格式的游客/反馈数据
    try { localStorage.removeItem('researchmate.guest') } catch {}
    try { localStorage.removeItem('yxt_feedback') } catch {}
  }
}
