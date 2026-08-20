/**
 * F1 画像引擎地基 — 契约测试
 * 覆盖 GWT1-GWT4 四条验收标准
 * Run: node tests/test-f1-masteryEngine.mjs
 *
 * 刻度说明：mastery 统一为 0-1 归一化刻度（与 masteryEngine.js 实现、
 * profile.js migrateMasteryScale 一次性迁移口径一致；旧 0-100 数据加载时
 * 由 migrateMasteryScale ÷100 归一）。本测试于刻度迁移后对齐到 0-1。
 */
import { profileBus, EVT } from '../src/core/profileBus.js'
import {
  applyDecay,
  applyLearningEvent,
  applySnapshot,
  decayAll,
  masteryToStars,
  starsToMastery,
  confidenceFromAttempts,
} from '../src/core/masteryEngine.js'

let totalPass = 0, totalFail = 0
function check(label, cond) {
  if (cond) { totalPass++; console.log('  \u2713 ' + label) }
  else { totalFail++; console.log('  \u2717 ' + label) }
}

// ============================================================
// GWT4: 衰减边界
// ============================================================
console.log('\n--- GWT4: 衰减边界 ---')

// 0 天衰减：mastery 不变
const _now0 = new Date().toISOString()
const ks0 = { mastery: 0.8, confidence: 0.5, lastStudied: _now0, attempts: 5, correctRate: 0.6, errorTypes: {} }
const decayed0 = applyDecay(ks0, _now0)
check('衰减 0 天：mastery 不变', decayed0.mastery === 0.8)

// 30 天衰减：mastery 下降
const oldDate = new Date(Date.now() - 30 * 86400000).toISOString()
const ks30 = { mastery: 0.8, confidence: 0.5, lastStudied: oldDate, attempts: 5, correctRate: 0.6, errorTypes: {} }
const decayed30 = applyDecay(ks30, new Date().toISOString())
check('衰减 30 天：mastery 下降', decayed30.mastery < 0.8)
check('衰减 30 天：mastery 约 0.8*exp(-1.5) 约 0.178', decayed30.mastery > 0.15 && decayed30.mastery < 0.21)

// decayAll
const ksMap = {
  'topic_a': { mastery: 0.8, confidence: 0.5, lastStudied: oldDate, attempts: 5, correctRate: 0.6, errorTypes: {} },
  'topic_b': { mastery: 0.6, confidence: 0.3, lastStudied: new Date().toISOString(), attempts: 2, correctRate: 0.5, errorTypes: {} },
}
const { map: decayedMap, changed } = decayAll(ksMap, new Date().toISOString())
check('decayAll：7天知识点 mastery 下降', decayedMap['topic_a'].mastery < 0.8)
check('decayAll：changed=true（有衰减）', changed === true)

// ============================================================
// GWT4: 题型加权边界
// ============================================================
console.log('\n--- GWT4: 题型加权边界 ---')

const baseKS = { mastery: 0.5, confidence: 0.5, lastStudied: new Date().toISOString(), attempts: 5, correctRate: 0.6, errorTypes: {} }

const afterDerivation = applyLearningEvent({ ...baseKS }, { topic: 't1', outcome: 'correct', questionType: 'derivation', timestamp: new Date().toISOString() })
const afterEssay = applyLearningEvent({ ...baseKS }, { topic: 't2', outcome: 'correct', questionType: 'essay', timestamp: new Date().toISOString() })
const afterChoice = applyLearningEvent({ ...baseKS }, { topic: 't3', outcome: 'correct', questionType: 'choice', timestamp: new Date().toISOString() })
const afterPractice = applyLearningEvent({ ...baseKS }, { topic: 't4', outcome: 'correct', questionType: 'practice', timestamp: new Date().toISOString() })

check('权重：推导(1.0) > 主观(0.8)', afterDerivation.mastery > afterEssay.mastery)
check('权重：主观(0.8) > 客观(0.5)', afterEssay.mastery > afterChoice.mastery)
check('权重：推导(1.0) > 练习(0.5)', afterDerivation.mastery > afterPractice.mastery)
check('答对：推导 mastery 增幅 > 客观题', (afterDerivation.mastery - 0.5) > (afterChoice.mastery - 0.5))

// ============================================================
// GWT4: 置信度边界（attempts=1 vs 50）
// ============================================================
console.log('\n--- GWT4: 置信度边界（attempts=1 vs 50）---')

check('confidence: attempts=1 -> 0.5', confidenceFromAttempts(1) === 0.5)
check('confidence: attempts=50 -> 0.98', Math.abs(confidenceFromAttempts(50) - 0.98) < 0.01)
check('confidence: attempts=0 -> 0', confidenceFromAttempts(0) === 0)

const ksLowAttempts = { mastery: 0.5, confidence: 0.5, lastStudied: new Date().toISOString(), attempts: 1, correctRate: 0.5, errorTypes: {} }
const ksHighAttempts = { mastery: 0.5, confidence: 0.98, lastStudied: new Date().toISOString(), attempts: 50, correctRate: 0.8, errorTypes: {} }

const afterLowAttempts = applyLearningEvent({ ...ksLowAttempts }, { topic: 't', outcome: 'correct', questionType: 'choice', timestamp: new Date().toISOString() })
const afterHighAttempts = applyLearningEvent({ ...ksHighAttempts }, { topic: 't', outcome: 'correct', questionType: 'choice', timestamp: new Date().toISOString() })

check('attempts=1 单次增幅 > attempts=50', (afterLowAttempts.mastery - 0.5) > (afterHighAttempts.mastery - 0.5))
check('attempts=50 单次影响 < 0.01（0-1 刻度下 1 个百分点）', Math.abs(afterHighAttempts.mastery - 0.5) < 0.01)

// ============================================================
// GWT1: 答错学习事件
// ============================================================
console.log('\n--- GWT1: 答错学习事件 ---')

const ksBefore = { mastery: 0.6, confidence: 0.8, lastStudied: new Date(Date.now() - 86400000).toISOString(), attempts: 4, correctRate: 0.75, errorTypes: { choice: 1 } }
const wrongEvent = { topic: 'test_topic', outcome: 'incorrect', questionType: 'choice', errorType: 'choice', timestamp: new Date().toISOString() }
const ksAfterWrong = applyLearningEvent({ ...ksBefore }, wrongEvent)

check('答错后 mastery 下降', ksAfterWrong.mastery < 0.6)
check('答错后 attempts+1 (4->5)', ksAfterWrong.attempts === 5)
check('答错后 errorTypes.choice +1 (1->2)', ksAfterWrong.errorTypes.choice === 2)
check('答错后 lastStudied 更新', ksAfterWrong.lastStudied !== ksBefore.lastStudied)
check('答错后 correctRate 下降', ksAfterWrong.correctRate < 0.75)

const correctEvent = { topic: 'test_topic', outcome: 'correct', questionType: 'choice', timestamp: new Date().toISOString() }
const ksAfterCorrect = applyLearningEvent({ ...ksBefore }, correctEvent)

check('答对后 mastery 上升', ksAfterCorrect.mastery > 0.6)
check('答对后 attempts+1', ksAfterCorrect.attempts === 5)
check('答对后 errorTypes 不变', ksAfterCorrect.errorTypes.choice === 1)

// ============================================================
// GWT3: 遗忘衰减（7天）
// ============================================================
console.log('\n--- GWT3: 遗忘衰减（7天）---')

const ks7 = { mastery: 0.8, confidence: 0.8, lastStudied: new Date(Date.now() - 7 * 86400000).toISOString(), attempts: 10, correctRate: 0.8, errorTypes: {} }
const decayed7 = applyDecay({ ...ks7 }, new Date().toISOString())

check('7天衰减后 mastery < 0.8', decayed7.mastery < 0.8)
check('7天衰减约 0.8*exp(-0.35) 约 0.564', decayed7.mastery > 0.50 && decayed7.mastery < 0.62)
check('衰减后 lastStudied 不变', decayed7.lastStudied === ks7.lastStudied)

// 快照测试
const snapKS = applySnapshot({ mastery: 0.8, attempts: 10, lastStudied: 'old' }, { mastery: 0.4, timestamp: new Date().toISOString() })
check('快照设定 mastery=0.4', snapKS.mastery === 0.4)
check('快照保留 attempts=10', snapKS.attempts === 10)
check('快照更新 lastStudied', snapKS.lastStudied !== 'old')

// mastery <-> stars 转换
check('mastery 0.4 -> 2星(weak)', masteryToStars(0.4) === 2)
check('mastery 0.6 -> 3星(dev)', masteryToStars(0.6) === 3)
check('mastery 0.8 -> 4星(strength)', masteryToStars(0.8) === 4)
check('mastery 1.0 -> 5星', masteryToStars(1.0) === 5)
check('stars 3 -> mastery 0.6', starsToMastery(3) === 0.6)

// ============================================================
// GWT1/GWT2: 事件总线 -> store -> 广播（直接集成测试）
// ============================================================
console.log('\n--- GWT1/GWT2: 事件总线 -> store -> 广播 ---')

// 模拟 store：监听 profileBus 事件，维护 knowledge_state
const mockStore = {
  knowledge_state: {},
  ability_stars: {},
  broadcastCount: 0,
  broadcastTopics: [],
  init() {
    profileBus.on(EVT.LEARNING_EVENT, (ev) => this.recordLearningEvent(ev))
    profileBus.on(EVT.MASTERY_SNAPSHOT, (snap) => this.applyMasterySnapshot(snap))
    profileBus.on(EVT.PROFILE_UPDATED, (payload) => {
      this.broadcastCount++
      this.broadcastTopics = payload.topics || []
    })
  },
  recordLearningEvent(event) {
    const topic = event.topic
    if (!topic) return
    const prevKS = this.knowledge_state[topic] || null
    const newKS = applyLearningEvent(prevKS, event)
    this.knowledge_state[topic] = newKS
    this.ability_stars[topic] = masteryToStars(newKS.mastery)
    profileBus.emit(EVT.PROFILE_UPDATED, { source: 'learning-event', topics: [topic] })
  },
  applyMasterySnapshot(payload) {
    const items = payload && payload.items || []
    if (items.length === 0) return
    const now = payload.timestamp || new Date().toISOString()
    const topics = []
    for (const it of items) {
      if (!it.topic) continue
      this.knowledge_state[it.topic] = applySnapshot(this.knowledge_state[it.topic], { mastery: it.mastery, timestamp: now })
      this.ability_stars[it.topic] = masteryToStars(this.knowledge_state[it.topic].mastery)
      topics.push(it.topic)
    }
    profileBus.emit(EVT.PROFILE_UPDATED, { source: 'mastery-snapshot', topics })
  },
}

mockStore.init()

// GWT1: 答错事件 -> store 更新 knowledge_state + 广播
profileBus.emit(EVT.LEARNING_EVENT, {
  topic: '高等数学',
  outcome: 'incorrect',
  questionType: 'derivation',
  errorType: 'derivation',
  timestamp: new Date().toISOString(),
})
check('答错后 knowledge_state 有记录', mockStore.knowledge_state['高等数学'] !== undefined)
check('答错后 mastery 未达满值', mockStore.knowledge_state['高等数学'].mastery < 1.0)
check('答错后 attempts=1', mockStore.knowledge_state['高等数学'].attempts === 1)
check('答错后 errorTypes 有记录', mockStore.knowledge_state['高等数学'].errorTypes.derivation === 1)
check('答错后 ability_stars 同步', mockStore.ability_stars['高等数学'] !== undefined)

// GWT2: 广播 profile-updated 触发
check('广播已触发 (broadcastCount>0)', mockStore.broadcastCount > 0)
check('广播包含正确的 topic', mockStore.broadcastTopics.includes('高等数学'))

// GWT2: 多模块同步（另一个监听者收到广播）
let moduleB_received = false
let moduleB_topics = []
profileBus.on(EVT.PROFILE_UPDATED, (payload) => {
  moduleB_received = true
  moduleB_topics = payload.topics || []
})

// 再发一个答对事件
profileBus.emit(EVT.LEARNING_EVENT, {
  topic: '线性代数',
  outcome: 'correct',
  questionType: 'choice',
  timestamp: new Date().toISOString(),
})
check('模块B 收到广播', moduleB_received)
check('模块B 收到正确的 topic', moduleB_topics.includes('线性代数'))
check('答对后 mastery 上升', mockStore.knowledge_state['线性代数'].mastery > 0)
check('答对后 attempts=1', mockStore.knowledge_state['线性代数'].attempts === 1)
check('答对后 errorTypes 为空对象', Object.keys(mockStore.knowledge_state['线性代数'].errorTypes).length === 0)

// GWT2: mastery-snapshot 批量设定
profileBus.emit(EVT.MASTERY_SNAPSHOT, {
  items: [
    { topic: '概率论', mastery: 0.8, source: 'diagnosis' },
    { topic: '数理统计', mastery: 0.4, source: 'diagnosis' },
  ],
  timestamp: new Date().toISOString(),
})
check('快照后 概率论 mastery=0.8', mockStore.knowledge_state['概率论'].mastery === 0.8)
check('快照后 数理统计 mastery=0.4', mockStore.knowledge_state['数理统计'].mastery === 0.4)
check('快照后 概率论 -> 4星', mockStore.ability_stars['概率论'] === 4)
check('快照后 数理统计 -> 2星', mockStore.ability_stars['数理统计'] === 2)

// 清理
profileBus.clear()

// ============================================================
// 汇总
// ============================================================
console.log('')
console.log('========================================')
console.log('F1 契约测试汇总: ' + totalPass + ' passed, ' + totalFail + ' failed')
console.log('========================================')
if (totalFail > 0) {
  console.log('\n\u2717 FAIL')
  process.exit(1)
} else {
  console.log('\n\u2713 ALL GREEN')
  process.exit(0)
}
