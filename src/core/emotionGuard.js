// 情绪/危机信号确定性拦截（安全护栏，优先于 LLM 意图识别）
// 设计依据（8/16 试录复现）：学生说"我感觉现在有点抑郁，不想学"被 Router
// 意图识别 LLM 误判为 diagnose 路由到 Diagnose Agent，导致 tutor/student.md
// 的 5.3 安全边界从未触发。本模块在意图识别前做确定性关键词拦截：命中即
// 强制留在 concept（Tutor），不路由到 diagnose/planner/...。原则：误伤成本低
// （Tutor 是默认 handler），真正危害是把情绪信号路由离开 Tutor，关键词宁可宽。

const CRISIS_KEYWORDS = [
  "不想活","想死","想消失","活着没意思","活着没什么意思","想伤害自己",
  "不想存在","了结自己","自杀","自残","自伤","撑不下去","撑不下去了",
  "没有希望","没希望了","没有人在意","没有意义","一切都没意义",
  "想解脱","不如消失","不想醒来"
]

const EMOTION_KEYWORDS = [
  "抑郁","焦虑","崩溃","学不进去","学不进去了","不想学","不想学了",
  "想放弃","压力很大","压力太大","心态崩","心态崩了","自我怀疑",
  "自我否定","很挫败","挫败感","太累了","坚持不下去","考不上",
  "怀疑人生","没自信","没信心","失眠","睡不着","烦躁","没动力",
  "没状态","状态不好","情绪低落","低落","好累","跟不上","学不动"
]

export function detectEmotionSignal(userInput) {
  if (!userInput || typeof userInput !== "string") {
    return { hit: false, level: null, keyword: null }
  }
  const text = userInput
  for (const kw of CRISIS_KEYWORDS) {
    if (text.includes(kw)) return { hit: true, level: "crisis", keyword: kw }
  }
  for (const kw of EMOTION_KEYWORDS) {
    if (text.includes(kw)) return { hit: true, level: "emotion", keyword: kw }
  }
  return { hit: false, level: null, keyword: null }
}

export default { detectEmotionSignal, CRISIS_KEYWORDS, EMOTION_KEYWORDS }
