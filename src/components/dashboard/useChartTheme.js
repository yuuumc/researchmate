// ============================================================
// useChartTheme — ECharts 深浅双主题 composable（B5 与 B4 同源）
// ============================================================
// 从 B4 KnowledgeGraphView 的 getChartTheme() 提取为共享 composable，
// 供 B5 四卡片复用，保证深色模式可读性与 B4 一致。
//
// 用法：
//   const { chartTheme, onThemeChange } = useChartTheme()
//   // chartTheme.value.labelColor / .edgeColor / .legendColor / ...
//   // onThemeChange(callback) — 主题切换时回调（组件销毁自动清理）
// ============================================================

import { ref, onBeforeUnmount } from 'vue'
import { getCurrentTheme } from '@/composables/useTheme'

export function useChartTheme() {
  const chartTheme = ref(getThemeColors())

  function getThemeColors() {
    const dark = getCurrentTheme() === 'dark'
    return {
      labelColor:    dark ? '#e5e7eb' : '#374151',
      axisLineColor: dark ? '#374151' : '#e5e7eb',
      splitLineColor:dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      edgeColor:     dark ? '#4b5563' : '#cbd5e1',
      legendColor:   dark ? '#9ca3af' : '#6b7280',
      tooltipBg:     dark ? 'rgba(31,41,55,0.96)' : 'rgba(255,255,255,0.96)',
      tooltipBorder: dark ? '#374151' : '#e5e7eb',
      tooltipText:   dark ? '#f3f4f6' : '#1f2937',
      tooltipSub:    dark ? '#9ca3af' : '#6b7280',
      // 系列色（与 B4 热力色同源）
      seriesColors: [
        '#00d4aa', // mastered / 已掌握（青绿）
        '#ffd166', // intermediate / 学习中（琥珀）
        '#ff6b6b', // weak / 薄弱（珊瑚红）
        '#4d9de0', // info / 信息（钢蓝）
        '#a855f7', // accent / 强调（紫）
      ],
      isDark: dark,
    }
  }

  function handleThemeChange() {
    chartTheme.value = getThemeColors()
  }

  // 返回注册/清理函数，供组件在 onMounted 调用
  function onThemeChange(callback) {
    window.addEventListener('theme-changed', handleThemeChange)
    if (callback) {
      const wrapped = () => callback(chartTheme.value)
      window.addEventListener('theme-changed', wrapped)
      onBeforeUnmount(() => {
        window.removeEventListener('theme-changed', wrapped)
      })
    }
  }

  onBeforeUnmount(() => {
    window.removeEventListener('theme-changed', handleThemeChange)
  })

  return { chartTheme, onThemeChange, getThemeColors }
}
