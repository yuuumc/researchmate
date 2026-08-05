<script setup>
// ============================================================
// AuthModal · 邮箱+密码 登录/注册（v2.6）
// ============================================================
// - 注册：supabase.auth.signUp({ email, password })，Confirm email 关闭后注册即登录
// - 登录：supabase.auth.signInWithPassword({ email, password })
// - 状态同步由 onAuthStateChange → bindAuthUser 触发
// - mode="modal" 浮层 / mode="inline" 内嵌（LoginView 用）
// - 未配置 Supabase：优雅降级卡片（本地单机模式说明），不白屏不报错
// ============================================================
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { isSupabaseConfigured } from '@/services/supabase'

const props = defineProps({
  mode: { type: String, default: 'modal' }, // modal | inline
  visible: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'success'])

const auth = useAuthStore()

// 'login' | 'register'
const authMode = ref('login')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const errorMsg = ref('')

const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()))
const passwordValid = computed(() => password.value.length >= 6)
const confirmValid = computed(() => authMode.value === 'login' || password.value === confirmPassword.value)
const canSubmit = computed(() => emailValid.value && passwordValid.value && confirmValid.value && !loading.value)

function switchMode(mode) {
  authMode.value = mode
  errorMsg.value = ''
}

async function submit() {
  if (!canSubmit.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    if (authMode.value === 'register') {
      await auth.signUp(email.value.trim(), password.value)
      ElMessage.success('注册成功，欢迎加入！')
    } else {
      await auth.signIn(email.value.trim(), password.value)
      ElMessage.success('登录成功')
    }
    emit('success')
    if (props.mode === 'modal') emit('close')
  } catch (e) {
    console.error('[auth-modal] submit failed:', e)
    errorMsg.value = e?.message || (authMode.value === 'register' ? '注册失败，请稍后重试' : '登录失败，请检查邮箱和密码')
  } finally {
    loading.value = false
  }
}

function close() {
  emit('close')
}

function wechatPlaceholder() {
  ElMessage.info('微信扫码登录即将开放（Supabase Provider 接入中）')
}

function guestLogin() {
  auth.guestLogin()
  ElMessage.success('欢迎体验！数据仅保存在本设备')
  emit('success')
  if (props.mode === 'modal') emit('close')
}
</script>

<template>
  <teleport to="body" v-if="mode === 'modal'">
    <div v-if="visible" class="auth-overlay" @click.self="close">
      <div class="auth-card">
        <button class="auth-close" aria-label="关闭" @click="close">✕</button>
        <div class="auth-body">
          <!-- 未配置 Supabase 降级 -->
          <div v-if="!isSupabaseConfigured" class="auth-degraded">
            <div class="degraded-icon">⚠</div>
            <h3>未配置 Supabase</h3>
            <p>当前为本地单机模式，数据仅保存在本设备。</p>
            <p class="degraded-hint">配置 <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code> 后开放多设备同步与账号体系。</p>
            <button class="btn btn-primary" @click="close">知道了</button>
            <button class="btn btn-guest" @click="guestLogin">游客体验</button>
          </div>

          <!-- 邮箱+密码 -->
          <template v-else>
            <h3 class="auth-title">{{ authMode === 'login' ? '登录' : '注册' }}</h3>
            <p class="auth-subtitle">
              {{ authMode === 'login' ? '使用邮箱和密码登录研芯通' : '创建账号，开启多设备同步' }}
            </p>

            <div class="auth-form">
              <input
                v-model="email"
                class="input auth-input"
                type="email"
                inputmode="email"
                maxlength="100"
                placeholder="邮箱地址"
                :disabled="loading"
                @keyup.enter="submit"
              />
              <input
                v-model="password"
                class="input auth-input"
                type="password"
                maxlength="100"
                placeholder="密码（至少 6 位）"
                :disabled="loading"
                @keyup.enter="submit"
              />
              <input
                v-if="authMode === 'register'"
                v-model="confirmPassword"
                class="input auth-input"
                type="password"
                maxlength="100"
                placeholder="确认密码"
                :disabled="loading"
                @keyup.enter="submit"
              />
              <p v-if="authMode === 'register' && confirmPassword && !confirmValid" class="auth-hint auth-hint-error">
                两次输入的密码不一致
              </p>
              <button
                class="btn btn-primary btn-block"
                :disabled="!canSubmit"
                :class="{ 'is-loading': loading }"
                @click="submit"
              >
                {{ loading ? '处理中…' : (authMode === 'login' ? '登录' : '注册') }}
              </button>
            </div>

            <p v-if="errorMsg" class="auth-error" role="alert">{{ errorMsg }}</p>

            <div class="auth-mode-switch">
              <span>{{ authMode === 'login' ? '还没有账号？' : '已有账号？' }}</span>
              <button class="btn-link" @click="switchMode(authMode === 'login' ? 'register' : 'login')">
                {{ authMode === 'login' ? '去注册' : '去登录' }}
              </button>
            </div>

            <div class="auth-divider"><span>其他方式</span></div>
            <button class="btn btn-wechat" disabled @click="wechatPlaceholder">
              <span class="wechat-dot" />微信扫码登录（即将开放）
            </button>
            <button class="btn btn-guest" @click="guestLogin">游客体验</button>
          </template>
        </div>
      </div>
    </div>
  </teleport>

  <!-- inline 模式（LoginView 内嵌） -->
  <div v-else class="auth-card auth-card-inline">
    <div class="auth-body">
      <div v-if="!isSupabaseConfigured" class="auth-degraded">
        <div class="degraded-icon">⚠</div>
        <h3>未配置 Supabase</h3>
        <p>当前为本地单机模式，数据仅保存在本设备。</p>
        <p class="degraded-hint">配置 <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code> 后开放多设备同步与账号体系。</p>
        <button class="btn btn-primary" @click="emit('success')">继续本地使用</button>
        <button class="btn btn-guest" @click="guestLogin">游客体验</button>
      </div>

      <template v-else>
        <h3 class="auth-title">{{ authMode === 'login' ? '登录' : '注册' }}</h3>
        <p class="auth-subtitle">
          {{ authMode === 'login' ? '使用邮箱和密码登录研芯通' : '创建账号，开启多设备同步' }}
        </p>

        <div class="auth-form">
          <input
            v-model="email"
            class="input auth-input"
            type="email"
            inputmode="email"
            maxlength="100"
            placeholder="邮箱地址"
            :disabled="loading"
            @keyup.enter="submit"
          />
          <input
            v-model="password"
            class="input auth-input"
            type="password"
            maxlength="100"
            placeholder="密码（至少 6 位）"
            :disabled="loading"
            @keyup.enter="submit"
          />
          <input
            v-if="authMode === 'register'"
            v-model="confirmPassword"
            class="input auth-input"
            type="password"
            maxlength="100"
            placeholder="确认密码"
            :disabled="loading"
            @keyup.enter="submit"
          />
          <p v-if="authMode === 'register' && confirmPassword && !confirmValid" class="auth-hint auth-hint-error">
            两次输入的密码不一致
          </p>
          <button
            class="btn btn-primary btn-block"
            :disabled="!canSubmit"
            :class="{ 'is-loading': loading }"
            @click="submit"
          >
            {{ loading ? '处理中…' : (authMode === 'login' ? '登录' : '注册') }}
          </button>
        </div>

        <p v-if="errorMsg" class="auth-error" role="alert">{{ errorMsg }}</p>

        <div class="auth-mode-switch">
          <span>{{ authMode === 'login' ? '还没有账号？' : '已有账号？' }}</span>
          <button class="btn-link" @click="switchMode(authMode === 'login' ? 'register' : 'login')">
            {{ authMode === 'login' ? '去注册' : '去登录' }}
          </button>
        </div>

        <div class="auth-divider"><span>其他方式</span></div>
        <button class="btn btn-wechat" disabled @click="wechatPlaceholder">
          <span class="wechat-dot" />微信扫码登录（即将开放）
        </button>
        <button class="btn btn-guest" @click="guestLogin">游客体验</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.auth-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  background: rgba(15, 30, 51, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  animation: fade-in var(--duration-base) var(--ease-out);
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.auth-card {
  position: relative;
  width: 100%;
  max-width: 400px;
  background: var(--color-bg-elevated);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  animation: card-up var(--duration-slow) var(--ease-out);
}

.auth-card-inline {
  max-width: 420px;
  margin: 0 auto;
  border: 1px solid var(--color-border-subtle);
  box-shadow: var(--shadow-md);
}

@keyframes card-up {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.auth-close {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-fg-tertiary);
  font-size: 14px;
  transition: all var(--duration-fast) var(--ease-out);
}

.auth-close:hover {
  background: var(--color-bg-sunken);
  color: var(--color-fg-primary);
}

.auth-close:active {
  transform: scale(0.92);
}

.auth-body {
  padding: var(--space-8) var(--space-6) var(--space-6);
}

.auth-title {
  margin: 0 0 var(--space-2);
  font-family: var(--font-serif);
  font-size: var(--text-section);
  color: var(--color-ink-900);
}

.auth-subtitle {
  margin: 0 0 var(--space-6);
  font-size: var(--text-meta);
  color: var(--color-fg-tertiary);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.auth-input {
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-body);
  color: var(--color-fg-primary);
  background: var(--color-bg-elevated);
  transition: border-color var(--duration-fast) var(--ease-out);
}

.auth-input:focus {
  outline: none;
  border-color: var(--color-ink-700);
  box-shadow: 0 0 0 3px rgba(30, 58, 95, 0.12);
}

.auth-input:disabled {
  background: var(--color-bg-sunken);
  color: var(--color-fg-muted);
  cursor: not-allowed;
}

.auth-hint {
  margin: 0;
  font-size: var(--text-meta);
  color: var(--color-fg-tertiary);
}

.auth-hint-error {
  color: var(--color-error);
}

.btn {
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--text-body);
  font-weight: 500;
  padding: var(--space-3) var(--space-5);
  transition: all var(--duration-fast) var(--ease-out);
  cursor: pointer;
}

.btn:active:not(:disabled) {
  transform: scale(0.97);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--color-ink-700);
  color: var(--color-fg-inverse);
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-ink-900);
  box-shadow: var(--shadow-md);
}

.btn-block {
  width: 100%;
}

.is-loading {
  position: relative;
  pointer-events: none;
}

.btn-link {
  border: none;
  background: none;
  color: var(--color-ink-500);
  font-size: var(--text-meta);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-out);
}

.btn-link:hover:not(:disabled) {
  color: var(--color-node-active);
}

.auth-mode-switch {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  margin-top: var(--space-5);
  font-size: var(--text-meta);
  color: var(--color-fg-tertiary);
}

.auth-error {
  margin: var(--space-4) 0 0;
  padding: var(--space-2) var(--space-3);
  background: var(--color-error-bg);
  color: var(--color-error);
  border-radius: var(--radius-sm);
  font-size: var(--text-meta);
}

.auth-divider {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-6) 0 var(--space-4);
  color: var(--color-fg-muted);
  font-size: var(--text-caption);
}

.auth-divider::before,
.auth-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-border-subtle);
}

.btn-wechat {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  background: var(--color-bg-sunken);
  color: var(--color-fg-tertiary);
}

.btn-guest {
  width: 100%;
  margin-top: var(--space-3);
  background: transparent;
  color: var(--color-ink-500);
  border: 1px solid var(--color-border-default);
  font-size: var(--text-meta);
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-guest:hover {
  border-color: var(--color-ink-500);
  color: var(--color-ink-700);
  background: var(--color-bg-sunken);
}

.wechat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-node-active);
  opacity: 0.5;
}

/* 降级卡片 */
.auth-degraded {
  text-align: center;
}

.degraded-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto var(--space-4);
  border-radius: 50%;
  background: var(--color-warning-bg);
  color: var(--color-warning);
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth-degraded h3 {
  margin: 0 0 var(--space-2);
  font-size: var(--text-title);
  color: var(--color-ink-900);
}

.auth-degraded p {
  margin: 0 0 var(--space-2);
  font-size: var(--text-body);
  color: var(--color-fg-secondary);
}

.degraded-hint {
  font-size: var(--text-meta) !important;
  color: var(--color-fg-tertiary) !important;
}

.degraded-hint code {
  font-family: var(--font-mono);
  background: var(--color-bg-sunken);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-size: var(--text-caption);
}

.auth-degraded .btn {
  margin-top: var(--space-4);
}

@media (max-width: 480px) {
  .auth-body {
    padding: var(--space-6) var(--space-4) var(--space-4);
  }
  .auth-title {
    font-size: var(--text-title);
  }
}
</style>
