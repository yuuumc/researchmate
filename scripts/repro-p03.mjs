// repro-p03.mjs - P0-3 recall reproduction (full chain)
import { addMemory, queryMemory, getMemoryStats } from '../src/utils/vectorMemory.js'
import { textToVector, cosineSimilarity } from '../src/utils/vector.js'
import { tokenize } from '../src/utils/tokenize.js'

const store = new Map()
globalThis.localStorage = {
  getItem: k => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear()
}

const QUERIES = ['MOS管的开启电压怎么回事', 'MOSFET阈值电压怎么推导', '帮我做复习计划']
const WRITE_TEXT = '半导体物理考了55分，薄弱点:MOSFET阈值电压'

function runScenario(name, setup) {
  console.log(`\n=== ${name} ===`)
  store.clear()
  setup()
  const w = addMemory('diagnosis', WRITE_TEXT)
  console.log('write:', w ? 'ok id=' + w.id : 'NULL')
  console.log('stats:', JSON.stringify(getMemoryStats()))
  const wv = textToVector(`diagnosis ${WRITE_TEXT}`)
  for (const q of QUERIES) {
    const qv = textToVector(q)
    const sim = cosineSimilarity(qv, wv)
    const hits = queryMemory(q, { topK: 3, minScore: 0.18 })
    console.log(`  q="${q}" rawSim=${sim.toFixed(3)} hits=${hits.length}`, hits.map(h => h.score + ':' + h.text.slice(0, 15)))
  }
}

runScenario('A userId 一致 (u123)', () => {
  localStorage.setItem('user_id', 'u123')
})

runScenario('B 写入时u123 查询时换成 different_user', () => {
  localStorage.setItem('user_id', 'u123')
  addMemory('diagnosis', WRITE_TEXT)
  localStorage.setItem('user_id', 'different_user')
})

runScenario('C 无 user_id key (default)', () => {
  localStorage.removeItem('user_id')
  addMemory('diagnosis', WRITE_TEXT)
})

runScenario('D 写入时default 查询时登录user_id出现', () => {
  localStorage.removeItem('user_id')
  addMemory('diagnosis', WRITE_TEXT)
  localStorage.setItem('user_id', 'logged_in_user')
})

runScenario('E 旧向量(无bigram)写入 + 新向量查询 —— 模拟残留localStorage', () => {
  // 手工构造一条 old-format (无bigram) 向量写入
  localStorage.setItem('user_id', 'u123')
  const oldVec = new Float64Array(256)
  const tokens = tokenize(`diagnosis ${WRITE_TEXT}`)
  for (const tk of tokens) oldVec[((((str, seed = 42) => { let h = 2166136261 ^ seed; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 })(tk)) % 256)] += 1
  let n = 0; for (let i = 0; i < oldVec.length; i++) n += oldVec[i] * oldVec[i]; n = Math.sqrt(n); if (n > 0) for (let i = 0; i < oldVec.length; i++) oldVec[i] /= n
  const memories = [{ id: 'old-mem', type: 'diagnosis', text: WRITE_TEXT, vector: Array.from(oldVec), ts: Date.now(), userId: 'u123', meta: {} }]
  store.set('vector_memory', JSON.stringify(memories))
})

console.log('\n=== tokens ===')
console.log('write:', tokenize(`diagnosis ${WRITE_TEXT}`))
console.log('query:', tokenize('MOS管的开启电压怎么回事'))
