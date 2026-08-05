<script setup>
// ============================================================
// AuthModal · 手机号 OTP 登录/注册（v2.5）
// ============================================================
// - 手机号 OTP：supabase.auth.signInWithOtp 发码 → auth store verifyOtp 验码
// - 微信扫码：占位（Supabase dashboard provider 未开，禁用态 + 提示）
// - 未配置 Supabase：优雅降级卡片（本地单机模式说明），不白屏不报错
// - mode="modal" 浮层 / mode="inline" 内嵌（LoginView 用）
// ============================================================
import { ref, computed, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { supabase, isSupabaseConfigured } from '@/services/supabase'

const props = defineProps({
  mode: { type: String, default: 'modal' }, // modal | inline
  visible: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'success'])

const auth = useAuthStore()

const step = ref('email') // email | code
const email = ref('')
const code = ref('')
const sending = ref(false)
const verifying = ref(false)
const errorMsg = ref('')
const countdown = ref(0)
let countdownTimer = null

const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()))
const codeValid = computed(() => /^\d{6}$/.test(code.value.trim()))

function startCountdown() {
  countdown.value = 60
  countdownTimer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

onBeforeUnmount(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})

async function sendCode() {
  if (!emailValid.value || sending.value || countdown.value > 0) return
  sending.value = true
  errorMsg.value = ''
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.value.trim(),
      options: { shouldCreateUser: true }
    })
    if (error) throw error
    step.value = 'code'
    startCountdown()
    ElMessage.success('验证码已发送，请查收邮件')
  } catch (e) {
    console.error('[auth-modal] sendCode failed:', e)
    errorMsg.value = e?.message || '验证码发送失败，请检查邮箱地址'
  } finally {
    sending.value = false
  }
}

async function verify() {
  if (!codeValid.value || verifying.value) return
  verifying.value = true
  errorMsg.value = ''
  try {
    await auth.verifyOtp(email.value.trim(), code.value.trim())
    ElMessage.success('登录成功')
    emit('success')
    if (props.mode === 'modal') emit('close')
  } catch (e) {
    console.error('[auth-modal] verify failed:', e)
    errorMsg.value = e?.message || '验证码错误或已过期'
  } finally {
    verifying.value = false
  }
}

function backToEmail() {
  step.value = 'email'
  code.value = ''
  errorMsg.value = ''
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

          <!-- 手机号 OTP -->
          <template v-else>
            <h3 class="auth-title">{{ step === 'email' ? '邮箱登录 / 注册' : '输入验证码' }}</h3>
            <p class="auth-subtitle">
              {{ step === 'email' ? '未注册的邮箱将自动创建账号' : `验证码已发送至 ${email}` }}
            </p>

            <div v-if="step === 'email'" class="auth-form">
              <div class="phone-input-row">
                <input
                  v-model="email"
                  class="input"
                  type="email"
                  inputmode="email"
                  maxlength="100"
                  placeholder="请输入邮箱地址"
                  :disabled="sending"
                  @keyup.enter="sendCode"
                />
              </div>
              <button
                class="btn btn-primary btn-block"
                :disabled="!emailValid || sending"
                :class="{ 'is-loading': sending }"
                @click="sendCode"
              >
                {{ sending ? '发送中…' : '获取验证码' }}
              </button>
            </div>

            <div v-else class="auth-form">
              <input
                v-model="code"
                class="input code-input"
                type="text"
                inputmode="numeric"
                maxlength="6"
                placeholder="6 位验证码"
                :disabled="verifying"
                @keyup.enter="verify"
              />
              <button
                class="btn btn-primary btn-block"
                :disabled="!codeValid || verifying"
                :class="{ 'is-loading': verifying }"
                @click="verify"
              >
                {{ verifying ? '验证中…' : '登录' }}
              </button>
              <div class="code-actions">
                <button class="btn-link" @click="backToEmail">换个邮箱</button>
                <button
                  class="btn-link"
                  :disabled="countdown > 0"
                  @click="sendCode"
                >
                  {{ countdown > 0 ? `${countdown}s 后可重发` : '重新发送' }}
                </button>
              </div>
            </div>

            <p v-if="errorMsg" class="auth-error" role="alert">{{ errorMsg }}</p>

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
        <h3 class="auth-title">{{ step === 'email' ? '邮箱登录 / 注册' : '输入验证码' }}</h3>
        <p class="auth-subtitle">
          {{ step === 'email' ? '未注册的邮箱将自动创建账号' : `验证码已发送至 ${email}` }}
        </p>

        <div v-if="step === 'phone'" class="auth-form">
          <div class="phone-input-row">
            <span class="phone-prefix">+86</span>
            <input
              v-model="phone"
              class="input"
              type="tel"
              inputmode="numeric"
              maxlength="11"
              placeholder="请输入 11 位手机号"
              :disabled="sending"
              @keyup.enter="sendCode"
            />
          </div>
          <button
            class="btn btn-primary btn-block"
            :disabled="!emailValid || sending"
            :class="{ 'is-loading': sending }"
            @click="sendCode"
          >
            {{ sending ? '发送中…' : '获取验证码' }}
          </button>
        </div>

        <div v-else class="auth-form">
          <input
            v-model="code"
            class="input code-input"
            type="text"
            inputmode="numeric"
            maxlength="6"
            placeholder="6 位验证码"
            :disabled="verifying"
            @keyup.enter="verify"
          />
          <button
            class="btn btn-primary btn-block"
            :disabled="!codeValid || verifying"
            :class="{ 'is-loading': verifying }"
            @click="verify"
          >
            {{ verifying ? '验证中…' : '登录' }}
          </button>
          <div class="code-actions">
            <button class="btn-link" @click="backToEmail">换个邮箱</button>
            <button class="btn-link" :disabled="countdown > 0" @click="sendCode">
              {{ countdown > 0 ? `${countdown}s 后可重发` : '重新发送' }}
            </button>
          </div>
        </div>

        <p v-if="errorMsg" class="auth-error" role="alert">{{ errorMsg }}</p>

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

.phone-input-row {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color var(--duration-fast) var(--ease-out);
}

.phone-input-row:focus-within {
  border-color: var(--color-ink-700);
  box-shadow: 0 0 0 3px rgba(30, 58, 95, 0.12);
}

.phone-prefix {
  display: flex;
  align-items: center;
  padding: 0 var(--space-3);
  background: var(--color-bg-sunken);
  color: var(--color-fg-secondary);
  font-size: var(--text-body);
  border-right: 1px solid var(--color-border-subtle);
}

.input {
  flex: 1;
  min-width: 0;
  padding: var(--space-3) var(--space-4);
  border: none;
  outline: none;
  font-size: var(--text-body);
  color: var(--color-fg-primary);
  background: var(--color-bg-elevated);
}

.input:disabled {
  background: var(--color-bg-sunken);
  color: var(--color-fg-muted);
  cursor: not-allowed;
}

.code-input {
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  text-align: center;
  font-size: var(--text-title);
  letter-spacing: 8px;
  font-family: var(--font-mono);
  transition: border-color var(--duration-fast) var(--ease-out);
}

.code-input:focus {
  border-color: var(--color-ink-700);
  box-shadow: 0 0 0 3px rgba(30, 58, 95, 0.12);
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

.btn-link:disabled {
  color: var(--color-fg-muted);
  cursor: not-allowed;
}

.code-actions {
  display: flex;
  justify-content: space-between;
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
