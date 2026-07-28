// ============================================================
// localStorage 通用封装
// ============================================================
// 命名规范（规范.txt 数据契约）：
//   所有 key 必须以 yanxintong_ 为前缀
//   严禁 JSON.stringify(Set/Map)，存读都是数组
// ============================================================

const PREFIX = 'yanxintong_'

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
   * 清空所有 yanxintong_ 前缀的 key
   */
  clearAll() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k))
  }
}
