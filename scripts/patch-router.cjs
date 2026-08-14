// patch-router.cjs - apply P0-3 diagnostic probe to router.js
const fs = require('fs')
const p = 'C:/Users/Administrator/Desktop/yanxintong/src/core/router.js'
let s = fs.readFileSync(p, 'utf8')

// 1. add import
const impOld = "import { loadProfile, loadMemories } from './profileLoader'"
const impNew = impOld + "\nimport { queryMemory, getMemoryStats } from '@/utils/vectorMemory'"
if (!s.includes(impNew)) {
  if (!s.includes(impOld)) { console.error('FAIL: import anchor not found'); process.exit(1) }
  s = s.replace(impOld, impNew)
}

// 2. replace 0-hits detail block
const blkOld = `    traceStore.updateStep(memoryStepIdx, 'done', {
      detail: hits.length > 0
        ? \`命中 \${hits.length} 条历史记忆（\${hits.map(h => h.type).join('、')}）\`
        : '无相似记忆'
    })`
const blkNew = `    let _detail
    if (hits.length > 0) {
      _detail = \`命中 \${hits.length} 条历史记忆（\${hits.map(h => h.type).join('、')}）\`
    } else {
      // P0-3 诊断探针：0 命中时暴露根因（库空 / 旧向量残留 / userId 不匹配）
      try {
        const _stats = getMemoryStats()
        const _best = queryMemory(userInput, { topK: 1, minScore: 0 })
        _detail = \`无相似记忆（库内\${_stats.count}条，最高相似度\${_best[0] ? _best[0].score : 0}，阈值0.18）\`
      } catch (_) {
        _detail = '无相似记忆'
      }
    }
    traceStore.updateStep(memoryStepIdx, 'done', { detail: _detail })`
if (!s.includes(blkOld)) { console.error('FAIL: detail block not found'); process.exit(1) }
s = s.replace(blkOld, blkNew)

fs.writeFileSync(p, s, 'utf8')
console.log('PATCH OK')
