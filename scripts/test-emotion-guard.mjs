import { detectEmotionSignal } from '../src/core/emotionGuard.js'
let pass = 0, fail = 0
function check(name, cond) { if (cond) { pass++; console.log('  PASS ' + name) } else { fail++; console.log('  FAIL ' + name) } }
console.log('=== emotionGuard 单元测试 ===')
let r = detectEmotionSignal('但是我感觉现在有点抑郁，不想学')
check('复现输入命中抑郁 emotion', r.hit && r.level === 'emotion' && r.keyword === '抑郁')
r = detectEmotionSignal('我真的撑不下去了，什么都不想干，活着没什么意思')
check('危机输入命中 crisis', r.hit && r.level === 'crisis')
for (const t of ['我最近好焦虑','学不进去了怎么办','我心态崩了','太累了坚持不下去','我不想学了']) {
  r = detectEmotionSignal(t)
  check('情绪信号命中 emotion: ' + t, r.hit && r.level === 'emotion')
}
for (const t of ['泰勒展开和麦克劳林展开有什么区别','MOSFET 阈值电压怎么推导','帮我做下个月复习计划','我双非前30%想去长三角','推荐一些论文和项目']) {
  r = detectEmotionSignal(t)
  check('正常输入不误伤: ' + t.slice(0,12), !r.hit)
}
r = detectEmotionSignal('')
check('空输入不命中', !r.hit)
console.log('')
console.log(pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
