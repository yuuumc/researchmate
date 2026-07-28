// ============================================================
// 各 Agent 的必填字段 + JSON Schema 形状（v1.5 评审保命 P1）
// ============================================================
// 来源：src/prompts/*.md 中 ```json 围栏块 + src/core/agents/*.js
//      extract*Structure 函数的字段映射
// ============================================================

export const AGENT_SCHEMAS = {
  tutor: {
    name: 'tutor',
    promptFile: 'src/prompts/tutor.md',
    // tutor 不强制 JSON 围栏（输出是 Markdown 教学回答），但要求：
    //   - 区分"定义/推导/比较/应用"4 种问题类型
    //   - 严格分阶梯、不得自问自答
    requiredPromptPhrases: [
      '苏格拉底',
      '定义性',
      '推导性',
      '比较性',
      '应用性',
      '严禁自问自答'
    ],
    outputFormat: 'markdown',
    liveRequiredFields: null
  },
  diagnose: {
    name: 'diagnose',
    promptFile: 'src/prompts/diagnose.md',
    requiredPromptPhrases: [
      '4 层根因链',
      'JSON 块',
      'remediation',
      'weak_points',
      'root_causes',
      'direct_causes',
      'middle_causes'
    ],
    outputFormat: 'markdown+json',
    // LLM 输出 JSON 必须含的字段
    liveRequiredFields: [
      'score',
      'subject',
      'weak_points',
      'direct_causes',
      'middle_causes',
      'root_causes',
      'remediation'
    ]
  },
  planner: {
    name: 'planner',
    promptFile: 'src/prompts/planner.md',
    requiredPromptPhrases: [
      '4 周',
      'JSON 块',
      'weeks',
      'adjustments',
      'keep',
      'strengthen',
      'drop',
      'priority'
    ],
    outputFormat: 'markdown+json',
    liveRequiredFields: [
      'target_stage',
      'weeks',
      'adjustments'
    ]
  },
  admission: {
    name: 'admission',
    promptFile: 'src/prompts/admission.md',
    requiredPromptPhrases: [
      '3 档',
      '冲刺',
      '稳妥',
      '保底',
      'JSON 块',
      'recommendations',
      'reason',
      'school',
      'tier',
      // v1 §6.5 铁律：硬约束
      '不得编造任何数字字段',
      '不得编造 URL'
    ],
    outputFormat: 'markdown+json',
    liveRequiredFields: [
      'recommendations'
    ],
    // admission 任务里，用户输入和 LLM 输出 reason 都不得含数字字段
    forbiddenInReason: [
      { id: 'score_line', re: /\b\d{2,3}\s*分(?!\w)/, label: '疑似分数线' },
      { id: 'ratio', re: /\b\d+(?:\.\d+)?\s*[:：]\s*1\b/, label: '疑似报录比' },
      { id: 'percent', re: /\b\d{1,3}\s*%/, label: '疑似百分比' },
      { id: 'enrollment', re: /招\s*(?:生\s*)?\d+\s*人/, label: '疑似招生人数' },
      { id: 'year', re: /\b20\d{2}\s*年\b/, label: '疑似年份' }
    ]
  },
  research: {
    name: 'research',
    promptFile: 'src/prompts/research.md',
    requiredPromptPhrases: [
      'JSON 块',
      'undergrad_path',
      'research_path',
      'papers',
      'projects',
      'tech_stack',
      // v1 硬约束：论文必须真实存在
      '不得编造',
      '真实存在'
    ],
    outputFormat: 'markdown+json',
    liveRequiredFields: [
      'direction',
      'undergrad_path',
      'research_path',
      'papers',
      'projects',
      'tech_stack'
    ]
  }
}
