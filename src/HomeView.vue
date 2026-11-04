<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  username: string
  userId: string
}>()

const emit = defineEmits<{
  logout: []
}>()

type GroupChat = {
  id: string
  kind: 'interest' | 'spectator'
  name: string
  description: string
  tags: string[]
  memberCount: number
  onlineCount: number
  heat: number
  icon: string
  color: string
  joined: boolean
  watching?: boolean
  sourceGroupId?: string
  sourceGroupName?: string
  newMessageCount?: number
  unreadMentionCount?: number
  lastMessageAt?: string
}

type ChatMember = {
  id: string
  name: string
  avatar: string
  color: string
}

type ChatMessage = {
  id: string
  senderId: string
  senderName: string
  avatar: string
  color: string
  content: string
  createdAt?: string
  isSourceMessage?: boolean
  sourceGroupName?: string
  mentions?: string[]
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
  mode?: 'group' | 'spectate'
}

const activeView = ref<'groups' | 'spectate' | 'chat'>('groups')
const activeChat = ref<ChatTarget | null>(null)
const chatMessages = ref<ChatMessage[]>([])
const chatMessagesElement = ref<HTMLElement | null>(null)
const chatDraft = ref('')
const isMentionPickerOpen = ref(false)
const isLoadingMentionMembers = ref(false)
const mentionMembers = ref<ChatMember[]>([])
const mentionLoadError = ref('')
const selectedMentions = ref<ChatMember[]>([])
const unreadMentionMessageIds = ref(new Set<string>())
const replyTarget = ref<ChatMessage | null>(null)
const activeMessageMenuKey = ref('')
const blockedSenderIds = ref(new Set<string>())
const revealedMessageKeys = ref(new Set<string>())
const isLoadingMessages = ref(false)
const isSendingMessage = ref(false)
const chatError = ref('')
const groupChats = ref<GroupChat[]>([])
const spectatorGroups = ref<GroupChat[]>([])
const selectedInterest = ref('全部')
const groupLoadError = ref('')
const joiningGroupId = ref('')
const groupJoinError = ref('')
const wantsToStay = ref(false)
const isLoadingStayTomorrow = ref(false)
const isSettingStayTomorrow = ref(false)
const stayTomorrowError = ref('')
const spectatorConversionError = ref('')
const isConvertingSpectator = ref(false)
const isLeavingGroup = ref(false)
const groupLeaveError = ref('')
const isGroupToolsOpen = ref(false)
const isJoinedGroupsOpen = ref(true)
const isJoinedSpectatorsOpen = ref(true)
const groupLocalVersions = new Map<string, number>()
let groupListRequestVersion = 0

const interestTags = computed(() => [
  '全部',
  ...new Set(groupChats.value.flatMap((group) => group.tags)),
])
function isInterestGroup(group: GroupChat) {
  return group.kind === 'interest'
}

function isSpectatorGroup(group: GroupChat) {
  return group.kind === 'spectator'
}

const visibleGroupChats = computed(() =>
  groupChats.value.filter(
    (group) =>
      isInterestGroup(group) &&
      (selectedInterest.value === '全部' || group.tags.includes(selectedInterest.value)),
  ),
)
const joinedGroupChats = computed(() =>
  groupChats.value
    .filter((group) => isInterestGroup(group) && group.joined)
    .sort((left, right) => {
      const unreadDifference = Number((right.newMessageCount ?? 0) > 0) -
        Number((left.newMessageCount ?? 0) > 0)
      if (unreadDifference !== 0) return unreadDifference
      return (Date.parse(right.lastMessageAt || '') || 0) -
        (Date.parse(left.lastMessageAt || '') || 0)
    }),
)
const watchedGroupChats = computed(() =>
  spectatorGroups.value
    .filter((group) => isSpectatorGroup(group) && group.watching)
    .sort((left, right) => right.heat - left.heat),
)
const currentSpectatorGroup = computed(() => watchedGroupChats.value[0])
const visibleSpectatorChats = computed(() =>
  spectatorGroups.value
    .filter(isSpectatorGroup)
    .sort((left, right) => right.heat - left.heat),
)

async function loadGroupChats(silent = false) {
  if (!silent) groupLoadError.value = ''
  const requestVersion = ++groupListRequestVersion
  const localVersionsAtRequest = new Map(groupLocalVersions)
  try {
    const response = await fetch(
      `/api/group-chats?userId=${encodeURIComponent(currentUserId.value)}`,
    )
    const result = await response.json() as {
      code?: number
      message?: string
      msg?: string
      data?: { groupChats?: GroupChat[]; spectatorGroups?: GroupChat[] }
    }

    if (
      !response.ok ||
      result.code !== 0 ||
      !result.data?.groupChats ||
      !result.data.spectatorGroups
    ) {
      throw new Error(result.message || result.msg || '加载兴趣列表失败')
    }

    if (requestVersion !== groupListRequestVersion) return
    const allGroups = new Map(
      [...result.data.groupChats, ...result.data.spectatorGroups]
        .map((group) => [group.id, group]),
    )
    groupChats.value = [...allGroups.values()]
      .filter(isInterestGroup)
      .map((group) => {
      const currentGroup = groupChats.value.find((item) => item.id === group.id)
      if (
        currentGroup &&
        groupLocalVersions.get(group.id) !== localVersionsAtRequest.get(group.id)
      ) {
        return {
          ...group,
          newMessageCount: currentGroup.newMessageCount,
          unreadMentionCount: currentGroup.unreadMentionCount,
          lastMessageAt: currentGroup.lastMessageAt,
        }
      }
      return group
    })
    spectatorGroups.value = [...allGroups.values()].filter(isSpectatorGroup)
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载兴趣列表失败，请稍后重试'
    if (silent) {
      console.error('同步兴趣列表失败:', error)
    } else {
      groupLoadError.value = message
    }
  }
}

const displayName = computed(() => props.username || '新朋友')
const initials = computed(() => displayName.value.slice(0, 1).toUpperCase())
const currentUserId = computed(() => props.userId)

let groupChatSocket: WebSocket | null = null
let socketReconnectTimer: ReturnType<typeof setTimeout> | undefined
let groupChatHeartbeatTimer: ReturnType<typeof setInterval> | undefined
let socketReconnectDelay = 1000
let isGroupChatSocketDisposed = false

function isIncomingGroupMessage(
  value: unknown,
): value is {
  type: 'message'
  groupId: string
  groupType?: 'spectator'
  message: ChatMessage
  unreadCount?: number
  unreadMentionCount?: number
} {
  if (typeof value !== 'object' || value === null) return false
  const event = value as Record<string, unknown>
  if (event.type !== 'message' || typeof event.groupId !== 'string') return false
  if (event.groupType !== undefined && event.groupType !== 'spectator') return false
  if (typeof event.message !== 'object' || event.message === null) return false
  const message = event.message as Record<string, unknown>
  return (event.unreadCount === undefined || typeof event.unreadCount === 'number') &&
    (event.unreadMentionCount === undefined || typeof event.unreadMentionCount === 'number') &&
    typeof message.id === 'string' &&
    typeof message.senderId === 'string' &&
    typeof message.senderName === 'string' &&
    typeof message.avatar === 'string' &&
    typeof message.color === 'string' &&
    typeof message.content === 'string' &&
    (message.mentions === undefined ||
      (Array.isArray(message.mentions) && message.mentions.every((id) => typeof id === 'string')))
}

function updateGroupLocalVersion(groupId: string) {
  const nextVersion = (groupLocalVersions.get(groupId) ?? 0) + 1
  groupLocalVersions.set(groupId, nextVersion)
  return nextVersion
}

function scrollChatToBottom() {
  void nextTick(() => {
    const element = chatMessagesElement.value
    if (element) element.scrollTop = element.scrollHeight
  })
}

function markGroupMessageRead(groupId: string, lastReadMessageId: string) {
  const group = groupChats.value.find((item) => item.id === groupId)
  const localVersion = updateGroupLocalVersion(groupId)
  if (group) {
    group.newMessageCount = 0
    group.unreadMentionCount = 0
  }

  return fetch(`/api/group-chats/${groupId}/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUserId.value, lastReadMessageId }),
  }).then(async (response) => {
    const result = await response.json() as {
      code?: number
      message?: string
      msg?: string
      data?: { newMessageCount?: number; unreadMentionCount?: number }
    }
    if (
      !response.ok ||
      result.code !== 0 ||
      typeof result.data?.newMessageCount !== 'number' ||
      typeof result.data.unreadMentionCount !== 'number'
    ) {
      throw new Error(result.message || result.msg || '标记兴趣消息已读失败')
    }
    if (groupLocalVersions.get(groupId) === localVersion && group) {
      group.newMessageCount = result.data.newMessageCount
      group.unreadMentionCount = result.data.unreadMentionCount
    }
  })
}

function handleIncomingGroupMessage(
  groupId: string,
  message: ChatMessage,
  unreadCount?: number,
  unreadMentionCount?: number,
) {
  const group = groupChats.value.find((item) => item.id === groupId && item.joined)
  if (!group) return

  updateGroupLocalVersion(groupId)
  group.lastMessageAt = message.createdAt || new Date().toISOString()
  const isCurrentGroupOpen = activeView.value === 'chat' && activeChat.value?.id === groupId
  if (isCurrentGroupOpen) {
    if (!chatMessages.value.some((item) => item.id === message.id)) {
      chatMessages.value.push(message)
      scrollChatToBottom()
    }
    void markGroupMessageRead(groupId, message.id).catch((error: unknown) => {
      chatError.value = error instanceof Error ? error.message : '标记兴趣消息已读失败'
    })
    return
  }

  if (typeof unreadCount === 'number') {
    group.newMessageCount = unreadCount
  } else if (message.senderId !== currentUserId.value) {
    group.newMessageCount = (group.newMessageCount ?? 0) + 1
  }
  if (typeof unreadMentionCount === 'number') {
    group.unreadMentionCount = unreadMentionCount
  } else if (message.senderId !== currentUserId.value && message.mentions?.includes(currentUserId.value)) {
    group.unreadMentionCount = (group.unreadMentionCount ?? 0) + 1
  }
}

function handleIncomingSpectatorMessage(groupId: string, message: ChatMessage) {
  const group = spectatorGroups.value.find((item) => item.id === groupId && item.watching)
  if (!group) return

  group.lastMessageAt = message.createdAt || new Date().toISOString()
  if (
    activeView.value === 'chat' &&
    activeChat.value?.id === groupId &&
    activeChat.value.mode === 'spectate' &&
    !chatMessages.value.some((item) => item.id === message.id)
  ) {
    chatMessages.value.push(message)
    scrollChatToBottom()
  }
}

function scheduleGroupChatReconnect() {
  if (isGroupChatSocketDisposed || socketReconnectTimer) return
  socketReconnectTimer = setTimeout(() => {
    socketReconnectTimer = undefined
    connectGroupChatSocket()
  }, socketReconnectDelay)
  socketReconnectDelay = Math.min(socketReconnectDelay * 2, 30000)
}

function connectGroupChatSocket() {
  if (isGroupChatSocketDisposed) return

  const socketUrl = new URL('/api/group-chats/ws', window.location.href)
  socketUrl.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  socketUrl.searchParams.set('userId', currentUserId.value)
  const socket = new WebSocket(socketUrl)
  groupChatSocket = socket

  socket.addEventListener('open', () => {
    socketReconnectDelay = 1000
    socket.send(JSON.stringify({ type: 'subscribe', userId: currentUserId.value }))
    void loadGroupChats(true)
  })
  socket.addEventListener('message', (event) => {
    let payload: unknown
    try {
      payload = JSON.parse(String(event.data))
    } catch (error) {
      console.error('收到无效的兴趣 WebSocket 消息:', error)
      return
    }
    if (!isIncomingGroupMessage(payload)) return
    if (payload.groupType === 'spectator') {
      handleIncomingSpectatorMessage(payload.groupId, payload.message)
    } else {
      handleIncomingGroupMessage(
        payload.groupId,
        payload.message,
        payload.unreadCount,
        payload.unreadMentionCount,
      )
    }
  })
  socket.addEventListener('close', () => {
    if (groupChatSocket === socket) groupChatSocket = null
    scheduleGroupChatReconnect()
  })
  socket.addEventListener('error', () => socket.close())
}

onMounted(() => {
  void loadGroupChats()
  connectGroupChatSocket()
  groupChatHeartbeatTimer = setInterval(() => {
    void loadGroupChats(true)
    if (groupChatSocket?.readyState === WebSocket.OPEN) {
      groupChatSocket.send(JSON.stringify({ type: 'heartbeat', userId: currentUserId.value }))
    }
  }, 60000)
})

onBeforeUnmount(() => {
  isGroupChatSocketDisposed = true
  if (groupChatHeartbeatTimer) clearInterval(groupChatHeartbeatTimer)
  if (socketReconnectTimer) clearTimeout(socketReconnectTimer)
  groupChatSocket?.close()
})

function getMessageKey(message: ChatMessage) {
  return `${activeChat.value?.id}:${message.id}`
}

function getSenderBlockKey(senderId: string) {
  return `${currentUserId.value}:${activeChat.value?.id}:${senderId}`
}

function isSenderBlocked(senderId: string) {
  return blockedSenderIds.value.has(getSenderBlockKey(senderId))
}

function isMessageMasked(message: ChatMessage) {
  return isSenderBlocked(message.senderId) &&
    !revealedMessageKeys.value.has(getMessageKey(message))
}

function getReplyPreviewKey(message: ChatMessage) {
  return `reply:${getMessageKey(message)}`
}

function isReplyPreviewMasked(message: ChatMessage) {
  return !!message.replyTo &&
    isSenderBlocked(message.replyTo.senderId) &&
    !revealedMessageKeys.value.has(getReplyPreviewKey(message))
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
  blockedSenderIds.value.add(getSenderBlockKey(message.senderId))
  for (const chatMessage of chatMessages.value) {
    if (chatMessage.senderId === message.senderId) {
      revealedMessageKeys.value.delete(getMessageKey(chatMessage))
    }
    if (chatMessage.replyTo?.senderId === message.senderId) {
      revealedMessageKeys.value.delete(getReplyPreviewKey(chatMessage))
    }
  }
  activeMessageMenuKey.value = ''
}

function revealMessage(message: ChatMessage) {
  revealedMessageKeys.value.add(getMessageKey(message))
  activeMessageMenuKey.value = ''
}

function toggleReplyPreview(message: ChatMessage) {
  const key = getReplyPreviewKey(message)
  if (revealedMessageKeys.value.has(key)) {
    revealedMessageKeys.value.delete(key)
  } else {
    revealedMessageKeys.value.add(key)
  }
}

function unblockMessageSender(message: ChatMessage) {
  blockedSenderIds.value.delete(getSenderBlockKey(message.senderId))
  for (const chatMessage of chatMessages.value) {
    if (chatMessage.senderId === message.senderId) {
      revealedMessageKeys.value.delete(getMessageKey(chatMessage))
    }
    if (chatMessage.replyTo?.senderId === message.senderId) {
      revealedMessageKeys.value.delete(getReplyPreviewKey(chatMessage))
    }
  }
  activeMessageMenuKey.value = ''
}

async function loadStayPreference(target: ChatTarget) {
  isLoadingStayTomorrow.value = true
  stayTomorrowError.value = ''
  try {
    const response = await fetch(
      target.mode === 'spectate'
        ? `/api/spectator-groups/${target.id}/next-minute?userId=${encodeURIComponent(currentUserId.value)}`
        : `/api/group-chats/${target.id}/see-you-tomorrow?userId=${encodeURIComponent(currentUserId.value)}`,
    )
    const result = await response.json() as {
      code?: number
      message?: string
      msg?: string
      data?: { wantsToStayTomorrow?: boolean }
    }
    if (!response.ok || result.code !== 0 || typeof result.data?.wantsToStayTomorrow !== 'boolean') {
      throw new Error(result.message || result.msg || '加载兴趣延续意愿失败')
    }
    if (activeChat.value?.id === target.id && activeChat.value.mode === target.mode) {
      wantsToStay.value = result.data.wantsToStayTomorrow
    }
  } catch (error) {
    if (activeChat.value?.id === target.id && activeChat.value.mode === target.mode) {
      stayTomorrowError.value = error instanceof Error ? error.message : '加载兴趣延续意愿失败，请稍后重试'
    }
  } finally {
    if (activeChat.value?.id === target.id && activeChat.value.mode === target.mode) {
      isLoadingStayTomorrow.value = false
    }
  }
}

async function openChat(target: ChatTarget) {
  activeChat.value = target
  activeView.value = 'chat'
  const selectedGroup = groupChats.value.find((group) => group.id === target.id)
  updateGroupLocalVersion(target.id)
  if (target.mode !== 'spectate' && selectedGroup) {
    selectedGroup.newMessageCount = 0
    selectedGroup.unreadMentionCount = 0
  }
  chatMessages.value = []
  unreadMentionMessageIds.value = new Set()
  isMentionPickerOpen.value = false
  mentionMembers.value = []
  selectedMentions.value = []
  activeMessageMenuKey.value = ''
  chatError.value = ''
  replyTarget.value = null
  wantsToStay.value = false
  isGroupToolsOpen.value = false
  isLoadingStayTomorrow.value = true
  stayTomorrowError.value = ''
  spectatorConversionError.value = ''
  groupLeaveError.value = ''
  void loadStayPreference(target)
  isLoadingMessages.value = true
  try {
    const url = target.mode === 'spectate'
      ? `/api/spectator-groups/${target.id}/messages?userId=${encodeURIComponent(currentUserId.value)}`
      : `/api/group-chats/${target.id}/messages?userId=${encodeURIComponent(currentUserId.value)}`
    const response = await fetch(url)
    const result = await response.json() as {
      code?: number
      message?: string
      msg?: string
      data?: { messages?: ChatMessage[]; unreadMentionMessageIds?: string[] }
    }
    if (!response.ok || result.code !== 0 || !result.data?.messages) {
      throw new Error(result.message || result.msg || '加载聊天记录失败')
    }
    if (activeChat.value?.id !== target.id || activeChat.value.mode !== target.mode) return
    const fetchedMessageIds = new Set(result.data.messages.map((message) => message.id))
    const liveMessagesReceivedWhileLoading = chatMessages.value.filter(
      (message) => !fetchedMessageIds.has(message.id),
    )
    chatMessages.value = [...result.data.messages, ...liveMessagesReceivedWhileLoading]
    unreadMentionMessageIds.value = new Set(
      target.mode !== 'spectate' ? result.data.unreadMentionMessageIds ?? [] : [],
    )
    const lastReadMessageId = target.mode !== 'spectate' ? chatMessages.value.at(-1)?.id : undefined
    if (lastReadMessageId) {
      await markGroupMessageRead(target.id, lastReadMessageId)
    }
  } catch (error) {
    if (activeChat.value?.id === target.id && activeChat.value.mode === target.mode) {
      chatError.value = error instanceof Error ? error.message : '加载聊天记录失败，请稍后重试'
    }
  } finally {
    if (activeChat.value?.id === target.id && activeChat.value.mode === target.mode) {
      isLoadingMessages.value = false
      scrollChatToBottom()
    }
  }
}

async function setStayPreference() {
  const target = activeChat.value
  if (
    !target ||
    wantsToStay.value ||
    isLeavingGroup.value ||
    isSettingStayTomorrow.value
  ) return

  isSettingStayTomorrow.value = true
  stayTomorrowError.value = ''
  try {
    const response = await fetch(
      target.mode === 'spectate'
        ? `/api/spectator-groups/${target.id}/next-minute`
        : `/api/group-chats/${target.id}/see-you-tomorrow`,
      {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUserId.value }),
      },
    )
    const result = await response.json() as {
      code?: number
      message?: string
      msg?: string
      data?: { wantsToStayTomorrow?: boolean }
    }
    if (!response.ok || result.code !== 0 || result.data?.wantsToStayTomorrow !== true) {
      throw new Error(result.message || result.msg || '提交兴趣延续意愿失败')
    }
    if (activeChat.value?.id === target.id && activeChat.value.mode === target.mode) {
      wantsToStay.value = true
    }
  } catch (error) {
    if (activeChat.value?.id === target.id && activeChat.value.mode === target.mode) {
      stayTomorrowError.value = error instanceof Error ? error.message : '提交兴趣延续意愿失败，请稍后重试'
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
    const isSpectating = target.mode === 'spectate'
    const response = await fetch(
      isSpectating
        ? `/api/spectator-groups/${target.id}/leave`
        : `/api/group-chats/${target.id}/leave`,
      {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUserId.value }),
      },
    )
    const result = await response.json() as {
      code?: number
      message?: string
      msg?: string
      data?: { groupChat?: GroupChat }
    }
    if (!response.ok || result.code !== 0 || !result.data?.groupChat) {
      throw new Error(result.message || result.msg || '退出兴趣失败')
    }
    if (isSpectating) {
      const index = spectatorGroups.value.findIndex((group) => group.id === target.id)
      if (index !== -1) spectatorGroups.value[index] = result.data.groupChat
    } else {
      const index = groupChats.value.findIndex((group) => group.id === target.id)
      if (index !== -1) groupChats.value[index] = result.data.groupChat
    }
    closeChat()
  } catch (error) {
    if (activeChat.value?.id === target.id) {
      groupLeaveError.value = error instanceof Error ? error.message : '退出兴趣失败，请稍后重试'
    }
  } finally {
    isLeavingGroup.value = false
  }
}

function closeChat() {
  const returnView = activeChat.value?.mode === 'spectate' ? 'spectate' : 'groups'
  activeView.value = returnView
  activeChat.value = null
  chatMessages.value = []
  activeMessageMenuKey.value = ''
  chatDraft.value = ''
  isMentionPickerOpen.value = false
  selectedMentions.value = []
  unreadMentionMessageIds.value = new Set()
  replyTarget.value = null
  chatError.value = ''
  wantsToStay.value = false
  isLoadingStayTomorrow.value = false
  stayTomorrowError.value = ''
  groupLeaveError.value = ''
  void loadGroupChats()
}

async function toggleMentionPicker() {
  if (isMentionPickerOpen.value) {
    isMentionPickerOpen.value = false
    return
  }
  const target = activeChat.value
  if (!target || target.mode === 'spectate' || isLoadingMentionMembers.value) return

  isMentionPickerOpen.value = true
  isLoadingMentionMembers.value = true
  mentionLoadError.value = ''
  try {
    const response = await fetch(
      `/api/group-chats/${target.id}/members?userId=${encodeURIComponent(currentUserId.value)}`,
    )
    const result = await response.json() as {
      code?: number
      message?: string
      msg?: string
      data?: { members?: ChatMember[] }
    }
    if (!response.ok || result.code !== 0 || !result.data?.members) {
      throw new Error(result.message || result.msg || '加载群友列表失败')
    }
    if (activeChat.value?.id === target.id) mentionMembers.value = result.data.members
  } catch (error) {
    mentionLoadError.value = error instanceof Error ? error.message : '加载群友列表失败，请稍后重试'
  } finally {
    isLoadingMentionMembers.value = false
  }
}

function insertMention(member: ChatMember) {
  const token = `@${member.name}`
  if (!chatDraft.value.includes(token)) {
    const draft = chatDraft.value.trimEnd()
    chatDraft.value = `${draft}${draft ? ' ' : ''}${token} `
  }
  if (!selectedMentions.value.some((selected) => selected.id === member.id)) {
    selectedMentions.value.push(member)
  }
  isMentionPickerOpen.value = false
}

async function sendChatMessage() {
  const content = chatDraft.value.trim()
  const target = activeChat.value
  if (!content || !target || isSendingMessage.value) return

  isSendingMessage.value = true
  chatError.value = ''
  try {
    const response = await fetch(
      `${target.mode === 'spectate' ? '/api/spectator-groups' : '/api/group-chats'}/${target.id}/messages`,
      {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: currentUserId.value,
        senderName: displayName.value,
        avatar: initials.value,
        color: '#5865f2',
        content,
        ...(target.mode !== 'spectate'
          ? {
              mentions: selectedMentions.value
                .filter((member) => content.includes(`@${member.name}`))
                .map((member) => member.id),
            }
          : {}),
        createdAt: new Date().toISOString(),
        ...(replyTarget.value
          ? {
              replyTo: {
                senderId: replyTarget.value.senderId,
                content: replyTarget.value.content,
              },
            }
          : {}),
      }),
      },
    )
    const result = await response.json() as {
      code?: number
      message?: string
      msg?: string
      data?: { message?: ChatMessage }
    }
    if (!response.ok || result.code !== 0 || !result.data?.message) {
      throw new Error(result.message || result.msg || '发送消息失败')
    }
    if (!chatMessages.value.some((message) => message.id === result.data?.message?.id)) {
      chatMessages.value.push(result.data.message)
      scrollChatToBottom()
    }
    const group = target.mode === 'spectate'
      ? spectatorGroups.value.find((item) => item.id === target.id)
      : groupChats.value.find((item) => item.id === target.id)
    if (group) group.lastMessageAt = result.data.message.createdAt || new Date().toISOString()
    chatDraft.value = ''
    selectedMentions.value = []
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
    const response = await fetch(`/api/group-chats/${group.id}/join`, {
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
      throw new Error(result.message || result.msg || '加入兴趣失败')
    }
    const index = groupChats.value.findIndex((item) => item.id === group.id)
    if (index !== -1) groupChats.value[index] = result.data.groupChat
  } catch (error) {
    groupJoinError.value = error instanceof Error ? error.message : '加入兴趣失败，请稍后重试'
  } finally {
    joiningGroupId.value = ''
  }
}

async function watchGroupChat(group: GroupChat) {
  if (group.watching) {
    await openChat({
      id: group.id,
      name: group.name,
      avatar: group.icon,
      color: group.color,
      mode: 'spectate',
    })
    return
  }
  if (currentSpectatorGroup.value) {
    groupJoinError.value = '同时只能加入一个围观群，请先退出当前围观群。'
    return
  }
  if (!group.sourceGroupId) {
    groupJoinError.value = '找不到围观群对应的来源兴趣'
    return
  }
  joiningGroupId.value = group.id
  groupJoinError.value = ''
  try {
    const response = await fetch(`/api/group-chats/${group.sourceGroupId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUserId.value, mode: 'spectate' }),
    })
    const result = await response.json() as {
      code?: number
      message?: string
      msg?: string
      data?: { groupChat?: GroupChat }
    }
    if (!response.ok || result.code !== 0 || !result.data?.groupChat) {
      throw new Error(result.message || result.msg || '加入围观失败')
    }
    const joinedSpectatorGroup = result.data.groupChat
    const index = spectatorGroups.value.findIndex((item) => item.id === joinedSpectatorGroup.id)
    if (index !== -1) spectatorGroups.value[index] = joinedSpectatorGroup
    await openChat({
      id: joinedSpectatorGroup.id,
      name: joinedSpectatorGroup.name,
      avatar: joinedSpectatorGroup.icon,
      color: joinedSpectatorGroup.color,
      mode: 'spectate',
    })
  } catch (error) {
    groupJoinError.value = error instanceof Error ? error.message : '加入围观失败，请稍后重试'
  } finally {
    joiningGroupId.value = ''
  }
}

async function convertSpectatorToInterestGroup() {
  const target = activeChat.value
  if (!target || target.mode !== 'spectate' || isConvertingSpectator.value) return

  isConvertingSpectator.value = true
  spectatorConversionError.value = ''
  try {
    const response = await fetch(`/api/spectator-groups/${target.id}/convert`, {
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
      throw new Error(result.message || result.msg || '转化为兴趣群失败')
    }

    groupChats.value.push(result.data.groupChat)
    spectatorGroups.value = spectatorGroups.value.filter((group) => group.id !== target.id)
    await openChat({
      id: target.id,
      name: result.data.groupChat.name,
      avatar: target.avatar,
      color: target.color,
      mode: 'group',
    })
  } catch (error) {
    spectatorConversionError.value = error instanceof Error ? error.message : '转化为兴趣群失败，请稍后重试'
  } finally {
    isConvertingSpectator.value = false
  }
}
</script>

<template>
  <main class="discord-shell">
    <aside class="dm-sidebar">
      <button class="sidebar-search" @click="activeView = 'groups'">兴趣 <span>⌘ K</span></button>
      <div class="sidebar-nav">
        <button
          class="sidebar-link"
          :class="{ active: activeView === 'groups' }"
          @click="activeView = 'groups'"
        >
          <span class="nav-glyph">▦</span> 兴趣
        </button>
        <button
          class="sidebar-link"
          :class="{ active: activeView === 'spectate' }"
          @click="activeView = 'spectate'"
        >
          <span class="nav-glyph">◉</span> 围观
        </button>
      </div>
      <div v-if="joinedGroupChats.length" class="joined-groups-section">
        <button
          class="dm-heading joined-groups-toggle"
          :aria-expanded="isJoinedGroupsOpen"
          aria-controls="joined-groups-list"
          @click="isJoinedGroupsOpen = !isJoinedGroupsOpen"
        >
          <span>已加入的瞎扯淡们</span>
          <span class="joined-groups-chevron" aria-hidden="true">
            {{ isJoinedGroupsOpen ? '⌄' : '›' }}
          </span>
        </button>
        <div v-if="isJoinedGroupsOpen" id="joined-groups-list" class="joined-groups">
          <button
            v-for="group in joinedGroupChats"
            :key="group.id"
            class="dm-item joined-group"
            @click="openChat({ id: group.id, name: group.name, avatar: group.icon, color: group.color, mode: 'group' })"
          >
            <span class="group-mini-icon" :style="{ '--group-color': group.color }">{{ group.icon }}</span>
            <span class="joined-group-name">{{ group.name }}</span>
            <span v-if="group.newMessageCount" class="joined-group-unread">
              {{ group.newMessageCount > 99 ? '99+' : group.newMessageCount }}
            </span>
            <span
              v-if="group.unreadMentionCount"
              class="joined-group-mention"
              :aria-label="`${group.unreadMentionCount} 条未读消息提到了你`"
            >
              @{{ group.unreadMentionCount > 99 ? '99+' : group.unreadMentionCount }}
            </span>
          </button>
        </div>
      </div>
      <div v-if="watchedGroupChats.length" class="joined-groups-section">
        <button
          class="dm-heading joined-groups-toggle"
          :aria-expanded="isJoinedSpectatorsOpen"
          aria-controls="joined-spectators-list"
          @click="isJoinedSpectatorsOpen = !isJoinedSpectatorsOpen"
        >
          <span>已加入的瞎起哄</span>
          <span class="joined-groups-chevron" aria-hidden="true">
            {{ isJoinedSpectatorsOpen ? '⌄' : '›' }}
          </span>
        </button>
        <div v-if="isJoinedSpectatorsOpen" id="joined-spectators-list" class="joined-groups">
          <button
            v-for="group in watchedGroupChats"
            :key="group.id"
            class="dm-item joined-group"
            @click="openChat({
              id: group.id,
              name: group.name,
              avatar: group.icon,
              color: group.color,
              mode: 'spectate',
            })"
          >
            <span class="group-mini-icon" :style="{ '--group-color': group.color }">{{ group.icon }}</span>
            <span class="joined-group-name">{{ group.name }}</span>
            <span class="spectator-mini-label">围观</span>
          </button>
        </div>
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
          <button aria-label="退出" title="退出" @click="emit('logout')">↪</button>
        </div>
      </div>
    </aside>

    <section class="main-page">
      <header class="topbar">
        <button v-if="activeView === 'chat'" class="chat-back" aria-label="返回" @click="closeChat">‹</button>
        <div class="topbar-title">
          <span>{{ activeView === 'groups' ? '▦' : activeView === 'spectate' ? '◉' : activeChat?.avatar }}</span>
          {{ activeView === 'groups' ? '兴趣' : activeView === 'spectate' ? '围观' : activeChat?.name }}
        </div>
        <div v-if="activeView !== 'chat'" class="topbar-divider"></div>
        <button
          v-if="activeView !== 'chat'"
          class="topbar-action view-switch"
          :class="{ active: activeView === 'groups' }"
          @click="activeView = 'groups'"
        >
          兴趣
        </button>
        <button
          v-if="activeView !== 'chat'"
          class="topbar-action view-switch"
          :class="{ active: activeView === 'spectate' }"
          @click="activeView = 'spectate'"
        >
          围观
        </button>
        <div class="topbar-spacer"></div>
        <button v-if="activeView !== 'chat'" class="topbar-icon" aria-label="收件箱" title="收件箱">▤</button>
        <button v-if="activeView !== 'chat'" class="topbar-icon help-icon" aria-label="帮助" title="帮助">?</button>
      </header>

      <div v-if="activeView !== 'chat'" class="groups-layout">
        <section class="groups-main">
          <div class="groups-heading">
            <div>
              <h1>{{ activeView === 'groups' ? '让兴趣就是兴趣' : '让热闹更加热闹' }}</h1>
              <p v-if="activeView === 'groups'">
                按兴趣加入讨论。<br>每天凌晨清理讨论，选择延续的除外。
              </p>
              <p v-else>按热度加入围观。源头消息会实时同步。<br>每三分钟清理讨论，选择延续的除外。</p>
            </div>
          </div>
          <div v-if="activeView === 'groups'" class="interest-filters" role="group" aria-label="按兴趣标签筛选">
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
            <button class="retry-button" @click="loadGroupChats()">重试</button>
          </div>
          <div
            v-else-if="activeView === 'spectate' && currentSpectatorGroup"
            class="group-empty-state spectator-limit-state"
            role="status"
          >
            <strong>同时只能加入一个围观群</strong>
            <p>退出当前围观后，才能搜索并加入其他围观群。</p>
            <button
              class="retry-button"
              @click="openChat({
                id: currentSpectatorGroup.id,
                name: currentSpectatorGroup.name,
                avatar: currentSpectatorGroup.icon,
                color: currentSpectatorGroup.color,
                mode: 'spectate',
              })"
            >
              继续围观 {{ currentSpectatorGroup.sourceGroupName }}
            </button>
          </div>
          <div v-else-if="(activeView === 'groups' ? visibleGroupChats : visibleSpectatorChats).length" class="group-card-grid">
            <article
              v-for="group in activeView === 'groups' ? visibleGroupChats : visibleSpectatorChats"
              :key="group.id"
              class="group-card"
            >
              <div class="group-card-banner" :style="{ '--group-color': group.color }">
                <span class="group-card-icon">{{ group.icon }}</span>
                <div class="group-card-stats">
                  <span v-if="activeView === 'spectate'" class="group-heat">
                    🔥 {{ group.heat }}
                  </span>
                  <span class="group-online">{{ group.onlineCount }} 人在线</span>
                </div>
              </div>
              <div class="group-card-content">
                <h2>{{ activeView === 'spectate' ? group.sourceGroupName : group.name }}</h2>
                <p class="group-description">
                  {{ group.description }}
                </p>
                <div class="group-tags" aria-label="兴趣标签">
                  <span v-for="tag in group.tags" :key="tag"># {{ tag }}</span>
                </div>
                <div class="group-card-footer">
                  <span>{{ group.memberCount }} 位成员</span>
                  <button
                    :class="{ joined: activeView === 'groups' ? group.joined : group.watching }"
                    :disabled="joiningGroupId === group.id"
                    @click="activeView === 'groups'
                      ? group.joined
                        ? openChat({ id: group.id, name: group.name, avatar: group.icon, color: group.color, mode: 'group' })
                        : joinGroupChat(group)
                      : watchGroupChat(group)"
                  >
                    {{
                      activeView === 'groups'
                        ? group.joined
                          ? '进入聊天'
                          : joiningGroupId === group.id
                            ? '正在加入…'
                            : '直接加入'
                        : group.watching
                          ? '继续围观'
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
            <strong>{{ activeView === 'groups' ? '这个兴趣标签下暂时还没有讨论' : '暂时没有可围观的讨论' }}</strong>
            <p v-if="activeView === 'groups'">试试其他兴趣标签。</p>
          </div>
          <p v-if="groupJoinError" class="group-error" role="alert">{{ groupJoinError }}</p>
        </section>
        <aside class="group-guide">
          <span class="group-guide-icon">{{ activeView === 'groups' ? '✦' : '◉' }}</span>
          <h2>{{ activeView === 'groups' ? '加入兴趣讨论' : '围观正在发生的聊天' }}</h2>
          <p v-if="activeView === 'groups'">瞎扯淡可以加入多个。</p>
          <p v-else>瞎起哄可以加入一个。</p>
          <div class="group-guide-count">
            <strong>{{ activeView === 'groups' ? joinedGroupChats.length : watchedGroupChats.length }}</strong>
            <span>{{ activeView === 'groups' ? '已加入的瞎扯淡们' : '已加入的瞎起哄' }}</span>
          </div>
        </aside>
      </div>

      <section v-else class="chat-view" aria-label="聊天">
        <div class="chat-context">
          <span>{{ activeChat?.mode === 'spectate' ? '围观群' : '兴趣' }}</span>
          <strong>{{ activeChat?.name }}</strong>
        </div>
        <p v-if="activeChat?.mode === 'spectate'" class="spectator-delay-notice" role="status">
          本群成员发言和来源兴趣群消息均实时显示。
        </p>
        <div class="chat-content">
          <div class="chat-message-pane">
            <div v-if="isLoadingMessages" class="chat-state" role="status">正在加载聊天记录…</div>
            <div v-else-if="chatError && !chatMessages.length" class="chat-state" role="alert">
              <strong>{{ chatError }}</strong>
              <button class="retry-button" @click="activeChat && openChat(activeChat)">重试</button>
            </div>
            <div
              v-else
              ref="chatMessagesElement"
              class="chat-messages"
              role="log"
              aria-label="聊天消息"
            >
              <div v-if="!chatMessages.length" class="chat-state">
                {{ activeChat?.mode === 'spectate' ? '还没有可展示的消息，请稍后再来围观。' : '还没有消息，发送第一条消息吧。' }}
              </div>
              <article
                v-for="message in chatMessages"
                :key="message.id"
                class="chat-message"
                :class="{
                  'own-message': message.senderId === currentUserId && !message.isSourceMessage,
                  'mentioned-you': message.mentions?.includes(currentUserId),
                  'unread-mention': unreadMentionMessageIds.has(message.id),
                }"
              >
                <template v-if="activeChat?.mode === 'spectate'">
                  <div class="chat-message-body">
                    <span v-if="message.isSourceMessage" class="source-message-label">
                      来源于{{ message.sourceGroupName }}
                    </span>
                    <button
                      v-if="message.replyTo"
                      type="button"
                      class="message-reply-context"
                      :class="{ 'message-masked': isReplyPreviewMasked(message) }"
                      :aria-label="isReplyPreviewMasked(message) ? '已屏蔽的引用内容，点击查看原文' : '查看引用内容'"
                      @click="toggleReplyPreview(message)"
                    >
                      回复内容：{{ message.replyTo.content }}
                    </button>
                    <p>{{ message.content }}</p>
                  </div>
                </template>
                <template v-else-if="message.senderId === currentUserId">
                  <div class="chat-message-body">
                    <span v-if="message.isSourceMessage" class="source-message-label">
                      来源于{{ message.sourceGroupName }}
                    </span>
                    <button
                      v-if="message.replyTo"
                      type="button"
                      class="message-reply-context"
                      :class="{ 'message-masked': isReplyPreviewMasked(message) }"
                      :aria-label="isReplyPreviewMasked(message) ? '已屏蔽的引用内容，点击查看原文' : '查看引用内容'"
                      @click="toggleReplyPreview(message)"
                    >
                      回复 {{ message.replyTo.senderId }}：{{ message.replyTo.content }}
                    </button>
                    <p>{{ message.content }}</p>
                  </div>
                </template>
                <template v-else>
                  <span class="avatar chat-avatar" :style="{ '--avatar-color': message.color }">
                    {{ message.avatar }}
                  </span>
                  <div class="chat-message-body">
                    <strong class="chat-sender-id">{{ message.senderId }}</strong>
                    <span v-if="message.mentions?.includes(currentUserId)" class="mention-notice">
                      提到了你
                    </span>
                    <span v-if="message.isSourceMessage" class="source-message-label">
                      来源于{{ message.sourceGroupName }}
                    </span>
                    <button
                      v-if="message.replyTo"
                      type="button"
                      class="message-reply-context"
                      :class="{ 'message-masked': isReplyPreviewMasked(message) }"
                      :aria-label="isReplyPreviewMasked(message) ? '已屏蔽的引用内容，点击查看原文' : '查看引用内容'"
                      @click="toggleReplyPreview(message)"
                    >
                      回复 {{ message.replyTo.senderId }}：{{ message.replyTo.content }}
                    </button>
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
                        <button
                          v-if="isSenderBlocked(message.senderId)"
                          type="button"
                          @click="unblockMessageSender(message)"
                        >
                          取消屏蔽
                        </button>
                        <button v-else type="button" @click="blockMessageSender(message)">
                          屏蔽
                        </button>
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
            aria-label="兴趣工具"
          >
            <button
              class="chat-tool-button"
              :class="{ selected: wantsToStay }"
              :aria-pressed="wantsToStay"
              :title="activeChat?.mode === 'spectate' ? '延续围观群到下三分钟' : '延续兴趣到明天'"
              :disabled="wantsToStay || isLoadingStayTomorrow || isSettingStayTomorrow || isLeavingGroup"
              @click="setStayPreference"
            >
              <span aria-hidden="true">☀</span>
              {{
                activeChat?.mode === 'spectate'
                  ? wantsToStay ? '下三分钟见 ✓' : '下三分钟见'
                  : wantsToStay ? '明天见 ✓' : '明天见'
              }}
            </button>
            <p v-if="wantsToStay" class="chat-tool-confirmation" role="status">
              {{
                activeChat?.mode === 'spectate'
                  ? '已告诉瞎起哄：你下三分钟还会在。'
                  : '已告诉闲扯淡：你明天还会在。'
              }}
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
              {{ isLeavingGroup ? '正在退出…' : activeChat?.mode === 'spectate' ? '立刻退出' : '立刻退出' }}
            </button>
            <p v-if="groupLeaveError" class="chat-tool-error" role="alert">
              {{ groupLeaveError }}
            </p>
            <button
              v-if="activeChat?.mode === 'spectate'"
              class="chat-tool-button convert-spectator-button"
              :disabled="isConvertingSpectator || isLeavingGroup"
              @click="convertSpectatorToInterestGroup"
            >
              {{ isConvertingSpectator ? '正在转化…' : '转化为兴趣群' }}
            </button>
            <p v-if="spectatorConversionError" class="chat-tool-error" role="alert">
              {{ spectatorConversionError }}
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
          <div v-if="activeChat?.mode !== 'spectate'" class="mention-picker">
            <button
              type="button"
              class="mention-picker-trigger"
              aria-label="提及群友"
              title="提及群友"
              :aria-expanded="isMentionPickerOpen"
              @click="toggleMentionPicker"
            >
              @
            </button>
            <div v-if="isMentionPickerOpen" class="mention-menu" role="listbox" aria-label="选择要提及的群友">
              <span class="mention-menu-heading">选择群友</span>
              <span v-if="isLoadingMentionMembers" class="mention-menu-state">正在加载群友…</span>
              <span v-else-if="mentionLoadError" class="mention-menu-state mention-menu-error" role="alert">
                {{ mentionLoadError }}
              </span>
              <span v-else-if="!mentionMembers.length" class="mention-menu-state">暂时没有可提及的群友</span>
              <button
                v-for="member in mentionMembers"
                :key="member.id"
                type="button"
                class="mention-member-option"
                role="option"
                @click="insertMention(member)"
              >
                <span class="mention-member-avatar" :style="{ '--avatar-color': member.color }">
                  {{ member.avatar }}
                </span>
                <span>{{ member.name }}</span>
              </button>
            </div>
          </div>
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
            :aria-label="isGroupToolsOpen ? '收起兴趣工具栏' : '展开兴趣工具栏'"
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
  scrollbar-width: none;
}

.joined-groups::-webkit-scrollbar {
  display: none;
}

.joined-groups-toggle {
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
}

.joined-groups-toggle:hover {
  color: var(--text);
}

.joined-groups-chevron {
  font-size: 15px;
  letter-spacing: 0;
}

.joined-group {
  height: 38px;
  font-size: 12px;
}

.joined-group-name {
  overflow: hidden;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.joined-group-unread {
  min-width: 20px;
  padding: 2px 6px;
  border-radius: 10px;
  background: #d83c3e;
  color: white;
  font-size: 10px;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
}

.joined-group-mention {
  padding: 2px 6px;
  border: 1px solid #a87ce5;
  border-radius: 10px;
  background: #49365f;
  color: #ead9ff;
  font-size: 10px;
  font-weight: 700;
  line-height: 14px;
}

.spectator-mini-label {
  color: var(--subtle);
  font-size: 10px;
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

.group-card-stats {
  display: flex;
  align-items: center;
  gap: 6px;
}

.group-heat {
  padding: 5px 8px;
  border-radius: 12px;
  background: rgb(25 26 30 / 50%);
  color: #ffd27a;
  font-size: 10px;
  font-weight: 700;
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

.spectator-delay-notice {
  margin: 0;
  padding: 8px 18px;
  background: #292a30;
  color: var(--muted);
  font-size: 12px;
}

.source-message-label {
  display: inline-block;
  margin-top: 5px;
  color: #f0b35b;
  font-size: 10px;
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
  display: flex;
  width: 220px;
  flex: 0 0 220px;
  flex-direction: column;
  gap: 12px;
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
  margin: 0;
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
  scrollbar-width: none;
}

.chat-messages::-webkit-scrollbar {
  display: none;
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

.chat-message.mentioned-you .chat-message-body {
  padding: 8px 10px;
  border-left: 3px solid #b78bfa;
  border-radius: 6px;
  background: #393146;
}

.chat-message.unread-mention .chat-message-body {
  box-shadow: 0 0 0 1px #b78bfa66;
}

.mention-notice {
  display: block;
  margin-top: 3px;
  color: #d7b8ff;
  font-size: 11px;
  font-weight: 700;
}

.chat-message:not(.own-message) .chat-message-body > p,
.chat-message:not(.own-message) .chat-reply-trigger > p {
  padding: 10px 13px;
  border-radius: 16px 16px 16px 4px;
  background: #383a40;
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
  display: block;
  width: 100%;
  overflow: hidden;
  max-width: 100%;
  margin: 0 0 5px;
  padding: 5px 8px;
  border-left: 2px solid #949ba4;
  border-radius: 0 4px 4px 0;
  background: #292a2f;
  color: var(--muted);
  font-size: 11px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-reply-context:hover {
  background: #33353b;
  color: var(--text);
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
  position: relative;
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

.mention-picker {
  position: relative;
  flex: 0 0 auto;
}

.chat-composer .mention-picker-trigger {
  min-width: 32px;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid #696d78;
  background: #41434a;
  color: #d8c0ff;
  font-size: 16px;
}

.chat-composer .mention-picker-trigger:hover,
.chat-composer .mention-picker-trigger[aria-expanded="true"] {
  background: #514266;
}

.mention-menu {
  position: absolute;
  z-index: 5;
  bottom: calc(100% + 10px);
  left: 0;
  display: flex;
  width: 240px;
  max-height: 280px;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid #4b4d55;
  border-radius: 8px;
  background: #2b2d31;
  box-shadow: 0 8px 24px #0006;
}

.mention-menu-heading,
.mention-menu-state {
  padding: 6px 8px;
  color: var(--muted);
  font-size: 11px;
}

.mention-menu-error {
  color: #f2a6a6;
}

.chat-composer .mention-member-option {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-start;
  gap: 9px;
  padding: 7px 8px;
  background: transparent;
  color: var(--text);
  text-align: left;
}

.chat-composer .mention-member-option:hover {
  background: #404249;
}

.mention-member-avatar {
  display: grid;
  width: 25px;
  height: 25px;
  flex: 0 0 25px;
  place-items: center;
  border-radius: 50%;
  background: var(--avatar-color, #5865f2);
  color: white;
  font-size: 11px;
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
    flex-direction: row;
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

  .topbar-divider,
  .topbar-action:not(.view-switch):not(.active) {
    display: none;
  }
}
</style>
