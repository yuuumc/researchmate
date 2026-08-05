// ============================================================
// Profile Service — Supabase profiles 表 CRUD（v2.0 用户系统）
// ============================================================
// 数据层：直连 Supabase，RLS 用 auth.uid() 鉴权
// 调用方：ProfileWizard.vue（写入）、ProfileView（读取/编辑）
// ============================================================

import { supabase, isSupabaseConfigured } from '@/services/supabase'

/**
 * 加载当前登录用户的 profile
 * @returns {Promise<object|null>} profile 行或 null
 */
export async function loadProfile() {
  if (!isSupabaseConfigured) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[profileService] loadProfile error:', error)
    throw error
  }
  return data
}

/**
 * 保存（upsert）profile 数据
 * @param {object} updates — 要更新的字段
 * @returns {Promise<object>} 保存后的 profile 行
 */
export async function saveProfile(updates) {
  if (!isSupabaseConfigured) throw new Error('Supabase 未配置')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')

  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      user_id: user.id,
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('[profileService] saveProfile error:', error)
    throw error
  }
  return data
}

/**
 * 标记向导完成
 */
export async function completeWizard() {
  return saveProfile({ wizard_completed: true })
}

/**
 * 检查用户是否需要完成向导
 * @returns {Promise<boolean>} true = 需要完成向导
 */
export async function needsWizard() {
  if (!isSupabaseConfigured) return false
  try {
    const profile = await loadProfile()
    // profile 不存在或 wizard_completed !== true
    return !profile || !profile.wizard_completed
  } catch (e) {
    console.warn('[profileService] needsWizard check failed:', e)
    return false
  }
}
