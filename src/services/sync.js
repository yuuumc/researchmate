// ============================================================
// 画像同步服务（v2.0 多用户 SaaS · 数据层）
// ============================================================
// 主键 = user_id (UUID)，不接 phone
// profiles 表只有：user_id / role / phone / name / avatar_url / metadata(jsonb)
// 其他认知模型字段全部进 metadata（v1.5 已有 weak/mastered/ability_stars 等）
//
// RLS 用 auth.uid() 鉴权，前端不传 user_id，supabase 自动注入
// ============================================================
import { supabase } from './supabase'
import { useProfileStore } from '@/stores/profile'

/**
 * 画像主键（固定用 user_id，不是 phone）
 * @param {object} profile
 * @returns {string} user_id (UUID)
 */
export function keyFor(profile) {
  if (!profile) throw new Error('[sync] profile is required')
  if (!profile.user_id) {
    throw new Error(
      '[sync] profile.user_id missing, ' +
      'call profile.bindAuthUser(authUser.id) after login first'
    )
  }
  return profile.user_id
}

/**
 * 画像 → profiles row
 * 扁平字段 (role/phone/name/avatar_url) 提到顶层，认知模型字段全进 metadata
 */
export function toRow(profile) {
  return {
    user_id: profile.user_id,
    role: profile.role || 'student',
    phone: profile.phone || null,
    name: profile.name || null,
    avatar_url: profile.avatar_url || null,
    metadata: {
      major: profile.major ?? null,
      target_direction: profile.target_direction ?? null,
      target_school: profile.target_school ?? null,
      target_major: profile.target_major ?? null,
      learning_style: profile.learning_style || 'mixed',
      preparation_stage: profile.preparation_stage || 'initial',
      exam_date: profile.exam_date || null,
      ability_stars: profile.ability_stars || {},
      weak_topics: Array.isArray(profile.weak_topics) ? profile.weak_topics : [],
      mastered_topics: Array.isArray(profile.mastered_topics) ? profile.mastered_topics : [],
      last_diagnosis_score: profile.last_diagnosis_score ?? null,
      last_diagnosis_date: profile.last_diagnosis_date ?? null
    }
  }
}

/**
 * profiles row → 画像
 * 把 metadata 拍平回顶层，保持前端 store 的字段形态不变
 */
export function fromRow(row) {
  if (!row) return null
  const m = row.metadata || {}
  return {
    user_id: row.user_id,
    role: row.role || 'student',
    phone: row.phone || null,
    name: row.name || null,
    avatar_url: row.avatar_url || null,
    // metadata 平铺
    major: m.major ?? null,
    target_direction: m.target_direction ?? null,
    target_school: m.target_school ?? null,
    target_major: m.target_major ?? null,
    learning_style: m.learning_style || 'mixed',
    preparation_stage: m.preparation_stage || 'initial',
    exam_date: m.exam_date || null,
    ability_stars: m.ability_stars || {},
    weak_topics: Array.isArray(m.weak_topics) ? m.weak_topics : [],
    mastered_topics: Array.isArray(m.mastered_topics) ? m.mastered_topics : [],
    last_diagnosis_score: m.last_diagnosis_score ?? null,
    last_diagnosis_date: m.last_diagnosis_date ?? null,
    // row 触发器字段（只读）
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString()
  }
}

/**
 * 推送画像到 Supabase（upsert by user_id）
 * 失败抛错，由调用方 catch 处理（离线/网络/RLS 拒绝）
 * @returns {Promise<{user_id:string, updated_at:string}>}
 */
export async function realPushProfile(profile) {
  const userId = keyFor(profile)
  const row = toRow(profile)
  const { data, error } = await supabase
    .from('profiles')
    .upsert(row, { onConflict: 'user_id' })
    .select('user_id, updated_at')
    .single()
  if (error) {
    console.error('[sync] realPushProfile failed:', error)
    throw error
  }
  return data
}

/**
 * 从 Supabase 拉取当前 auth 用户的画像
 * 找不到返回 null（RLS 拒绝或首次登录）
 * @param {string} [userId] - 不传则用 supabase.auth.getUser() 取当前用户
 * @returns {Promise<object|null>}
 */
export async function realPullProfile(userId) {
  let uid = userId
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    uid = user.id
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', uid)
    .maybeSingle()
  if (error) {
    console.error('[sync] realPullProfile failed:', error)
    throw error
  }
  return data ? fromRow(data) : null
}

/**
 * 拉取后合并到本地 store（保留本地未同步的临时字段）
 * @returns {Promise<object|null>} 远端画像（null=远端无记录）
 */
export async function pullAndMerge() {
  const profile = useProfileStore()
  const remote = await realPullProfile()
  if (remote) {
    // 远端为准（含服务端触发器时间戳），但保留本地 created_at
    profile.updateProfile({
      ...remote,
      created_at: profile.profile.created_at || remote.created_at
    })
  }
  return remote
}
