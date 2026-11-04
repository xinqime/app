<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import HomeView from './HomeView.vue'

const temporaryUserIdKey = 'singtom-temporary-user-id'
const currentPath = ref(window.location.pathname)
const temporaryUserId = ref(localStorage.getItem(temporaryUserIdKey) || '')

const isHome = computed(() => currentPath.value === '/home' && Boolean(temporaryUserId.value))

function updateRoute() {
  currentPath.value = window.location.pathname
  if (currentPath.value === '/home' && !temporaryUserId.value) {
    window.history.replaceState({}, '', '/')
    currentPath.value = '/'
  }
}

function navigateTo(path: string) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path)
  }
  updateRoute()
}

function logout() {
  localStorage.removeItem(temporaryUserIdKey)
  temporaryUserId.value = ''
  navigateTo('/')
}

function start() {
  if (!temporaryUserId.value) {
    temporaryUserId.value = `guest-${crypto.randomUUID()}`
    localStorage.setItem(temporaryUserIdKey, temporaryUserId.value)
  }
  navigateTo('/home')
}

onMounted(() => window.addEventListener('popstate', updateRoute))
onUnmounted(() => window.removeEventListener('popstate', updateRoute))
</script>

<template>
  <HomeView
    v-if="isHome"
    username="访客"
    :user-id="temporaryUserId"
    @logout="logout"
  />
  <main v-else class="welcome-page">
    <section class="welcome-card" aria-labelledby="page-title">
      <div class="welcome-content">
        <div class="welcome-brand">
          <span class="brand-mark" aria-hidden="true">S</span>
          <span class="brand-name">Singtom</span>
          <span class="brand-divider"></span>
          <span class="brand-category">明日社区</span>
        </div>
        <button class="start-button" type="button" @click="start">
          无需注册 · 一键开始
          <span aria-hidden="true">→</span>
        </button>
        <p class="privacy-note">
          聊天内容为公开内容；为保障服务安全与排查问题，服务端会记录 IP 地址及必要的访问、操作日志。
        </p>
      </div>

      <div class="welcome-visual" aria-hidden="true">
        <span class="visual-orbit orbit-outer"></span>
        <span class="visual-orbit orbit-inner"></span>
        <div class="visual-card visual-card-main">
          <span class="visual-icon">▦</span>
          <span class="visual-card-copy">
            <strong>兴趣</strong>
            <small>让兴趣就是兴趣</small>
          </span>
          <span class="visual-dot"></span>
        </div>
        <div class="visual-card visual-card-secondary">
          <span class="visual-icon spectator-icon">◉</span>
          <span class="visual-card-copy">
            <strong>围观</strong>
            <small>让热闹更加热闹</small>
          </span>
          <span class="visual-live"><i></i> LIVE</span>
        </div>
        <span class="visual-spark spark-one">✦</span>
        <span class="visual-spark spark-two">✦</span>
      </div>
    </section>
    <p class="page-caption">明日复明日，明日何其多。</p>
  </main>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap');

:root {
  font-family: 'DM Sans', 'Noto Sans SC', sans-serif;
  color: #f2f3f5;
  background: #313338;
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

.welcome-page {
  position: relative;
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 32px 24px 56px;
  background:
    radial-gradient(ellipse at 14% 12%, rgb(88 101 242 / 13%), transparent 34%),
    radial-gradient(ellipse at 89% 87%, rgb(67 78 151 / 15%), transparent 32%),
    #313338;
}

.welcome-card {
  display: grid;
  width: min(100%, 1080px);
  min-height: 450px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 64px;
  padding: 52px 64px;
  border: 1px solid #ffffff0d;
  border-radius: 16px;
  background: #2b2d31;
  box-shadow: 0 28px 90px #17181b66;
}

.brand-mark {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 10px;
  background: #5865f2;
  color: white;
  font-size: 17px;
  font-weight: 700;
}

.welcome-brand {
  display: flex;
  align-items: center;
  gap: 11px;
}

.brand-name {
  color: #f2f3f5;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.brand-divider {
  width: 1px;
  height: 17px;
  margin: 0 2px;
  background: #ffffff24;
}

.brand-category {
  color: #b5bac1;
  font-size: 12px;
}

.welcome-content {
  grid-column: 2;
  grid-row: 1;
  display: grid;
  align-content: center;
  justify-items: center;
  text-align: center;
}

.start-button {
  display: flex;
  width: min(100%, 420px);
  min-height: 58px;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 54px;
  border: 0;
  border-radius: 8px;
  background: #5865f2;
  color: white;
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
  transition: background 160ms ease, transform 160ms ease, box-shadow 160ms ease;
}

.start-button:hover {
  transform: translateY(-1px);
  background: #4752c4;
  box-shadow: 0 8px 24px #5865f24d;
}

.start-button span {
  font-size: 18px;
}

.temporary-note {
  margin: 13px 0 0;
  color: #949ba4;
  font-size: 11px;
}

.privacy-note {
  max-width: 420px;
  margin: 10px 0 0;
  color: #7f8792;
  font-size: 11px;
  line-height: 1.65;
}

.welcome-visual {
  position: relative;
  grid-column: 1;
  grid-row: 1;
  display: grid;
  min-height: 340px;
  align-content: center;
  justify-items: center;
  gap: 17px;
  overflow: hidden;
  border: 1px solid #ffffff0a;
  border-radius: 12px;
  background:
    radial-gradient(circle at center, #5865f21a, transparent 62%),
    #313338;
}

.visual-orbit {
  position: absolute;
  width: 280px;
  height: 280px;
  border: 1px solid #5865f222;
  border-radius: 50%;
}

.orbit-inner {
  width: 200px;
  height: 200px;
  border-color: #ffffff0a;
}

.visual-card {
  position: relative;
  display: flex;
  width: min(82%, 360px);
  min-height: 80px;
  align-items: center;
  gap: 13px;
  padding: 13px 15px;
  border: 1px solid #ffffff0d;
  border-radius: 10px;
  background: #2b2d31;
  box-shadow: 0 12px 30px #1f202399;
}

.visual-card-secondary {
  transform: translateX(17px);
}

.visual-icon {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  place-items: center;
  border-radius: 10px;
  background: #5865f233;
  color: #aab0ff;
  font-size: 20px;
}

.spectator-icon {
  background: #3ba55c29;
  color: #57d98b;
}

.visual-card-copy {
  display: grid;
  flex: 1;
  gap: 5px;
}

.visual-card-copy strong {
  color: #f2f3f5;
  font-size: 13px;
}

.visual-card-copy small {
  color: #949ba4;
  font-size: 11px;
}

.visual-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3ba55c;
  box-shadow: 0 0 12px #3ba55c99;
}

.visual-live {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #57d98b;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.visual-live i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.visual-spark {
  position: absolute;
  color: #9299ff;
}

.spark-one {
  top: 24%;
  right: 17%;
  font-size: 20px;
}

.spark-two {
  bottom: 23%;
  left: 17%;
  color: #57d98b;
  font-size: 13px;
}

.page-caption {
  position: absolute;
  bottom: 20px;
  margin: 0;
  color: #949ba4;
  font-size: 12px;
}

@media (max-width: 720px) {
  .welcome-page {
    padding: 24px 16px 58px;
  }

  .welcome-card {
    width: min(100%, 500px);
    min-height: 0;
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
    gap: 30px;
    padding: 32px 24px;
  }

  .welcome-content {
    grid-column: 1;
    grid-row: 2;
    justify-items: center;
    padding: 8px 0;
  }

  .start-button {
    width: min(100%, 260px);
    margin-top: 34px;
  }

  .welcome-visual {
    grid-column: 1;
    grid-row: 1;
    min-height: 230px;
  }

  .visual-card {
    min-height: 72px;
  }

  .visual-orbit {
    width: 200px;
    height: 200px;
  }

  .orbit-inner {
    width: 142px;
    height: 142px;
  }

  .page-caption {
    bottom: 17px;
    font-size: 11px;
  }
}
</style>
