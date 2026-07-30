// ============================================================
// Multi-LLM Provider Abstraction Layer (v3.0 队长保留件)
// ============================================================
// 支持 any OpenAI-compatible API：DeepSeek / OpenAI / Groq / 硅基流动 / ...
//
// 配置（env vars）：
//   LLM_PROVIDER=deepseek|openai|groq|custom  (默认 deepseek)
//   LLM_API_KEY=sk-...                        (回退到 DEEPSEEK_API_KEY，向后兼容)
//   LLM_BASE_URL=https://api.deepseek.com/v1  (每个 provider 有默认值)
//   LLM_MODEL=deepseek-chat                   (每个 provider 有默认值)
//
// 用法：
//   import { getProviderConfig, validateProviderConfig } from './llm-provider.js'
//   const config = getProviderConfig()
//   const { valid, error } = validateProviderConfig(config)
//   if (!valid) return res.status(500).json({ error: 'provider_not_configured', message: error })
//   fetch(config.chatUrl, { headers: { Authorization: `Bearer ${config.apiKey}` }, ... })
// ============================================================

const PROVIDER_DEFAULTS = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    apiKeyEnv: 'GROQ_API_KEY',
  },
  'silicon-flow': {
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3',
    apiKeyEnv: 'SILICON_FLOW_API_KEY',
  },
}

export function getProviderConfig(overrides = {}) {
  const providerName = (overrides.provider || process.env.LLM_PROVIDER || 'deepseek').toLowerCase()
  const defaults = PROVIDER_DEFAULTS[providerName] || PROVIDER_DEFAULTS.deepseek

  const baseUrl = overrides.baseUrl || process.env.LLM_BASE_URL || defaults.baseUrl
  const apiKey = overrides.apiKey || process.env.LLM_API_KEY || process.env[defaults.apiKeyEnv]
  const model = overrides.model || process.env.LLM_MODEL || defaults.model

  return {
    provider: providerName,
    baseUrl,
    chatUrl: `${baseUrl}/chat/completions`,
    apiKey,
    model,
  }
}

export function validateProviderConfig(config) {
  if (!config.apiKey) {
    const defaults = PROVIDER_DEFAULTS[config.provider]
    const envVar = defaults ? defaults.apiKeyEnv : 'LLM_API_KEY'
    return {
      valid: false,
      error: `${config.provider} API key not configured (set ${envVar} or LLM_API_KEY)`,
    }
  }
  if (!config.baseUrl) {
    return { valid: false, error: 'LLM_BASE_URL not configured' }
  }
  return { valid: true }
}

export function buildHeaders(config) {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  }
}

export function buildMessages(prompt, userInput) {
  return [
    { role: 'system', content: prompt },
    { role: 'user', content: userInput },
  ]
}

export function listProviders() {
  return Object.entries(PROVIDER_DEFAULTS).map(([name, config]) => ({
    name,
    baseUrl: config.baseUrl,
    defaultModel: config.model,
    apiKeyEnv: config.apiKeyEnv,
  }))
}
