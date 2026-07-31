// ============================================================
// src/composables/useTagInput.js
// 标签输入通用逻辑：回车添加 / 去重 / 按下标删除
//
// 用法（v3.1.4：消除 CareerView / PeerView 的重复实现）：
//   const { input: skillInput, add: addSkill, remove: removeSkill } =
//     useTagInput(form, 'mastered_skills')
//   const { input: weakInput, add: addWeak, remove: removeWeak } =
//     useTagInput(form, 'weak_points')
//
// 模板侧与原有命名保持一致，无需改动：
//   <input v-model="skillInput" @keydown.enter.prevent="addSkill" />
//   <button @click="removeSkill(i)">×</button>
// ============================================================

import { ref } from 'vue'

/**
 * @param {import('vue').Ref<Record<string, any>>} formRef - 表单对象 ref
 * @param {string} key - formRef.value 上的字符串数组字段名
 * @returns {{ input: import('vue').Ref<string>, add: () => void, remove: (i: number) => void }}
 */
export function useTagInput(formRef, key) {
  const input = ref('')

  function add() {
    const v = input.value.trim()
    const list = formRef.value[key]
    if (v && !list.includes(v)) {
      list.push(v)
      input.value = ''
    }
  }

  function remove(i) {
    formRef.value[key].splice(i, 1)
  }

  return { input, add, remove }
}
