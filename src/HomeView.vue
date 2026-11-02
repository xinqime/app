<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  username: string
}>()

const emit = defineEmits<{
  logout: []
}>()

type Friend = {
  name: string
  initials: string
  status: string
  activity: string
  activityTitle: string
  activityIcon: string
  color: string
  online: boolean
}

const activeTab = ref('在线')
const searchQuery = ref('')
const friendRequestName = ref('')
const requestSent = ref(false)
const isSendingRequest = ref(false)
const requestError = ref('')
const isLoading = ref(true)
const loadError = ref('')
const activeServer = ref('N')
const tabs = ['在线', '全部', '待处理', '添加好友']
const friends = ref<Friend[]>([])

const visibleFriends = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return friends.value.filter((friend) => {
    const matchesSearch = friend.name.toLowerCase().includes(query)
    const matchesTab =
      activeTab.value === '全部' ||
      activeTab.value === '添加好友' ||
      (activeTab.value === '在线' && friend.online)
    return matchesSearch && matchesTab
  })
})

async function loadHome() {
  isLoading.value = true
  loadError.value = ''
  try {
    const response = await fetch('/api/home')
    const result = await response.json() as {
      code?: number
      message?: string
      msg?: string
      data?: { friends?: Friend[] }
    }

    if (!response.ok || result.code !== 0 || !result.data?.friends) {
      throw new Error(result.message || result.msg || '加载好友数据失败')
    }

    friends.value = result.data.friends
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载好友数据失败，请稍后重试'
  } finally {
    isLoading.value = false
  }
}

const displayName = computed(() => props.username || '新朋友')
const initials = computed(() => displayName.value.slice(0, 1).toUpperCase())

async function sendFriendRequest() {
  if (!friendRequestName.value.trim()) return
  isSendingRequest.value = true
  requestError.value = ''
  try {
    const response = await fetch('/api/friend-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: friendRequestName.value.trim() }),
    })
    const result = await response.json() as { code?: number; message?: string; msg?: string }
    if (!response.ok || result.code !== 0) {
      throw new Error(result.message || result.msg || '发送好友请求失败')
    }
    requestSent.value = true
  } catch (error) {
    requestError.value =
      error instanceof Error ? error.message : '发送好友请求失败，请稍后重试'
  } finally {
    isSendingRequest.value = false
  }
}

loadHome()
</script>

<template>
  <main class="discord-shell">
    <nav class="server-rail" aria-label="服务器">
      <button class="rail-icon home-icon selected" aria-label="私信" title="私信">◈</button>
      <div class="rail-divider"></div>
      <button
        v-for="server in ['N', 'S', '✦']"
        :key="server"
        class="rail-icon server-icon"
        :class="{ selected: activeServer === server }"
        :aria-label="`${server} 服务器`"
        @click="activeServer = server"
      >
        {{ server }}
      </button>
      <button class="rail-icon add-server" aria-label="添加服务器" title="添加服务器">+</button>
      <button class="rail-icon explore-icon" aria-label="探索服务器" title="探索服务器">⌕</button>
    </nav>

    <aside class="dm-sidebar">
      <button class="sidebar-search">查找或开始新的对话 <span>⌘ K</span></button>
      <div class="sidebar-nav">
        <button class="sidebar-link active"><span class="nav-glyph">◉</span> 好友</button>
        <button class="sidebar-link"><span class="nav-glyph">◌</span> Nitro</button>
        <button class="sidebar-link"><span class="nav-glyph">✉</span> 消息请求</button>
      </div>
      <div class="dm-heading">
        <span>私信</span>
        <button aria-label="新建私信" title="新建私信">＋</button>
      </div>
      <div class="dm-list">
        <button v-for="friend in friends.slice(0, 3)" :key="friend.name" class="dm-item">
          <span class="avatar small-avatar" :style="{ '--avatar-color': friend.color }">
            {{ friend.initials }}
            <i :class="{ online: friend.online }"></i>
          </span>
          <span>{{ friend.name }}</span>
          <span class="dm-more">×</span>
        </button>
      </div>
      <div class="profile-bar">
        <div class="profile-info">
          <span class="avatar profile-avatar">{{ initials }}<i class="online"></i></span>
          <span class="profile-copy">
            <strong>{{ displayName }}</strong>
            <small>在线</small>
          </span>
        </div>
        <div class="profile-actions">
          <button aria-label="麦克风" title="麦克风">♩</button>
          <button aria-label="耳机" title="耳机">◖</button>
          <button aria-label="退出登录" title="退出登录" @click="emit('logout')">↪</button>
        </div>
      </div>
    </aside>

    <section class="friends-page">
      <header class="topbar">
        <div class="topbar-title"><span>◉</span> 好友</div>
        <div class="topbar-divider"></div>
        <button class="topbar-action active">好友</button>
        <button class="topbar-action">商店</button>
        <button class="topbar-action">探索</button>
        <div class="topbar-spacer"></div>
        <button class="topbar-icon" aria-label="收件箱" title="收件箱">▤</button>
        <button class="topbar-icon help-icon" aria-label="帮助" title="帮助">?</button>
      </header>

      <div class="friends-layout">
        <section class="friends-main">
          <div class="friends-toolbar">
            <div class="friend-tabs" role="tablist" aria-label="好友筛选">
              <button
                v-for="tab in tabs"
                :key="tab"
                role="tab"
                :aria-selected="activeTab === tab"
                :class="{ selected: activeTab === tab, 'add-friend-tab': tab === '添加好友' }"
                @click="activeTab = tab; requestSent = false; requestError = ''"
              >
                {{ tab }}
              </button>
            </div>
            <label class="friend-search">
              <input v-model="searchQuery" type="search" placeholder="搜索" aria-label="搜索好友" />
              <span>⌕</span>
            </label>
          </div>

          <div v-if="activeTab === '添加好友'" class="add-friend-panel">
            <h1>添加好友</h1>
            <p>你可以使用用户名添加好友。</p>
            <form class="add-friend-form" @submit.prevent="sendFriendRequest">
              <input
                v-model="friendRequestName"
                aria-label="好友用户名"
                placeholder="输入用户名，例如 Luna"
              />
              <button type="submit" :disabled="!friendRequestName.trim() || requestSent || isSendingRequest">
                {{ isSendingRequest ? '正在发送…' : requestSent ? '已发送请求' : '发送好友请求' }}
              </button>
            </form>
            <p v-if="requestSent" class="request-feedback" role="status">好友请求已发送。</p>
            <p v-if="requestError" class="request-error" role="alert">{{ requestError }}</p>
          </div>

          <template v-else>
            <h2 class="section-heading">
              {{ activeTab === '待处理' ? '待处理的好友请求' : activeTab === '全部' ? '所有好友' : '在线' }}
              <span>{{ isLoading ? '…' : visibleFriends.length }}</span>
            </h2>
            <div v-if="isLoading" class="empty-state" role="status">
              <strong>正在加载好友…</strong>
            </div>
            <div v-else-if="loadError" class="empty-state" role="alert">
              <strong>{{ loadError }}</strong>
              <button class="retry-button" @click="loadHome">重试</button>
            </div>
            <div v-else-if="visibleFriends.length" class="friend-list">
              <article v-for="friend in visibleFriends" :key="friend.name" class="friend-row">
                <span class="avatar friend-avatar" :style="{ '--avatar-color': friend.color }">
                  {{ friend.initials }}
                  <i :class="{ online: friend.online }"></i>
                </span>
                <div class="friend-details">
                  <strong>{{ friend.name }}</strong>
                  <span>{{ friend.status }}</span>
                </div>
                <div class="friend-activity">{{ friend.activity }}</div>
                <div class="friend-actions">
                  <button :aria-label="`给 ${friend.name} 发消息`" title="发消息">▰</button>
                  <button :aria-label="`更多关于 ${friend.name} 的操作`" title="更多">•••</button>
                </div>
              </article>
            </div>
            <div v-else class="empty-state">
              <span class="empty-art" aria-hidden="true">⌕</span>
              <strong>{{ activeTab === '待处理' ? '暂时没有待处理请求' : '没有找到好友' }}</strong>
              <p>{{ activeTab === '待处理' ? '有新的好友请求时，它们会显示在这里。' : '试试其他搜索内容，或添加一位新朋友。' }}</p>
            </div>
          </template>
        </section>

        <aside class="activity-panel">
          <h2>活跃动态</h2>
          <p class="activity-intro">看看你的朋友们正在做什么。</p>
          <article
            v-for="friend in friends.filter((item) => item.online && item.activityTitle).slice(0, 2)"
            :key="friend.name"
            class="activity-card"
          >
            <div class="activity-user">
              <span class="avatar activity-avatar" :style="{ '--avatar-color': friend.color }">
                {{ friend.initials }}<i class="online"></i>
              </span>
              <div><strong>{{ friend.name }}</strong><small>正在 {{ friend.status.replace('正在', '') }}</small></div>
            </div>
            <div class="activity-detail">
              <span class="activity-cover">{{ friend.activityIcon }}</span>
              <span><strong>{{ friend.activityTitle }}</strong><small>{{ friend.activity }}</small></span>
            </div>
            <button class="join-button">一起加入</button>
          </article>
          <div class="activity-note">
            <span>✦</span>
            <p>当朋友开始游戏或分享动态时，你会在这里看到他们。</p>
          </div>
        </aside>
      </div>
    </section>
  </main>
</template>

<style scoped>
.discord-shell {
  --rail: #1e1f22;
  --sidebar: #2b2d31;
  --canvas: #313338;
  --surface: #383a40;
  --surface-hover: #404249;
  --text: #f2f3f5;
  --muted: #b5bac1;
  --subtle: #949ba4;
  --accent: #5865f2;
  display: flex;
  width: 100%;
  min-width: 360px;
  height: 100vh;
  overflow: hidden;
  background: var(--canvas);
  color: var(--text);
  font-family: 'DM Sans', 'Noto Sans SC', sans-serif;
  font-size: 14px;
}

button,
input {
  color: inherit;
  font: inherit;
}

button {
  border: 0;
  cursor: pointer;
}

.server-rail {
  z-index: 1;
  display: flex;
  width: 72px;
  flex: 0 0 72px;
  align-items: center;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0;
  background: var(--rail);
}

.rail-icon {
  position: relative;
  display: grid;
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  place-items: center;
  border-radius: 50%;
  background: var(--sidebar);
  color: #dbdee1;
  font-size: 19px;
  font-weight: 700;
  transition: border-radius 150ms ease, background 150ms ease, color 150ms ease;
}

.rail-icon:hover,
.rail-icon.selected {
  border-radius: 16px;
  background: var(--accent);
  color: white;
}

.home-icon {
  background: var(--accent);
  font-size: 24px;
}

.rail-divider {
  width: 32px;
  height: 2px;
  margin: 2px 0;
  border-radius: 2px;
  background: #35363c;
}

.add-server,
.explore-icon {
  color: #23a559;
  font-size: 27px;
  font-weight: 400;
}

.explore-icon {
  color: #23a559;
  font-size: 25px;
}

.dm-sidebar {
  position: relative;
  display: flex;
  width: 240px;
  flex: 0 0 240px;
  flex-direction: column;
  background: var(--sidebar);
}

.sidebar-search {
  height: 48px;
  margin: 0 10px;
  padding: 0 8px;
  border-bottom: 1px solid #25262a;
  background: transparent;
  color: var(--subtle);
  font-size: 12px;
  text-align: left;
}

.sidebar-search span {
  float: right;
  padding: 2px 5px;
  border-radius: 4px;
  background: #202125;
  font-size: 10px;
}

.sidebar-nav {
  display: grid;
  gap: 2px;
  padding: 16px 8px 14px;
}

.sidebar-link,
.dm-item {
  display: flex;
  height: 42px;
  align-items: center;
  gap: 14px;
  padding: 0 12px;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font-weight: 600;
  text-align: left;
}

.sidebar-link:hover,
.dm-item:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.sidebar-link.active {
  background: #404249;
  color: var(--text);
}

.nav-glyph {
  width: 19px;
  color: var(--subtle);
  font-size: 18px;
  text-align: center;
}

.dm-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px 6px;
  color: var(--subtle);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.dm-heading button {
  background: transparent;
  color: var(--muted);
  font-size: 20px;
}

.dm-list {
  padding: 4px 8px;
}

.dm-item {
  width: 100%;
  gap: 10px;
  padding: 0 8px;
  font-weight: 500;
}

.dm-more {
  display: none;
  margin-left: auto;
  color: var(--muted);
  font-size: 19px;
}

.dm-item:hover .dm-more {
  display: block;
}

.avatar {
  position: relative;
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: var(--avatar-color, #5865f2);
  color: white;
  font-size: 15px;
  font-weight: 700;
}

.avatar i {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 13px;
  height: 13px;
  border: 3px solid var(--sidebar);
  border-radius: 50%;
  background: #747f8d;
}

.avatar i.online {
  background: #23a559;
}

.small-avatar {
  width: 32px;
  height: 32px;
  font-size: 12px;
}

.small-avatar i {
  width: 11px;
  height: 11px;
}

.profile-bar {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  min-height: 53px;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  background: #232428;
}

.profile-info,
.profile-actions {
  display: flex;
  align-items: center;
}

.profile-info {
  min-width: 0;
  gap: 9px;
}

.profile-avatar {
  width: 32px;
  height: 32px;
  font-size: 13px;
}

.profile-avatar i {
  border-color: #232428;
}

.profile-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.profile-copy strong {
  overflow: hidden;
  max-width: 88px;
  font-size: 12px;
  text-overflow: ellipsis;
}

.profile-copy small {
  color: var(--muted);
  font-size: 10px;
}

.profile-actions {
  gap: 1px;
}

.profile-actions button,
.topbar-icon {
  width: 29px;
  height: 32px;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font-size: 17px;
}

.profile-actions button:hover,
.topbar-icon:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.friends-page {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.topbar {
  display: flex;
  height: 48px;
  flex: 0 0 48px;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  border-bottom: 1px solid #28292e;
  box-shadow: 0 1px 3px rgb(0 0 0 / 20%);
}

.topbar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}

.topbar-title span {
  color: var(--muted);
  font-size: 18px;
}

.topbar-divider {
  width: 1px;
  height: 24px;
  background: #45474e;
}

.topbar-action {
  padding: 6px 9px;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
}

.topbar-action:hover,
.topbar-action.active {
  background: #404249;
  color: var(--text);
}

.topbar-spacer {
  flex: 1;
}

.topbar-icon {
  width: 30px;
}

.help-icon {
  border: 1px solid var(--subtle);
  border-radius: 50%;
  width: 18px;
  height: 18px;
  font-size: 12px;
  line-height: 16px;
}

.friends-layout {
  display: flex;
  min-height: 0;
  flex: 1;
}

.friends-main {
  min-width: 0;
  flex: 1;
  padding: 24px 30px;
}

.friends-toolbar {
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #45474e;
}

.friend-tabs {
  display: flex;
  align-items: center;
  gap: 16px;
}

.friend-tabs button {
  padding: 7px 4px;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font-weight: 600;
  white-space: nowrap;
}

.friend-tabs button:hover,
.friend-tabs button.selected {
  background: #404249;
  color: var(--text);
}

.friend-tabs .add-friend-tab {
  padding: 6px 9px;
  background: #248046;
  color: white;
}

.friend-tabs .add-friend-tab:hover,
.friend-tabs .add-friend-tab.selected {
  background: #2d9a55;
  color: white;
}

.friend-search {
  display: flex;
  width: 180px;
  height: 30px;
  align-items: center;
  padding: 0 8px;
  border-radius: 4px;
  background: #1e1f22;
  color: var(--subtle);
}

.friend-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: 12px;
}

.friend-search input::placeholder {
  color: var(--subtle);
}

.friend-search span {
  font-size: 18px;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 22px 0 10px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.section-heading span {
  color: var(--subtle);
  font-size: 10px;
}

.friend-row {
  display: flex;
  min-height: 68px;
  align-items: center;
  gap: 12px;
  padding: 0 8px;
  border-top: 1px solid #3b3d43;
}

.friend-row:hover {
  border-radius: 7px;
  background: #393b42;
}

.friend-avatar {
  width: 38px;
  height: 38px;
}

.friend-avatar i {
  border-color: #313338;
}

.friend-details {
  display: grid;
  min-width: 90px;
  gap: 4px;
}

.friend-details strong {
  font-size: 14px;
}

.friend-details span,
.friend-activity {
  color: var(--muted);
  font-size: 11px;
}

.friend-activity {
  overflow: hidden;
  margin-left: auto;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.friend-actions {
  display: flex;
  gap: 8px;
  margin-left: 12px;
}

.friend-actions button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 50%;
  background: #232428;
  color: #dbdee1;
}

.friend-actions button:hover {
  background: #1e1f22;
  color: white;
}

.empty-state {
  display: grid;
  justify-items: center;
  gap: 9px;
  padding: 54px 10px;
  color: var(--muted);
  text-align: center;
}

.empty-art {
  display: grid;
  width: 86px;
  height: 86px;
  place-items: center;
  margin-bottom: 5px;
  border-radius: 50%;
  background: #292a2f;
  color: #737b86;
  font-size: 38px;
}

.empty-state strong {
  color: var(--text);
}

.empty-state p,
.activity-intro {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

.add-friend-panel {
  padding: 28px 2px;
}

.add-friend-panel h1 {
  margin: 0 0 8px;
  font-size: 18px;
}

.add-friend-panel p {
  margin: 0 0 18px;
  color: var(--muted);
  font-size: 13px;
}

.add-friend-form {
  display: flex;
  max-width: 620px;
  height: 48px;
  gap: 8px;
  padding: 6px;
  border: 1px solid #202125;
  border-radius: 7px;
  background: #1e1f22;
}

.add-friend-form input {
  min-width: 0;
  flex: 1;
  padding: 0 9px;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 13px;
}

.add-friend-form input::placeholder {
  color: #777e88;
}

.add-friend-form button,
.join-button {
  padding: 0 12px;
  border-radius: 4px;
  background: var(--accent);
  color: white;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.add-friend-form button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.add-friend-panel .request-feedback {
  margin-top: 12px;
  color: #57f287;
}

.add-friend-panel .request-error {
  margin-top: 12px;
  color: #f2a6a6;
}

.retry-button {
  padding: 7px 12px;
  border-radius: 4px;
  background: var(--accent);
  color: white;
}

.activity-panel {
  width: 292px;
  flex: 0 0 292px;
  padding: 24px 20px;
  border-left: 1px solid #28292e;
}

.activity-panel h2 {
  margin: 2px 0 8px;
  font-size: 16px;
}

.activity-intro {
  margin-bottom: 20px;
  line-height: 1.6;
}

.activity-card {
  margin-bottom: 12px;
  padding: 13px;
  border: 1px solid #41434a;
  border-radius: 8px;
  background: #2b2d31;
}

.activity-user,
.activity-detail {
  display: flex;
  align-items: center;
  gap: 10px;
}

.activity-avatar {
  width: 34px;
  height: 34px;
  font-size: 12px;
}

.activity-avatar i {
  border-color: #2b2d31;
}

.activity-user > div,
.activity-detail > span:last-child {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.activity-user strong,
.activity-detail strong {
  font-size: 12px;
}

.activity-user small,
.activity-detail small {
  overflow: hidden;
  color: var(--muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-detail {
  margin: 13px 0;
  padding: 10px;
  border-radius: 5px;
  background: #202125;
}

.activity-cover {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius: 4px;
  background: linear-gradient(135deg, #5c437d, #202c53);
  font-size: 18px;
}

.join-button {
  width: 100%;
  height: 30px;
  background: #404249;
}

.join-button:hover {
  background: #4b4e56;
}

.activity-note {
  display: flex;
  gap: 10px;
  margin-top: 20px;
  color: var(--subtle);
}

.activity-note span {
  color: #f0b232;
}

.activity-note p {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
}

@media (max-width: 1100px) {
  .activity-panel {
    display: none;
  }
}

@media (max-width: 760px) {
  .dm-sidebar {
    display: none;
  }

  .friends-main {
    padding: 18px 16px;
  }

  .friends-toolbar {
    align-items: flex-start;
    flex-direction: column-reverse;
    padding-bottom: 8px;
  }

  .friend-search {
    width: 100%;
  }

  .friend-tabs {
    width: 100%;
    justify-content: space-between;
    gap: 5px;
  }

  .friend-tabs button {
    font-size: 12px;
  }

  .topbar {
    gap: 8px;
    padding: 0 12px;
  }

  .topbar-action {
    padding: 6px;
    font-size: 12px;
  }
}

@media (max-width: 480px) {
  .discord-shell {
    min-width: 320px;
  }

  .server-rail {
    width: 58px;
    flex-basis: 58px;
  }

  .rail-icon {
    width: 42px;
    height: 42px;
    flex-basis: 42px;
  }

  .friend-activity {
    display: none;
  }

  .friend-actions {
    gap: 4px;
    margin-left: auto;
  }

  .friend-tabs {
    overflow-x: auto;
  }

  .topbar-divider,
  .topbar-action:not(.active) {
    display: none;
  }
}
</style>
