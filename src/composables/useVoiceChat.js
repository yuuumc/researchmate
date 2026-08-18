// ============================================================
// useVoiceChat — Web Speech API 封装（F6 语音辅导）
// ============================================================
// 浏览器原生 ASR（SpeechRecognition）+ TTS（speechSynthesis）
// 不接云端 ASR/TTS，全部前端完成。
// MVP 仅支持 Chrome 桌面端，移动端降级提示。
// ============================================================

import { ref, onUnmounted } from 'vue'

export function useVoiceChat(options = {}) {
  const { lang = 'zh-CN', rate = 0.95, pitch = 1.05 } = options

  // === 浏览器支持检测 ===
  const SpeechRecognitionAPI =
    typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)
  const isASRSupported = !!SpeechRecognitionAPI
  const isTTSSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window
  const isSupported = isASRSupported && isTTSSupported

  // 移动端检测
  const isMobile =
    typeof navigator !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    )

  // === 响应式状态 ===
  const isListening = ref(false)
  const transcript = ref('')
  const interimTranscript = ref('')
  const isSpeaking = ref(false)
  const error = ref('')

// === TTS 语音预加载 ===
  let _voicesReady = false
  if (isTTSSupported) {
    const _checkVoices = () => {
      const vs = speechSynthesis.getVoices()
      if (vs.length > 0) _voicesReady = true
    }
    _checkVoices()
    if (!_voicesReady) {
      speechSynthesis.addEventListener('voiceschanged', _checkVoices, { once: true })
    }
  }

  // === ASR 实例 ===
  let recognition = null
  if (isASRSupported) {
    recognition = new SpeechRecognitionAPI()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
  }

  /**
   * 开始语音识别
   */
  function startListening() {
    if (!isASRSupported || isListening.value) return
    transcript.value = ''
    interimTranscript.value = ''
    error.value = ''

    recognition.onresult = (event) => {
      let final = ''
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }
      if (final) transcript.value += final
      interimTranscript.value = interim
    }

    recognition.onerror = (event) => {
      const errMap = {
        'no-speech': '没有检测到语音，请重试',
        'audio-capture': '麦克风无法访问，请检查设备',
        'not-allowed': '麦克风权限被拒绝，请在浏览器设置中允许',
        'service-not-allowed': '语音服务不可用，请使用 Chrome 浏览器',
        network: '网络错误，请检查连接',
      }
      error.value = errMap[event.error] || `语音识别错误: ${event.error}`
      isListening.value = false
    }

    recognition.onend = () => {
      isListening.value = false
      // 合并 interim 到 final（如果 onresult 没给 final）
      if (!transcript.value && interimTranscript.value) {
        transcript.value = interimTranscript.value
        interimTranscript.value = ''
      }
    }

    try {
      recognition.start()
      isListening.value = true
    } catch (e) {
      error.value = e.message || '启动语音识别失败'
    }
  }

  /**
   * 停止语音识别
   */
  function stopListening() {
    if (!recognition || !isListening.value) return
    try {
      recognition.stop()
    } catch (_) {
      /* noop */
    }
    isListening.value = false
  }

  /**
   * TTS 播报文本
   * @param {string} text - 要播报的文本
   * @param {function} [onEnd] - 播报结束回调
   */
  function speak(text, onEnd) {
    if (!isTTSSupported || !text) {
      if (onEnd) onEnd()
      return
    }
    // 取消正在进行的播报
    speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.rate = rate
    utterance.pitch = pitch

    // 尝试选择中文语音
    const voices = speechSynthesis.getVoices()
    const zhVoices = voices.filter(
      (v) => v.lang.startsWith('zh') || v.lang.startsWith('cmn')
    )
    let zhVoice = null
    if (zhVoices.length > 0) {
      const preferred = ['Xiaoxiao', 'Yunxi', 'Yaoyao', 'Huihui', 'Xiaoyi', 'Female', 'female']
      for (const pref of preferred) {
        zhVoice = zhVoices.find(v => v.name.includes(pref))
        if (zhVoice) break
      }
      if (!zhVoice) zhVoice = zhVoices[0]
    }
    if (zhVoice) utterance.voice = zhVoice

    utterance.onstart = () => {
      isSpeaking.value = true
    }
    utterance.onend = () => {
      isSpeaking.value = false
      if (onEnd) onEnd()
    }
    utterance.onerror = () => {
      isSpeaking.value = false
      if (onEnd) onEnd()
    }

    speechSynthesis.speak(utterance)
  }

  /**
   * 停止 TTS 播报
   */
  function stopSpeaking() {
    if (!isTTSSupported) return
    speechSynthesis.cancel()
    isSpeaking.value = false
  }

  /**
   * 切换监听状态
   */
  function toggleListening() {
    if (isListening.value) {
      stopListening()
    } else {
      startListening()
    }
  }

  // === 清理 ===
  onUnmounted(() => {
    if (recognition && isListening.value) {
      try {
        recognition.stop()
      } catch (_) {
        /* noop */
      }
    }
    if (isTTSSupported) {
      speechSynthesis.cancel()
    }
  })

  return {
    // 支持检测
    isSupported,
    isASRSupported,
    isTTSSupported,
    isMobile,
    // 状态
    isListening,
    transcript,
    interimTranscript,
    isSpeaking,
    error,
    // 方法
    startListening,
    stopListening,
    toggleListening,
    speak,
    stopSpeaking,
  }
}
