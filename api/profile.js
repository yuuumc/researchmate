// ============================================================
// 开放 API - 学员画像（v3.0 队长保留件 scaffold）
// ============================================================
// GET  /api/profile?id=xxx        获取学员画像
// POST /api/profile               更新学员画像
// Body: { id: "xxx", updates: { target_school, target_major, exam_date, ... } }
//
// 当前状态：scaffold（返回画像 schema + echo）
// 后续：接入 Supabase profile 表 + 认知模型计算
// ============================================================

const PROFILE_SCHEMA = {
  identity: {
    id: 'string (uuid)',
    nickname: 'string',
    avatar: 'string (url)',
  },
  academic: {
    target_school: 'string',
    target_major: 'string',
    target_direction: 'string',
    exam_date: 'date (YYYY-MM-DD)',
    preparation_stage: 'enum: early|mid|sprint|final',
  },
  cognitive: {
    mastered_topics: 'string[]',
    weak_topics: 'string[]',
    last_diagnosis_score: 'number (0-100)',
    last_diagnosis_date: 'date (YYYY-MM-DD)',
  },
  social: {
    peer_group: 'string | null',
    study_streak_days: 'number',
    total_study_hours: 'number',
  },
}

export default async function handler(req, res) {
  const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
  const requestOrigin = req.headers.origin || ''
  const isSameOrigin = !requestOrigin
  if (!isSameOrigin && !ALLOWED_ORIGINS.includes(requestOrigin)) {
    return res.status(403).json({ error: 'cors_denied' })
  }
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Origin', isSameOrigin ? 'null' : requestOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method === 'GET') {
    const { id } = req.query || {}
    return res.status(200).json({
      status: 'scaffold',
      message: id ? `画像 API 已就绪，待接入 Supabase（查询 ${id}）` : '画像 API 已就绪，待接入 Supabase',
      profileSchema: PROFILE_SCHEMA,
      id: id || null,
    })
  }

  if (req.method === 'POST') {
    const { id, updates } = req.body || {}
    if (!id) return res.status(400).json({ error: 'missing_id' })
    return res.status(200).json({
      status: 'scaffold',
      message: `画像更新 API 已就绪，待接入 Supabase（更新 ${id}）`,
      id,
      receivedUpdates: updates || {},
      profileSchema: PROFILE_SCHEMA,
    })
  }

  return res.status(405).json({ error: 'method_not_allowed' })
}
