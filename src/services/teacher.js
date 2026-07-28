// ============================================================
// 教师侧服务（v2.0 多用户 SaaS · 数据层）
// ============================================================
// 6 个真实方法：班级 CRUD + 班级学生列表 + 学生画像 + 班级学情
// 直连 Supabase + RLS，业务真相 = classes.teacher_id = auth.uid()
// UI 速判用 user_metadata.role，业务过滤全靠 RLS
// ============================================================
import { supabase } from './supabase'

/** 6 位邀请码（去 0/O/1/I 避免视觉混淆），不查重（极低概率冲突由 UI 提示重试） */
function genInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)]
  }
  return s
}

/**
 * 教师列出自己名下非归档班级
 * 返回字段含 student_count + avg_ability（客户端聚合 class_members + profiles）
 * @returns {Promise<Array<{
 *   id, name, subject, invite_code, teacher_id, created_at, archived_at,
 *   student_count, avg_ability
 * }>>}
 */
export async function realListClasses() {
  const { data: classes, error: e1 } = await supabase
    .from('classes')
    .select('*')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
  if (e1) {
    console.error('[teacher] realListClasses classes query failed:', e1)
    throw e1
  }
  if (!classes || classes.length === 0) return []

  // 聚合 class_members 算 student_count
  const classIds = classes.map((c) => c.id)
  const { data: members, error: e2 } = await supabase
    .from('class_members')
    .select('class_id, student_id')
    .in('class_id', classIds)
  if (e2) {
    console.error('[teacher] realListClasses members query failed:', e2)
    throw e2
  }
  const countMap = {}
  const studentIds = new Set()
  for (const m of members || []) {
    countMap[m.class_id] = (countMap[m.class_id] || 0) + 1
    studentIds.add(m.student_id)
  }

  // 批量取 profiles 的 metadata.ability_stars 算平均能力
  const abilityMap = {}
  if (studentIds.size > 0) {
    const { data: profs, error: e3 } = await supabase
      .from('profiles')
      .select('user_id, metadata')
      .in('user_id', Array.from(studentIds))
    if (e3) {
      console.error('[teacher] realListClasses profiles query failed:', e3)
      // 不阻塞，能力字段为 null
    } else {
      for (const p of profs || []) {
        const stars = (p.metadata && p.metadata.ability_stars) || {}
        const topics = Object.values(stars)
        const avg = topics.length > 0
          ? topics.reduce((s, v) => s + v, 0) / topics.length
          : 0
        abilityMap[p.user_id] = avg
      }
    }
  }

  // 按班级聚合平均能力
  const classAvgAbility = {}
  for (const m of members || []) {
    const a = abilityMap[m.student_id]
    if (a == null) continue
    if (!classAvgAbility[m.class_id]) classAvgAbility[m.class_id] = { sum: 0, n: 0 }
    classAvgAbility[m.class_id].sum += a
    classAvgAbility[m.class_id].n += 1
  }

  return classes.map((c) => ({
    id: c.id,
    name: c.name,
    subject: c.subject,
    invite_code: c.invite_code,
    teacher_id: c.teacher_id,
    created_at: c.created_at,
    archived_at: c.archived_at,
    student_count: countMap[c.id] || 0,
    avg_ability: classAvgAbility[c.id]
      ? Math.round((classAvgAbility[c.id].sum / classAvgAbility[c.id].n) * 100) / 100
      : null
  }))
}

/**
 * 教师新建班级（客户端生成 6 位 invite_code）
 * @param {{ name: string, subject?: string }} payload
 * @returns {Promise<object>} 完整班级行
 */
export async function realCreateClass({ name, subject }) {
  if (!name || !name.trim()) {
    throw new Error('[teacher] class name is required')
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('[teacher] not authenticated')
  const row = {
    teacher_id: user.id,
    name: name.trim(),
    subject: subject || 'microelectronics',
    invite_code: genInviteCode()
  }
  const { data, error } = await supabase
    .from('classes')
    .insert(row)
    .select('*')
    .single()
  if (error) {
    console.error('[teacher] realCreateClass failed:', error)
    throw error
  }
  return data
}

/**
 * 教师更新班级（name / subject）
 * @returns {Promise<object|null>} null = 无更新
 */
export async function realUpdateClass(classId, { name, subject } = {}) {
  if (!classId) throw new Error('[teacher] classId is required')
  const updates = {}
  if (name !== undefined) updates.name = name
  if (subject !== undefined) updates.subject = subject
  if (Object.keys(updates).length === 0) return null
  const { data, error } = await supabase
    .from('classes')
    .update(updates)
    .eq('id', classId)
    .select('*')
    .single()
  if (error) {
    console.error('[teacher] realUpdateClass failed:', error)
    throw error
  }
  return data
}

/**
 * 教师归档班级（soft delete：写 archived_at，不真删）
 * @returns {Promise<{id:string, archived_at:string}>}
 */
export async function realDeleteClass(classId) {
  if (!classId) throw new Error('[teacher] classId is required')
  const { data, error } = await supabase
    .from('classes')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', classId)
    .select('id, archived_at')
    .single()
  if (error) {
    console.error('[teacher] realDeleteClass failed:', error)
    throw error
  }
  return data
}

/**
 * 教师列出班级学生（含最近一次诊断的关键字段）
 * @returns {Promise<Array<{
 *   student_id, name, phone, joined_at,
 *   last_diagnosis_score, last_diagnosis_date
 * }>>}
 */
export async function realListStudents(classId) {
  if (!classId) throw new Error('[teacher] classId is required')
  const { data: members, error: e1 } = await supabase
    .from('class_members')
    .select('student_id, joined_at')
    .eq('class_id', classId)
  if (e1) {
    console.error('[teacher] realListStudents members failed:', e1)
    throw e1
  }
  if (!members || members.length === 0) return []

  const studentIds = members.map((m) => m.student_id)
  const [{ data: profs, error: e2 }, { data: diagnoses, error: e3 }] = await Promise.all([
    supabase
      .from('profiles')
      .select('user_id, name, phone, metadata')
      .in('user_id', studentIds),
    supabase
      .from('diagnoses')
      .select('user_id, scores, created_at')
      .in('user_id', studentIds)
      .order('created_at', { ascending: false })
  ])
  if (e2) {
    console.error('[teacher] realListStudents profiles failed:', e2)
    throw e2
  }
  if (e3) {
    console.error('[teacher] realListStudents diagnoses failed:', e3)
    throw e3
  }
  const profMap = new Map((profs || []).map((p) => [p.user_id, p]))
  // 取每个学生的最近一次诊断（已按 created_at desc 排序，取首条）
  const lastDiag = {}
  for (const d of diagnoses || []) {
    if (!lastDiag[d.user_id]) lastDiag[d.user_id] = d
  }

  return members.map((m) => {
    const p = profMap.get(m.student_id)
    const meta = (p && p.metadata) || {}
    const ld = lastDiag[m.student_id]
    return {
      student_id: m.student_id,
      name: (p && p.name) || null,
      phone: (p && p.phone) || null,
      joined_at: m.joined_at,
      last_diagnosis_score: (ld && ld.scores && ld.scores.overall) || meta.last_diagnosis_score || null,
      last_diagnosis_date: (ld && ld.created_at) || meta.last_diagnosis_date || null
    }
  })
}

/**
 * 教师查看单个学生画像（profiles + 最近 5 次诊断）
 * @returns {Promise<{profile: object, recent_diagnoses: Array}>}
 */
export async function realGetStudentProfile(studentId) {
  if (!studentId) throw new Error('[teacher] studentId is required')
  const [{ data: prof, error: e1 }, { data: diags, error: e2 }] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('user_id', studentId)
      .maybeSingle(),
    supabase
      .from('diagnoses')
      .select('id, subject, scores, weak, mastered, created_at')
      .eq('user_id', studentId)
      .order('created_at', { ascending: false })
      .limit(5)
  ])
  if (e1) {
    console.error('[teacher] realGetStudentProfile profile failed:', e1)
    throw e1
  }
  if (e2) {
    console.error('[teacher] realGetStudentProfile diagnoses failed:', e2)
    throw e2
  }
  return {
    profile: prof,
    recent_diagnoses: diags || []
  }
}

/**
 * 教师班级学情聚合（4 概览卡 + 3 图字段）
 * 数据源：class_stats VIEW + 班级学生 profiles + diagnoses
 * 客户端聚合能力分布 / 薄弱点 top10 / 学科分布
 * @returns {Promise<{
 *   student_count, total_diagnoses, avg_reasoning,
 *   ability_distribution: {1:n, 2:n, 3:n, 4:n, 5:n},
 *   weak_top_topics: Array<{topic, count}>,
 *   subject_distribution: Array<{subject, count}>
 * }>}
 */
export async function realGetClassStats(classId) {
  if (!classId) throw new Error('[teacher] classId is required')

  // 1. class_stats VIEW 拿 student_count / total_diagnoses / avg_reasoning
  const { data: stats, error: e1 } = await supabase
    .from('class_stats')
    .select('*')
    .eq('class_id', classId)
    .maybeSingle()
  if (e1) {
    console.error('[teacher] realGetClassStats view failed:', e1)
    throw e1
  }

  // 2. 班级学生 id 列表
  const { data: members, error: e2 } = await supabase
    .from('class_members')
    .select('student_id')
    .eq('class_id', classId)
  if (e2) {
    console.error('[teacher] realGetClassStats members failed:', e2)
    throw e2
  }
  const studentIds = (members || []).map((m) => m.student_id)

  // 3. 批量取 profiles + diagnoses（学生为空时跳过）
  let profs = []
  let diags = []
  if (studentIds.length > 0) {
    const [pr, dr] = await Promise.all([
      supabase.from('profiles').select('user_id, metadata').in('user_id', studentIds),
      supabase.from('diagnoses').select('subject, weak').in('user_id', studentIds)
    ])
    if (pr.error) {
      console.error('[teacher] realGetClassStats profiles failed:', pr.error)
      throw pr.error
    }
    if (dr.error) {
      console.error('[teacher] realGetClassStats diagnoses failed:', dr.error)
      throw dr.error
    }
    profs = pr.data || []
    diags = dr.data || []
  }

  // 4.1 能力分布（1-5 星各自人数）
  const ability_distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const p of profs) {
    const stars = (p.metadata && p.metadata.ability_stars) || {}
    for (const v of Object.values(stars)) {
      const s = Math.max(1, Math.min(5, Math.round(v)))
      ability_distribution[s] = (ability_distribution[s] || 0) + 1
    }
  }

  // 4.2 薄弱点 top10
  const weakCount = {}
  for (const d of diags) {
    for (const t of d.weak || []) {
      weakCount[t] = (weakCount[t] || 0) + 1
    }
  }
  const weak_top_topics = Object.entries(weakCount)
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // 4.3 学科分布
  const subjCount = {}
  for (const d of diags) {
    const s = d.subject || 'unknown'
    subjCount[s] = (subjCount[s] || 0) + 1
  }
  const subject_distribution = Object.entries(subjCount)
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count)

  return {
    student_count: (stats && stats.student_count) || studentIds.length,
    total_diagnoses: (stats && stats.total_diagnoses) || diags.length,
    avg_reasoning: (stats && stats.avg_reasoning) || null,
    ability_distribution,
    weak_top_topics,
    subject_distribution
  }
}
