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

// P0 危机短路（8/20）：prompt 5.3 固定安全话术，原样输出，不调 LLM。
// 根因：DeepSeek 安全过滤拦截自残/自杀内容 → upstream_error 2/2 失败。
//       emotionGuard 正确拦截了危机信号，但 router 仍会调 tutorAgent → LLM，
//       DeepSeek 直接拒绝。修复：危机命中时绕过 LLM，硬编码返回此话术。
//       话术与 src/prompts/v2/tutor/student.md §5.3 逐字一致。
export const CRISIS_SAFETY_RESPONSE = `我听到你了。你现在愿意说出来，这本身就很勇敢。你的感受很重要，此刻的情绪不是软弱，也不是你一个人该独自扛的事。

我只是一个学习助手，没办法代替专业的人陪着你，但有人可以。请你现在就联系下面任意一条热线，他们 24 小时都在，免费、保密：
- 全国心理援助热线：12356
- 北京市心理援助热线：010-82951332（手机）/ 800-810-1117（座机），24 小时
- 也可以拨打当地 12320 卫生热线转心理援助，或前往学校心理咨询中心 / 最近医院的精神心理科。

如果你觉得此刻就有危险，请立刻拨打 120 或 110，或告诉身边一个你信任的人。你不是麻烦，他们会帮你。`

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

export default { detectEmotionSignal, CRISIS_KEYWORDS, EMOTION_KEYWORDS, CRISIS_SAFETY_RESPONSE }
