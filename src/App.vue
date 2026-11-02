<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import HomeView from './HomeView.vue'

type AuthMode = 'login' | 'register'
type AuthResponse = {
  message?: string
  msg?: string
  code?: number
  data?: {
    token?: string
  }
}

const mode = ref<AuthMode>('login')
const currentPath = ref(window.location.pathname)
const signedInUsername = ref(localStorage.getItem('singtom-username') || '')
const username = ref('')
const password = ref('')
const isLoading = ref(false)
const feedback = ref('')
const feedbackType = ref<'success' | 'error'>('success')

const isLogin = computed(() => mode.value === 'login')
const isHome = computed(() => currentPath.value === '/home')
const submitLabel = computed(() => (isLogin.value ? '登录' : '注册'))

function updateRoute() {
  currentPath.value = window.location.pathname
}

function navigateTo(path: string) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path)
  }
  updateRoute()
}

function logout() {
  localStorage.removeItem('singtom-username')
  signedInUsername.value = ''
  navigateTo('/')
}

function switchMode(nextMode: AuthMode) {
  mode.value = nextMode
  feedback.value = ''
}

function validateForm(): boolean {
  const normalizedUsername = username.value.trim()

  if (!normalizedUsername) {
    feedbackType.value = 'error'
    feedback.value = '请输入用户名'
    return false
  }

  if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(normalizedUsername)) {
    feedbackType.value = 'error'
    feedback.value = '用户名需为 3-20 位字母、数字、下划线或连字符'
    return false
  }

  if (password.value.length < 6 || password.value.length > 32) {
    feedbackType.value = 'error'
    feedback.value = '密码长度需为 6-32 位'
    return false
  }

  return true
}

async function submitForm() {
  feedback.value = ''
  if (!validateForm()) return

  isLoading.value = true
  try {
    const response = await fetch(`/api/auth/${mode.value}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.value.trim(),
        password: password.value,
      }),
    })

    const responseText = await response.text()
    let result: AuthResponse = {}

    if (responseText) {
      try {
        result = JSON.parse(responseText) as AuthResponse
      } catch {
        throw new Error('服务器返回了无法识别的响应')
      }
    }

    if (!response.ok || (result.code !== undefined && result.code !== 0)) {
      throw new Error(result.message || result.msg || `${submitLabel.value}失败，请检查信息后重试`)
    }

    if (isLogin.value) {
      signedInUsername.value = username.value.trim()
      localStorage.setItem('singtom-username', signedInUsername.value)
      navigateTo('/home')
      return
    }

    feedbackType.value = 'success'
    feedback.value = result.message || result.msg || `${submitLabel.value}成功`
  } catch (error) {
    feedbackType.value = 'error'
    feedback.value =
      error instanceof Error ? error.message : `${submitLabel.value}失败，请稍后重试`
  } finally {
    isLoading.value = false
  }
}

onMounted(() => window.addEventListener('popstate', updateRoute))
onUnmounted(() => window.removeEventListener('popstate', updateRoute))
</script>

<template>
  <HomeView v-if="isHome" :username="signedInUsername" @logout="logout" />
  <main v-else class="auth-page">
    <section class="auth-card" aria-labelledby="page-title">
      <div class="brand-mark" aria-hidden="true">N</div>
      <p class="eyebrow">NOW & FUTURE</p>
      <h1 id="page-title">{{ isLogin ? '欢迎回来' : '创建你的账号' }}</h1>
      <p class="subtitle">
        {{ isLogin ? '登录以继续探索属于你的可能。' : '注册一个账号，开启全新的体验。' }}
      </p>

      <div class="mode-switch" role="tablist" aria-label="账号操作">
        <button
          id="login-tab"
          type="button"
          role="tab"
          :aria-selected="isLogin"
          aria-controls="auth-panel"
          :class="{ active: isLogin }"
          @click="switchMode('login')"
        >
          登录
        </button>
        <button
          id="register-tab"
          type="button"
          role="tab"
          :aria-selected="!isLogin"
          aria-controls="auth-panel"
          :class="{ active: !isLogin }"
          @click="switchMode('register')"
        >
          注册
        </button>
      </div>

      <form
        id="auth-panel"
        :aria-labelledby="isLogin ? 'login-tab' : 'register-tab'"
        @submit.prevent="submitForm"
      >
        <label for="username">用户名</label>
        <input
          id="username"
          v-model="username"
          name="username"
          type="text"
          autocomplete="username"
          placeholder="请输入用户名"
          maxlength="20"
          required
        />

        <label for="password">密码</label>
        <input
          id="password"
          v-model="password"
          name="password"
          type="password"
          :autocomplete="isLogin ? 'current-password' : 'new-password'"
          placeholder="请输入 6-32 位密码"
          minlength="6"
          maxlength="32"
          required
        />

        <p v-if="feedback" class="feedback" :class="feedbackType" role="status" aria-live="polite">
          {{ feedback }}
        </p>

        <button class="submit-button" type="submit" :disabled="isLoading">
          {{ isLoading ? '请稍候…' : submitLabel }}
          <span v-if="!isLoading" aria-hidden="true">→</span>
        </button>
      </form>

      <p class="footnote">继续即表示你同意我们的服务条款与隐私政策</p>
    </section>
    <p class="page-caption">让每一次开始，都通向更好的未来。</p>
  </main>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap');

:root {
  font-family: 'DM Sans', 'Noto Sans SC', sans-serif;
  color: #192a27;
  background: #f4f5ef;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

body {
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
}

button,
input {
  font: inherit;
}

.auth-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 40px 20px 24px;
  background:
    radial-gradient(ellipse at 12% 14%, rgb(199 218 196 / 46%), transparent 34%),
    radial-gradient(ellipse at 91% 85%, rgb(226 214 186 / 42%), transparent 30%),
    #f4f5ef;
}

.auth-card {
  width: min(100%, 440px);
  padding: 42px 44px 30px;
  border: 1px solid rgb(35 63 53 / 8%);
  border-radius: 24px;
  background: rgb(255 255 252 / 92%);
  box-shadow: 0 24px 70px rgb(40 58 47 / 10%);
}

.brand-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 14px;
  background: #244b3d;
  color: white;
  font-size: 21px;
  font-weight: 700;
}

.eyebrow {
  margin: 24px 0 9px;
  color: #728276;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
}

.auth-page h1 {
  margin: 0;
  font-size: 29px;
  letter-spacing: -0.04em;
}

.subtitle {
  margin: 9px 0 27px;
  color: #7b8580;
  font-size: 14px;
}

.mode-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-bottom: 24px;
  padding: 4px;
  border-radius: 12px;
  background: #f0f2ec;
}

.mode-switch button {
  min-height: 40px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #7b8580;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease;
}

.mode-switch button.active {
  background: white;
  color: #244b3d;
  box-shadow: 0 2px 8px rgb(35 63 53 / 9%);
}

.auth-page form {
  display: flex;
  flex-direction: column;
}

.auth-page label {
  margin: 0 0 8px;
  color: #394a42;
  font-size: 13px;
  font-weight: 600;
}

.auth-page input {
  width: 100%;
  height: 48px;
  margin-bottom: 19px;
  padding: 0 14px;
  border: 1px solid #e2e6de;
  border-radius: 10px;
  outline: none;
  background: #fff;
  color: #192a27;
  font-size: 14px;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.auth-page input::placeholder {
  color: #a7b0a9;
}

.auth-page input:focus {
  border-color: #638571;
  box-shadow: 0 0 0 3px rgb(99 133 113 / 13%);
}

.feedback {
  margin: -3px 0 14px;
  font-size: 13px;
  line-height: 1.5;
}

.feedback.success {
  color: #28764f;
}

.feedback.error {
  color: #b4473e;
}

.submit-button {
  display: flex;
  min-height: 50px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 0;
  border-radius: 10px;
  background: #244b3d;
  color: white;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  transition: background 160ms ease, transform 160ms ease;
}

.submit-button:hover:not(:disabled) {
  transform: translateY(-1px);
  background: #1d3f33;
}

.submit-button:disabled {
  cursor: wait;
  opacity: 0.7;
}

.footnote {
  margin: 23px 0 0;
  color: #a0a9a1;
  font-size: 11px;
  line-height: 1.7;
  text-align: center;
}

.page-caption {
  position: absolute;
  bottom: 18px;
  margin: 0;
  color: #8a958c;
  font-size: 12px;
}

@media (max-width: 480px) {
  .auth-card {
    padding: 34px 26px 26px;
  }

  .auth-page h1 {
    font-size: 26px;
  }
}
</style>
