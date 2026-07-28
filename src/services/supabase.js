// ============================================================
// Supabase client 单例（v2.0 多用户 SaaS · 数据层）
// ============================================================
// 直连 + RLS，不走 /api/* 代理
// 配置来源：import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// 真实值由部署环境注入，本地复制 .env.example 为 .env 后填入
//
// 教师身份 = 双源（user_metadata.role UI 速判 + classes.teacher_id 业务真相）
// RLS 用 auth.uid() 鉴权，前端不传 user_id
// ============================================================
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY 未配置，' +
    '多用户同步 / 教师侧功能将不可用。复制 .env.example 为 .env 并填入。'
  )
}

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'yanxintong.auth.token',
      // 翻转 token 刷新阈值（默认 60s 改为 30s，移动端网络抖动更稳）
      autoRefreshThresholdSeconds: 30
    },
    realtime: {
      // v2.0 数据层暂不订阅实时流，留 v2.5 接入
      params: { eventsPerSecond: 0 }
    }
  }
)

export const SUPABASE_URL = url || ''
export const SUPABASE_ANON_KEY = anonKey || ''

/** 是否已配置真实值（用于 UI 屏蔽多用户功能入口） */
export const isSupabaseConfigured = Boolean(url && anonKey)
