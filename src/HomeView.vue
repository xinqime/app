<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  username: string
}>()

const emit = defineEmits<{
  logout: []
}>()

type GroupChat = {
  id: string
  name: string
  description: string
  tags: string[]
  memberCount: number
  onlineCount: number
  icon: string
  color: string
  joined: boolean
}

type ChatMessage = {
  id: string
  senderId: string
  senderName: string
  avatar: string
  color: string
  content: string
  replyTo?: {
    senderId: string
    content: string
  }
}

type ChatTarget = {
  id: string
  name: string
  avatar: string
  color: string
}

const activeView = ref<'groups' | 'chat'>('groups')
const activeChat = ref<ChatTarget | null>(null)
const chatMessages = ref<ChatMessage[]>([])
const chatDraft = ref('')
const replyTarget = ref<ChatMessage | null>(null)
const activeMessageMenuKey = ref('')
const blockedSenderIds = ref(new Set<string>())
const revealedMessageKeys = ref(new Set<string>())
const isLoadingMessages = ref(false)
const isSendingMessage = ref(false)
const chatError = ref('')
const groupChats = ref<GroupChat[]>([])
const selectedInterest = ref('全部')
const groupLoadError = ref('')
const joiningGroupId = ref('')
const groupJoinError = ref('')
const wantsToStayTomorrow = ref(false)
const isLoadingStayTomorrow = ref(false)
const isSettingStayTomorrow = ref(false)
const stayTomorrowError = ref('')
const isLeavingGroup = ref(false)
const groupLeaveError = ref('')
const isGroupToolsOpen = ref(false)

const interestTags = computed(() => [
  '全部',
  ...new Set(groupChats.value.flatMap((group) => group.tags)),
])
const visibleGroupChats = computed(() =>
  groupChats.value.filter(
    (group) => selectedInterest.value === '全部' || group.tags.includes(selectedInterest.value),
  ),
)
const joinedGroupChats = computed(() => groupChats.value.filter((group) => group.joined))

async function loadGroupChats() {
  groupLoadError.value = ''
  try {
    const response = await fetch('/api/group-chats')
    const result = await response.json() as {
      code?: number
      message?: string
      msg?: string
      data?: { groupChats?: GroupChat[] }
    }

    if (!response.ok || result.code !== 0 || !result.data?.groupChats) {
      throw new Error(result.message || result.msg || '加载群聊失败')
    }

    groupChats.value = result.data.groupChats
  } catch (error) {
    groupLoadError.value = error instanceof Error ? error.message : '加载群聊失败，请稍后重试'
  }
}

const displayName = computed(() => props.username || '新朋友')
const initials = computed(() => displayName.value.slice(0, 1).toUpperCase())
const currentUserId = computed(() => `${displayName.value.toLowerCase()}#0001`)

function getMessageKey(message: ChatMessage) {
  return `${activeChat.value?.id}:${message.id}`
}

function isMessageMasked(message: ChatMessage) {
  return blockedSenderIds.value.has(message.senderId) &&
    !revealedMessageKeys.value.has(getMessageKey(message))
}

function toggleMessageOptions(message: ChatMessage) {
  const key = getMessageKey(message)
  activeMessageMenuKey.value = activeMessageMenuKey.value === key ? '' : key
}

function replyToMessage(message: ChatMessage) {
  replyTarget.value = message
  activeMessageMenuKey.value = ''
}

function blockMessageSender(message: ChatMessage) {
  blockedSenderIds.value.add(message.senderId)
  for (const chatMessage of chatMessages.value) {
    if (chatMessage.senderId === message.senderId) {
      revealedMessageKeys.value.delete(getMessageKey(chatMessage))
    }
  }
  activeMessageMenuKey.value = ''
}

function revealMessage(message: ChatMessage) {
  revealedMessageKeys.value.add(getMessageKey(message))
  activeMessageMenuKey.value = ''
}

function unblockMessageSender(message: ChatMessage) {
  blockedSenderIds.value.delete(message.senderId)
  for (const chatMessage of chatMessages.value) {
    if (chatMessage.senderId === message.senderId) {
      revealedMessageKeys.value.delete(getMessageKey(chatMessage))
    }
  }
  activeMessageMenuKey.value = ''
}

async function loadStayTomorrowPreference(target: ChatTarget) {
  isLoadingStayTomorrow.value = true
  stayTomorrowError.value = ''
  try {
    const response = await fetch(
      `/api/group-chats/${target.id}/see-you-tomorrow?userId=${encodeURIComponent(currentUserId.value)}`,
    )
    const result = await response.json() as {
      code?: number
      message?: string
      msg?: string
      data?: { wantsToStayTomorrow?: boolean }
    }
    if (!response.ok || result.code !== 0 || typeof result.data?.wantsToStayTomorrow !== 'boolean') {
      throw new Error(result.message || result.msg || '加载群聊意愿失败')
    }
    if (activeChat.value?.id === target.id) {
      wantsToStayTomorrow.value = result.data.wantsToStayTomorrow
    }
  } catch (error) {
    if (activeChat.value?.id === target.id) {
      stayTomorrowError.value = error instanceof Error ? error.message : '加载群聊意愿失败，请稍后重试'
    }
  } finally {
    if (activeChat.value?.id === target.id) {
      isLoadingStayTomorrow.value = false
    }
  }
}

async function openChat(target: ChatTarget) {
  activeChat.value = target
  activeView.value = 'chat'
  chatMessages.value = []
  activeMessageMenuKey.value = ''
  chatError.value = ''
  replyTarget.value = null
  wantsToStayTomorrow.value = false
  isLoadingStayTomorrow.value = true
  stayTomorrowError.value = ''
  groupLeaveError.value = ''
  void loadStayTomorrowPreference(target)
  isLoadingMessages.value = true
  try {
    const response = await fetch(`/api/group-chats/${target.id}/messages`)
    const result = await response.json() as {
      code?: number
      message?: string
      msg?: string
      data?: { messages?: ChatMessage[] }
    }
    if (!response.ok || result.code !== 0 || !result.data?.messages) {
      throw new Error(result.message || result.msg || '加载聊天记录失败')
    }
    chatMessages.value = result.data.messages
  } catch (error) {
    chatError.value = error instanceof Error ? error.message : '加载聊天记录失败，请稍后重试'
  } finally {
    isLoadingMessages.value = false
  }
}

async function setStayTomorrowPreference() {
  const target = activeChat.value
  if (
    !target ||
    wantsToStayTomorrow.value ||
    isLeavingGroup.value ||
    isSettingStayTomorrow.value
  ) return

  isSettingStayTomorrow.value = true
  stayTomorrowError.value = ''
  try {
    const response = await fetch(`/api/group-chats/${target.id}/see-you-tomorrow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUserId.value }),
    })
    const result = await response.json() as {
      code?: number
      message?: string
      msg?: string
      data?: { wantsToStayTomorrow?: boolean }
    }
    if (!response.ok || result.code !== 0 || result.data?.wantsToStayTomorrow !== true) {
      throw new Error(result.message || result.msg || '提交群聊意愿失败')
    }
    if (activeChat.value?.id === target.id) {
      wantsToStayTomorrow.value = true
    }
  } catch (error) {
    if (activeChat.value?.id === target.id) {
      stayTomorrowError.value = error instanceof Error ? error.message : '提交群聊意愿失败，请稍后重试'
    }
  } finally {
    isSettingStayTomorrow.value = false
  }
}

async function leaveGroupChat() {
  const target = activeChat.value
  if (!target || isLeavingGroup.value) return

  isLeavingGroup.value = true
  groupLeaveError.value = ''
  try {
    const response = await fetch(`/api/group-chats/${target.id}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUserId.value }),
    })
    const result = await response.json() as {
      code?: number
      message?: string
      msg?: string
      data?: { groupChat?: GroupChat }
    }
    if (!response.ok || result.code !== 0 || !result.data?.groupChat) {
      throw new Error(result.message || result.msg || '退出群聊失败')
    }
    const index = groupChats.value.findIndex((group) => group.id === target.id)
    if (index !== -1) groupChats.value[index] = result.data.groupChat
    closeChat()
  } catch (error) {
    if (activeChat.value?.id === target.id) {
      groupLeaveError.value = error instanceof Error ? error.message : '退出群聊失败，请稍后重试'
    }
  } finally {
    isLeavingGroup.value = false
  }
}

function closeChat() {
  activeView.value = 'groups'
  activeChat.value = null
  chatMessages.value = []
  activeMessageMenuKey.value = ''
  chatDraft.value = ''
  replyTarget.value = null
  chatError.value = ''
  wantsToStayTomorrow.value = false
  isLoadingStayTomorrow.value = false
  stayTomorrowError.value = ''
  groupLeaveError.value = ''
}

async function sendChatMessage() {
  const content = chatDraft.value.trim()
  const target = activeChat.value
  if (!content || !target || isSendingMessage.value) return

  isSendingMessage.value = true
  chatError.value = ''
  try {
    const response = await fetch(`/api/group-chats/${target.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: currentUserId.value,
        senderName: displayName.value,
        avatar: initials.value,
        color: '#5865f2',
        content,
        ...(replyTarget.value
          ? {
              replyTo: {
                senderId: replyTarget.value.senderId,
                content: replyTarget.value.content,
              },
            }
          : {}),
      }),
    })
    const result = await response.json() as {
      code?: number
      message?: string
      msg?: string
      data?: { message?: ChatMessage }
    }
    if (!response.ok || result.code !== 0 || !result.data?.message) {
      throw new Error(result.message || result.msg || '发送消息失败')
    }
    chatMessages.value.push(result.data.message)
    chatDraft.value = ''
    replyTarget.value = null
  } catch (error) {
    chatError.value = error instanceof Error ? error.message : '发送消息失败，请稍后重试'
  } finally {
    isSendingMessage.value = false
  }
}

async function joinGroupChat(group: GroupChat) {
  if (group.joined) return
  joiningGroupId.value = group.id
  groupJoinError.value = ''
  try {
    const response = await fetch(`/api/group-chats/${group.id}/join`, { method: 'POST' })
    const result = await response.json() as {
      code?: number
      message?: string
      msg?: string
      data?: { groupChat?: GroupChat }
    }
    if (!response.ok || result.code !== 0 || !result.data?.groupChat) {
      throw new Error(result.message || result.msg || '加入群聊失败')
    }
    const index = groupChats.value.findIndex((item) => item.id === group.id)
    if (index !== -1) groupChats.value[index] = result.data.groupChat
  } catch (error) {
    groupJoinError.value = error instanceof Error ? error.message : '加入群聊失败，请稍后重试'
  } finally {
    joiningGroupId.value = ''
  }
}

loadGroupChats()
</script>

<template>
  <main class="discord-shell">
    <nav class="server-rail" aria-label="服务器">
      <button class="rail-icon home-icon selected" aria-label="群聊" title="群聊">▦</button>
      <div class="rail-divider"></div>
      <button class="rail-icon add-server" aria-label="添加服务器" title="添加服务器">+</button>
      <button class="rail-icon explore-icon" aria-label="探索服务器" title="探索服务器">⌕</button>
    </nav>

    <aside class="dm-sidebar">
      <button class="sidebar-search" @click="activeView = 'groups'">群聊 <span>⌘ K</span></button>
      <div class="sidebar-nav">
        <button
          class="sidebar-link"
          :class="{ active: activeView === 'groups' }"
          @click="activeView = 'groups'"
        >
          <span class="nav-glyph">▦</span> 群聊
        </button>
      </div>
      <div v-if="joinedGroupChats.length" class="joined-groups">
        <div class="dm-heading"><span>已加入的群聊</span></div>
        <button
          v-for="group in joinedGroupChats"
          :key="group.id"
          class="dm-item joined-group"
          @click="openChat({ id: group.id, name: group.name, avatar: group.icon, color: group.color })"
        >
          <span class="group-mini-icon" :style="{ '--group-color': group.color }">{{ group.icon }}</span>
          <span>{{ group.name }}</span>
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

    <section class="main-page">
      <header class="topbar">
        <button v-if="activeView === 'chat'" class="chat-back" aria-label="返回" @click="closeChat">‹</button>
        <div class="topbar-title">
          <span>{{ activeView === 'groups' ? '▦' : activeChat?.avatar }}</span>
          {{ activeView === 'groups' ? '群聊' : activeChat?.name }}
        </div>
        <div v-if="activeView !== 'chat'" class="topbar-divider"></div>
        <button
          v-if="activeView !== 'chat'"
          class="topbar-action view-switch"
          :class="{ active: activeView === 'groups' }"
          @click="activeView = 'groups'"
        >
          群聊
        </button>
        <button v-if="activeView !== 'chat'" class="topbar-action">商店</button>
        <button v-if="activeView !== 'chat'" class="topbar-action">探索</button>
        <div class="topbar-spacer"></div>
        <button v-if="activeView !== 'chat'" class="topbar-icon" aria-label="收件箱" title="收件箱">▤</button>
        <button v-if="activeView !== 'chat'" class="topbar-icon help-icon" aria-label="帮助" title="帮助">?</button>
      </header>

      <div v-if="activeView === 'groups'" class="groups-layout">
        <section class="groups-main">
          <div class="groups-heading">
            <div>
              <h1>找到你的兴趣群聊</h1>
              <p>按兴趣标签浏览，点击即可直接加入，无需申请。群聊每天凌晨自动删除，除非有人主动选择延续</p>
            </div>
          </div>
          <div class="interest-filters" role="group" aria-label="按兴趣标签筛选群聊">
            <button
              v-for="tag in interestTags"
              :key="tag"
              :aria-pressed="selectedInterest === tag"
              :class="{ selected: selectedInterest === tag }"
              @click="selectedInterest = tag"
            >
              {{ tag === '全部' ? '全部兴趣' : `# ${tag}` }}
            </button>
          </div>
          <div v-if="groupLoadError" class="group-empty-state" role="alert">
            <strong>{{ groupLoadError }}</strong>
            <button class="retry-button" @click="loadGroupChats">重试</button>
          </div>
          <div v-else-if="visibleGroupChats.length" class="group-card-grid">
            <article v-for="group in visibleGroupChats" :key="group.id" class="group-card">
              <div class="group-card-banner" :style="{ '--group-color': group.color }">
                <span class="group-card-icon">{{ group.icon }}</span>
                <span class="group-online">{{ group.onlineCount }} 人在线</span>
              </div>
              <div class="group-card-content">
                <h2>{{ group.name }}</h2>
                <p class="group-description">{{ group.description }}</p>
                <div class="group-tags" aria-label="兴趣标签">
                  <span v-for="tag in group.tags" :key="tag"># {{ tag }}</span>
                </div>
                <div class="group-card-footer">
                  <span>{{ group.memberCount }} 位成员</span>
                  <button
                    :class="{ joined: group.joined }"
                    :disabled="joiningGroupId === group.id"
                    @click="group.joined
                      ? openChat({ id: group.id, name: group.name, avatar: group.icon, color: group.color })
                      : joinGroupChat(group)"
                  >
                    {{
                      group.joined
                        ? '进入聊天'
                        : joiningGroupId === group.id
                          ? '正在加入…'
                          : '直接加入'
                    }}
                  </button>
                </div>
              </div>
            </article>
          </div>
          <div v-else class="group-empty-state">
            <strong>这个兴趣标签下暂时还没有群聊</strong>
            <p>试试其他兴趣标签。</p>
          </div>
          <p v-if="groupJoinError" class="group-error" role="alert">{{ groupJoinError }}</p>
        </section>
        <aside class="group-guide">
          <span class="group-guide-icon">✦</span>
          <h2>加入感兴趣的群聊</h2>
          <p>选择兴趣标签发现同好。加入后，群聊会出现在左侧列表中，你可以随时回来继续探索。</p>
          <div class="group-guide-count">
            <strong>{{ joinedGroupChats.length }}</strong>
            <span>已加入群聊</span>
          </div>
        </aside>
      </div>

      <section v-else class="chat-view" aria-label="聊天">
        <div class="chat-context">
          <span>群聊</span>
          <strong>{{ activeChat?.name }}</strong>
        </div>
        <div class="chat-content">
          <div class="chat-message-pane">
            <div v-if="isLoadingMessages" class="chat-state" role="status">正在加载聊天记录…</div>
            <div v-else-if="chatError && !chatMessages.length" class="chat-state" role="alert">
              <strong>{{ chatError }}</strong>
              <button class="retry-button" @click="activeChat && openChat(activeChat)">重试</button>
            </div>
            <div v-else class="chat-messages" role="log" aria-label="聊天消息">
              <div v-if="!chatMessages.length" class="chat-state">还没有消息，发送第一条消息吧。</div>
              <article
                v-for="message in chatMessages"
                :key="message.id"
                class="chat-message"
                :class="{ 'own-message': message.senderId === currentUserId }"
              >
                <template v-if="message.senderId === currentUserId">
                  <div class="chat-message-body">
                    <div v-if="message.replyTo" class="message-reply-context">
                      回复 {{ message.replyTo.senderId }}：{{ message.replyTo.content }}
                    </div>
                    <p>{{ message.content }}</p>
                  </div>
                </template>
                <template v-else>
                  <span class="avatar chat-avatar" :style="{ '--avatar-color': message.color }">
                    {{ message.avatar }}
                  </span>
                  <div class="chat-message-body">
                    <strong class="chat-sender-id">{{ message.senderId }}</strong>
                    <div v-if="message.replyTo" class="message-reply-context">
                      回复 {{ message.replyTo.senderId }}：{{ message.replyTo.content }}
                    </div>
                    <button
                      class="chat-reply-trigger"
                      :aria-label="isMessageMasked(message) ? `已屏蔽 ${message.senderId} 的发言，点击查看选项` : `查看 ${message.senderId} 的发言选项`"
                      :aria-expanded="activeMessageMenuKey === getMessageKey(message)"
                      @click="toggleMessageOptions(message)"
                    >
                      <p :class="{ 'message-masked': isMessageMasked(message) }">
                        {{ message.content }}
                      </p>
                    </button>
                    <div
                      v-if="activeMessageMenuKey === getMessageKey(message)"
                      class="message-options"
                      role="group"
                      :aria-label="`${message.senderId} 的发言选项`"
                    >
                      <template v-if="isMessageMasked(message)">
                        <button type="button" @click="revealMessage(message)">查看内容</button>
                        <button type="button" @click="unblockMessageSender(message)">取消屏蔽</button>
                      </template>
                      <template v-else>
                        <button type="button" @click="replyToMessage(message)">回复</button>
                        <button type="button" @click="blockMessageSender(message)">屏蔽</button>
                      </template>
                    </div>
                  </div>
                </template>
              </article>
            </div>
          </div>
          <aside
            v-if="isGroupToolsOpen"
            id="group-chat-tools"
            class="chat-tools"
            aria-label="群聊工具"
          >
            <button
              class="chat-tool-button"
              :class="{ selected: wantsToStayTomorrow }"
              :aria-pressed="wantsToStayTomorrow"
              title="延续群聊到明天"
              :disabled="wantsToStayTomorrow || isLoadingStayTomorrow || isSettingStayTomorrow || isLeavingGroup"
              @click="setStayTomorrowPreference"
            >
              <span aria-hidden="true">☀</span>
              {{ wantsToStayTomorrow ? '明天见 ✓' : '明天见' }}
            </button>
            <p v-if="wantsToStayTomorrow" class="chat-tool-confirmation" role="status">
              已告诉群聊：你明天还会在。
            </p>
            <p v-if="stayTomorrowError" class="chat-tool-error" role="alert">
              {{ stayTomorrowError }}
            </p>
            <button
              class="chat-tool-button leave-group-button"
              title="立刻退出该群"
              :disabled="isLeavingGroup || isLoadingStayTomorrow || isSettingStayTomorrow"
              @click="leaveGroupChat"
            >
              <span aria-hidden="true">↪</span>
              {{ isLeavingGroup ? '正在退出…' : '退出群聊' }}
            </button>
            <p v-if="groupLeaveError" class="chat-tool-error" role="alert">
              {{ groupLeaveError }}
            </p>
          </aside>
        </div>
        <p v-if="chatError && chatMessages.length" class="chat-error" role="alert">{{ chatError }}</p>
        <div v-if="replyTarget" class="reply-preview">
          <div class="reply-preview-copy">
            <strong>回复 {{ replyTarget.senderId }}</strong>
            <span>{{ replyTarget.content }}</span>
          </div>
          <button type="button" aria-label="取消回复" @click="replyTarget = null">×</button>
        </div>
        <form class="chat-composer" @submit.prevent="sendChatMessage">
          <input
            v-model="chatDraft"
            type="text"
            aria-label="输入文字消息"
            placeholder="发送文字消息…"
            autocomplete="off"
            maxlength="2000"
          />
          <button type="submit" :disabled="!chatDraft.trim() || isSendingMessage">
            {{ isSendingMessage ? '发送中…' : '发送' }}
          </button>
          <button
            v-if="activeChat"
            type="button"
            class="chat-tools-toggle"
            :aria-expanded="isGroupToolsOpen"
            aria-controls="group-chat-tools"
            :aria-label="isGroupToolsOpen ? '收起群聊工具栏' : '展开群聊工具栏'"
            :title="isGroupToolsOpen ? '收起工具栏' : '展开工具栏'"
            @click="isGroupToolsOpen = !isGroupToolsOpen"
          >
            <span class="desktop-tools-toggle-icon" aria-hidden="true">
              {{ isGroupToolsOpen ? '›' : '‹' }}
            </span>
            <span class="mobile-tools-toggle-icon" aria-hidden="true">
              {{ isGroupToolsOpen ? '⌃' : '⌄' }}
            </span>
          </button>
        </form>
      </section>
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

.main-page {
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

.retry-button {
  padding: 7px 12px;
  border-radius: 4px;
  background: var(--accent);
  color: white;
}

.joined-groups {
  max-height: 180px;
  overflow-y: auto;
}

.joined-group {
  height: 38px;
  font-size: 12px;
}

.group-mini-icon {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  place-items: center;
  border-radius: 8px;
  background: var(--group-color);
  color: white;
  font-size: 12px;
  font-weight: 700;
}

.groups-layout {
  display: flex;
  min-height: 0;
  flex: 1;
  overflow: auto;
}

.groups-main {
  min-width: 0;
  flex: 1;
  padding: 28px 30px;
}

.groups-heading h1 {
  margin: 0;
  font-size: 21px;
}

.groups-heading p {
  margin: 8px 0 22px;
  color: var(--muted);
  font-size: 13px;
}

.interest-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 22px;
}

.interest-filters button,
.group-tags span {
  padding: 7px 11px;
  border: 1px solid #45474e;
  border-radius: 18px;
  background: #383a40;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}

.interest-filters button:hover {
  background: #404249;
  color: var(--text);
}

.interest-filters button.selected {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.group-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 16px;
}

.group-card {
  overflow: hidden;
  border: 1px solid #41434a;
  border-radius: 10px;
  background: #2b2d31;
  transition: border-color 150ms ease, transform 150ms ease;
}

.group-card:hover {
  transform: translateY(-2px);
  border-color: #60636c;
}

.group-card-banner {
  display: flex;
  height: 105px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 15px;
  background:
    radial-gradient(circle at 85% 20%, rgb(255 255 255 / 19%), transparent 30%),
    linear-gradient(135deg, var(--group-color), #292a30);
}

.group-card-icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border: 2px solid rgb(255 255 255 / 24%);
  border-radius: 15px;
  background: rgb(25 26 30 / 40%);
  color: white;
  font-size: 22px;
  font-weight: 700;
}

.group-online {
  padding: 5px 8px;
  border-radius: 12px;
  background: rgb(25 26 30 / 50%);
  color: white;
  font-size: 10px;
}

.group-card-content {
  padding: 15px;
}

.group-card-content h2 {
  overflow: hidden;
  margin: 0 0 8px;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-description {
  min-height: 38px;
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.group-tags {
  display: flex;
  min-height: 28px;
  flex-wrap: wrap;
  gap: 6px;
}

.group-tags span {
  padding: 4px 8px;
  border: 0;
  background: #383a40;
  font-size: 10px;
}

.group-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 15px;
  padding-top: 12px;
  border-top: 1px solid #41434a;
}

.group-card-footer > span {
  color: var(--muted);
  font-size: 11px;
}

.group-card-footer button {
  min-width: 88px;
  height: 31px;
  padding: 0 10px;
  border-radius: 5px;
  background: var(--accent);
  color: white;
  font-size: 11px;
  font-weight: 700;
}

.group-card-footer button:hover:not(:disabled) {
  background: #4752c4;
}

.group-card-footer button:disabled {
  cursor: default;
}

.group-card-footer button.joined {
  background: #3b3d43;
  color: #b5bac1;
}

.group-guide {
  width: 270px;
  flex: 0 0 270px;
  padding: 35px 22px;
  border-left: 1px solid #28292e;
}

.group-guide-icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 14px;
  background: #4a3e70;
  color: #dfc7ff;
  font-size: 22px;
}

.group-guide h2 {
  margin: 18px 0 9px;
  font-size: 16px;
}

.group-guide p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
}

.group-guide-count {
  display: grid;
  gap: 4px;
  margin-top: 24px;
  padding: 14px;
  border-radius: 8px;
  background: #2b2d31;
}

.group-guide-count strong {
  font-size: 20px;
}

.group-guide-count span {
  color: var(--muted);
  font-size: 11px;
}

.group-empty-state {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 50px 15px;
  color: var(--muted);
  text-align: center;
}

.group-empty-state p {
  margin: 0;
  font-size: 12px;
}

.group-error {
  color: #f2a6a6;
  font-size: 12px;
}

.chat-back {
  display: grid;
  width: 30px;
  height: 32px;
  place-items: center;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font-size: 28px;
  line-height: 1;
}

.chat-back:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.chat-view {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  padding: 0 24px 20px;
}

.chat-context {
  display: flex;
  min-height: 52px;
  align-items: center;
  gap: 9px;
  border-bottom: 1px solid #41434a;
  color: var(--muted);
  font-size: 12px;
}

.chat-context strong {
  color: var(--text);
  font-size: 13px;
}

.chat-content {
  display: flex;
  min-height: 0;
  flex: 1;
}

.chat-message-pane {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
}

.chat-tools {
  width: 220px;
  flex: 0 0 220px;
  margin: 14px 0 14px 18px;
  padding: 16px;
  border-left: 1px solid #41434a;
}

.chat-tool-button {
  display: flex;
  width: 100%;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #41434a;
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
  transition: background 120ms ease;
}

.chat-tool-button:hover:not(:disabled) {
  background: #50535c;
}

.chat-tool-button.selected {
  background: #334d42;
  color: #b6e3c9;
}

.leave-group-button {
  margin-top: 16px;
  background: #5a3438;
}

.leave-group-button:hover:not(:disabled) {
  background: #754147;
}

.chat-tool-button:disabled:not(.selected) {
  cursor: wait;
  opacity: 0.65;
}

.chat-tool-confirmation,
.chat-tool-error {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.5;
}

.chat-tool-confirmation {
  color: #b6e3c9;
}

.chat-tool-error {
  color: #f2a6a6;
}

.chat-messages {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
  padding: 22px 4px;
}

.chat-message {
  display: flex;
  width: 100%;
  align-items: flex-start;
  gap: 12px;
}

.chat-message.own-message {
  justify-content: flex-end;
}

.chat-message.own-message .chat-message-body {
  display: flex;
  max-width: min(72%, 680px);
  flex-direction: column;
  align-items: flex-end;
}

.chat-message.own-message .chat-message-body > p {
  padding: 10px 13px;
  border-radius: 16px 16px 4px 16px;
  background: #5865f2;
  color: white;
}

.chat-avatar {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  font-size: 13px;
}

.chat-message-body {
  min-width: 0;
  padding-top: 2px;
}

.chat-message:not(.own-message) .chat-message-body {
  max-width: min(78%, 720px);
}

.chat-sender-id {
  color: var(--text);
  font-size: 12px;
}

.chat-message-body p {
  margin: 5px 0 0;
  color: #dbdee1;
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.chat-reply-trigger {
  display: block;
  max-width: 100%;
  padding: 0;
  border-radius: 6px;
  background: transparent;
  text-align: left;
}

.chat-reply-trigger:hover p {
  color: white;
  text-decoration: underline;
  text-decoration-color: #949ba4;
  text-underline-offset: 3px;
}

.chat-reply-trigger:focus-visible {
  outline: 2px solid #8e98ff;
  outline-offset: 3px;
}

.message-masked {
  filter: blur(7px);
  user-select: none;
}

.message-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.message-options button {
  min-height: 28px;
  padding: 4px 9px;
  border: 1px solid #4b4d55;
  border-radius: 5px;
  background: #383a40;
  color: var(--text);
  font-size: 11px;
}

.message-options button:hover {
  background: #50535c;
}

.message-reply-context {
  overflow: hidden;
  max-width: 100%;
  margin: 0 0 5px;
  padding: 5px 8px;
  border-left: 2px solid #949ba4;
  border-radius: 0 4px 4px 0;
  background: #292a2f;
  color: var(--muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-state {
  display: grid;
  justify-items: center;
  gap: 12px;
  margin: auto;
  padding: 28px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}

.chat-state strong {
  color: #f2a6a6;
}

.chat-composer {
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: 10px;
  padding: 6px 8px 6px 14px;
  border-radius: 8px;
  background: #383a40;
}

.chat-composer input {
  width: 100%;
  min-width: 0;
  height: 34px;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
}

.chat-composer input::placeholder {
  color: var(--subtle);
}

.chat-composer button {
  min-width: 54px;
  height: 32px;
  padding: 0 12px;
  border-radius: 5px;
  background: var(--accent);
  color: white;
  font-size: 12px;
  font-weight: 700;
}

.chat-composer button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.chat-composer .chat-tools-toggle {
  display: grid;
  min-width: 32px;
  width: 32px;
  height: 32px;
  place-items: center;
  padding: 0;
  background: #41434a;
  color: var(--text);
  font-size: 21px;
  line-height: 1;
}

.chat-composer .chat-tools-toggle:hover {
  background: #50535c;
}

.mobile-tools-toggle-icon {
  display: none;
}

.chat-error {
  margin: 0 0 8px;
  color: #f2a6a6;
  font-size: 12px;
}

.reply-preview {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 12px;
  border-left: 3px solid #8e98ff;
  border-radius: 6px 6px 0 0;
  background: #292a2f;
}

.reply-preview-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.reply-preview-copy strong {
  color: #c9cdfb;
  font-size: 11px;
}

.reply-preview-copy span {
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reply-preview > button {
  width: 26px;
  height: 26px;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font-size: 20px;
}

.reply-preview > button:hover {
  background: #404249;
  color: var(--text);
}

@media (max-width: 1100px) {
  .group-guide {
    display: none;
  }
}

@media (max-width: 760px) {
  .dm-sidebar {
    display: none;
  }

  .groups-main {
    padding: 20px 16px;
  }

  .chat-view {
    padding: 0 14px 14px;
  }

  .chat-content {
    display: contents;
  }

  .chat-message-pane {
    order: 1;
    flex: 1;
  }

  .chat-error {
    order: 2;
  }

  .reply-preview {
    order: 3;
  }

  .chat-composer {
    order: 4;
  }

  .chat-tools {
    order: 5;
  }

  .chat-tools {
    display: flex;
    width: auto;
    flex: 0 0 auto;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 10px 0 0;
    border-top: 1px solid #41434a;
    border-left: 0;
  }

  .chat-tool-button {
    width: auto;
    min-height: 36px;
  }

  .chat-tool-confirmation,
  .chat-tool-error {
    margin: 8px 0 0;
  }

  .desktop-tools-toggle-icon {
    display: none;
  }

  .mobile-tools-toggle-icon {
    display: inline;
  }

  .group-card-grid {
    grid-template-columns: 1fr;
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

  .topbar-divider,
  .topbar-action:not(.view-switch):not(.active) {
    display: none;
  }
}
</style>
