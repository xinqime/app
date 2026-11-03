import { http, HttpResponse, delay, ws } from 'msw'

const mockGroupChats = [
  {
    id: 'indie-music',
    kind: 'interest' as const,
    name: '独立音乐分享会',
    description: '分享最近循环的歌单，聊聊喜欢的乐队和现场演出。',
    tags: ['音乐', '独立音乐'],
    memberCount: 128,
    onlineCount: 18,
    heat: 98,
    icon: '♫',
    color: '#8a62c7',
    joined: false,
  },
  {
    id: 'cozy-gamers',
    kind: 'interest' as const,
    name: '下班后开黑',
    description: '找队友、聊新游戏，休闲玩家也欢迎加入。',
    tags: ['游戏', '休闲'],
    memberCount: 356,
    onlineCount: 42,
    heat: 86,
    icon: '🎮',
    color: '#438b75',
    joined: false,
  },
  {
    id: 'book-nook',
    kind: 'interest' as const,
    name: '深夜读书角',
    description: '一起读书、交换书单，分享那些想了很久的句子。',
    tags: ['阅读', '文学'],
    memberCount: 84,
    onlineCount: 9,
    heat: 62,
    icon: '▤',
    color: '#b67b50',
    joined: false,
  },
  {
    id: 'creative-corner',
    kind: 'interest' as const,
    name: '灵感交换站',
    description: '插画、摄影、设计和任何正在发生的创作。',
    tags: ['创作', '设计'],
    memberCount: 213,
    onlineCount: 26,
    heat: 74,
    icon: '✦',
    color: '#5579c4',
    joined: false,
  },
  {
    id: 'dev-lounge',
    kind: 'interest' as const,
    name: '代码与咖啡',
    description: '聊聊开发日常、开源项目，欢迎不同技术栈的朋友。',
    tags: ['编程', '科技'],
    memberCount: 492,
    onlineCount: 67,
    heat: 91,
    icon: '</>',
    color: '#388c9a',
    joined: false,
  },
]

const mockSpectatorGroups = mockGroupChats.map((sourceGroup) => ({
  ...sourceGroup,
  kind: 'spectator' as const,
  id: `spectator-${sourceGroup.id}`,
  name: `${sourceGroup.name} · 围观群`,
  description: sourceGroup.description,
  joined: false,
  sourceGroupId: sourceGroup.id,
  sourceGroupName: sourceGroup.name,
}))
const mockStayTomorrowPreferences = new Set<string>()
const mockNextMinutePreferences = new Set<string>()
const mockSpectatorMembers = new Map<string, Set<string>>()
const mockSpectatorJoinedAt = new Map<string, number>()
const mockGroupReadCursors = new Map<string, number>()
const mockGroupChatSocket = ws.link('/api/group-chats/ws')
const mockSocketClients = new Set<{ userId: string; send: (data: string) => void }>()
let mockMessageTimer: ReturnType<typeof setInterval> | undefined
let mockMessageSequence = 0

function getGroupWatcherKey(userId: string, groupId: string) {
  return `${userId}:${groupId}`
}

function getSpectatorMembers(groupId: string) {
  let members = mockSpectatorMembers.get(groupId)
  if (!members) {
    members = new Set()
    mockSpectatorMembers.set(groupId, members)
  }
  return members
}

function getSpectatorMemberKey(userId: string, groupId: string) {
  return `${userId}:${groupId}`
}

function getSpectatorJoinTime(userId: string, groupId: string) {
  return mockSpectatorJoinedAt.get(getSpectatorMemberKey(userId, groupId))
}

function getGroupReadCursorKey(userId: string, groupId: string) {
  return `${userId}:${groupId}`
}

function getGroupUnreadCount(userId: string, groupId: string) {
  const messages = mockChatMessages[`group:${groupId}`] || []
  const readCursor = mockGroupReadCursors.get(getGroupReadCursorKey(userId, groupId)) || 0
  return messages
    .slice(readCursor)
    .filter((message) => message.senderId !== userId).length
}

function getGroupUnreadMentionCount(userId: string, groupId: string) {
  const messages = mockChatMessages[`group:${groupId}`] || []
  const readCursor = mockGroupReadCursors.get(getGroupReadCursorKey(userId, groupId)) || 0
  return messages
    .slice(readCursor)
    .filter((message) => message.senderId !== userId && message.mentions?.includes(userId)).length
}

function broadcastGroupMessage(groupId: string, message: MockChatMessage) {
  for (const client of mockSocketClients) {
    if (client.userId === message.senderId) continue
    client.send(JSON.stringify({
      type: 'message',
      groupId,
      message,
      unreadCount: getGroupUnreadCount(client.userId, groupId),
      unreadMentionCount: getGroupUnreadMentionCount(client.userId, groupId),
    }))
  }

  const sourceGroup = mockGroupChats.find((group) => group.id === groupId)
  if (!sourceGroup) return
  for (const spectatorGroup of mockSpectatorGroups) {
    if (spectatorGroup.sourceGroupId !== groupId) continue
    const members = getSpectatorMembers(spectatorGroup.id)
    const sourceMessage = {
      ...message,
      id: `source:${message.id}`,
      isSourceMessage: true,
      sourceGroupName: sourceGroup.name,
    }
    for (const client of mockSocketClients) {
      const joinedAt = getSpectatorJoinTime(client.userId, spectatorGroup.id)
      const createdAt = Date.parse(message.createdAt || '')
      if (!members.has(client.userId) || joinedAt === undefined || createdAt < joinedAt) continue
      client.send(JSON.stringify({
        type: 'message',
        groupType: 'spectator',
        groupId: spectatorGroup.id,
        message: sourceMessage,
      }))
    }
  }
}

function broadcastSpectatorMessage(groupId: string, message: MockChatMessage) {
  const members = getSpectatorMembers(groupId)
  for (const client of mockSocketClients) {
    if (client.userId === message.senderId || !members.has(client.userId)) continue
    client.send(JSON.stringify({
      type: 'message',
      groupType: 'spectator',
      groupId,
      message,
    }))
  }
}

type MockChatMessage = {
  id: string
  senderId: string
  senderName: string
  avatar: string
  color: string
  content: string
  createdAt?: string
  mentions?: string[]
  isSourceMessage?: boolean
  sourceGroupName?: string
  replyTo?: {
    senderId: string
    content: string
  }
}

const mockChatMessages: Record<string, MockChatMessage[]> = {
  'group:indie-music': [
    {
      id: 'indie-1',
      senderId: 'luna#1024',
      senderName: 'Luna',
      avatar: 'L',
      color: '#b67bea',
      content: '欢迎新朋友！最近有什么推荐的现场演出吗？',
      createdAt: new Date(Date.now() - 30000).toISOString(),
    },
  ],
  'group:cozy-gamers': [
    {
      id: 'game-1',
      senderId: 'mika#2048',
      senderName: 'Mika',
      avatar: 'M',
      color: '#58a6a0',
      content: '周末准备开 Minecraft 新档，有人一起吗？',
      createdAt: new Date(Date.now() - 30000).toISOString(),
    },
  ],
  'group:book-nook': [
    {
      id: 'book-1',
      senderId: 'sora#4096',
      senderName: 'Sora',
      avatar: 'S',
      color: '#6f8de8',
      content: '最近读完了《小王子》，又有了新的感受。',
      createdAt: new Date(Date.now() - 30000).toISOString(),
    },
  ],
  'group:creative-corner': [
    {
      id: 'creative-1',
      senderId: 'kai#3100',
      senderName: 'Kai',
      avatar: 'K',
      color: '#e49b62',
      content: '分享一个最近在尝试的配色灵感。',
      createdAt: new Date(Date.now() - 30000).toISOString(),
    },
  ],
  'group:dev-lounge': [
    {
      id: 'dev-1',
      senderId: 'mika#2048',
      senderName: 'Mika',
      avatar: 'M',
      color: '#58a6a0',
      content: '大家最近都在用什么前端工具？',
      createdAt: new Date(Date.now() - 30000).toISOString(),
    },
  ],
}

const mockSpectatorMessages: Record<string, MockChatMessage[]> = {}

const mockIncomingMessageTemplates = [
  {
    groupId: 'indie-music',
    senderId: 'luna#1024',
    senderName: 'Luna',
    avatar: 'L',
    color: '#b67bea',
    content: '刚刚又发现一首很适合分享的歌！',
  },
  {
    groupId: 'cozy-gamers',
    senderId: 'mika#2048',
    senderName: 'Mika',
    avatar: 'M',
    color: '#58a6a0',
    content: '有人今晚想一起玩吗？',
  },
  {
    groupId: 'book-nook',
    senderId: 'sora#4096',
    senderName: 'Sora',
    avatar: 'S',
    color: '#6f8de8',
    content: '分享一段刚读到的句子。',
  },
  {
    groupId: 'creative-corner',
    senderId: 'kai#3100',
    senderName: 'Kai',
    avatar: 'K',
    color: '#e49b62',
    content: '我更新了最近的创作进度。',
  },
  {
    groupId: 'dev-lounge',
    senderId: 'mika#2048',
    senderName: 'Mika',
    avatar: 'M',
    color: '#58a6a0',
    content: '刚测试了一个新的开发工具。',
  },
]

function getMockGroupMembers(groupId: string, currentUserId: string) {
  const members = new Map<string, { id: string; name: string; avatar: string; color: string }>()
  const messages = [
    ...(mockChatMessages[`group:${groupId}`] || []),
    ...mockIncomingMessageTemplates.filter((message) => message.groupId === groupId),
  ]
  for (const message of messages) {
    if (message.senderId === currentUserId) continue
    members.set(message.senderId, {
      id: message.senderId,
      name: message.senderName,
      avatar: message.avatar,
      color: message.color,
    })
  }
  return [...members.values()]
}

function emitMockGroupMessage() {
  if (!mockSocketClients.size) return

  const template = mockIncomingMessageTemplates[mockMessageSequence % mockIncomingMessageTemplates.length]
  if (!template) return
  mockMessageSequence += 1
  const groupChat = mockGroupChats.find((group) => group.id === template.groupId)
  if (!groupChat) return
  groupChat.heat = Math.min(100, groupChat.heat + 1)
  const message: MockChatMessage = {
    ...template,
    id: `group-${groupChat.id}-${Date.now()}-${mockMessageSequence}`,
    createdAt: new Date().toISOString(),
  }
  const chatKey = `group:${groupChat.id}`
  mockChatMessages[chatKey] ??= []
  mockChatMessages[chatKey].push(message)

  broadcastGroupMessage(groupChat.id, message)
}

const mockGroupChatSocketHandler = mockGroupChatSocket.addEventListener('connection', ({ client }) => {
  const userId = client.url.searchParams.get('userId')?.trim()
  if (!userId) {
    client.close(1008, '缺少当前用户信息')
    return
  }

  const mockClient = {
    userId,
    send: (data: string) => client.send(data),
  }
  mockSocketClients.add(mockClient)
  client.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as { type?: string }
      if (payload.type === 'heartbeat') {
        mockClient.send(JSON.stringify({ type: 'pong' }))
      }
    } catch (error) {
      console.error('收到无效的群聊 WebSocket 请求:', error)
    }
  })
  client.addEventListener('close', () => {
    mockSocketClients.delete(mockClient)
    if (!mockSocketClients.size && mockMessageTimer) {
      clearInterval(mockMessageTimer)
      mockMessageTimer = undefined
    }
  })

  if (!mockMessageTimer) {
    mockMessageTimer = setInterval(emitMockGroupMessage, 20000)
  }
})

export const handlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const { username, password } = await request.json() as { username: string; password: string }
    await delay(600)
    if (username === 'admin' && password === '123456') {
      return HttpResponse.json({ code: 0, data: { token: 'mock-token' } })
    }
    return HttpResponse.json({ code: 1001, msg: '用户名或密码错误' })
  }),
  http.get('/api/group-chats', async ({ request }) => {
    await delay(300)
    const userId = new URL(request.url).searchParams.get('userId')?.trim()
    if (!userId) {
      return HttpResponse.json({ code: 1002, msg: '缺少当前用户信息' }, { status: 400 })
    }

    const groupChats = mockGroupChats.map((group) => {
      const messages = mockChatMessages[`group:${group.id}`] || []
      return {
        ...group,
        newMessageCount: getGroupUnreadCount(userId, group.id),
        unreadMentionCount: getGroupUnreadMentionCount(userId, group.id),
        lastMessageAt: messages.at(-1)?.createdAt || '',
      }
    })
    const spectatorGroups = mockSpectatorGroups.map((group) => {
      const sourceMessages = mockChatMessages[`group:${group.sourceGroupId}`] || []
      return {
        ...group,
        heat: mockGroupChats.find((item) => item.id === group.sourceGroupId)?.heat ?? group.heat,
        watching: getSpectatorMembers(group.id).has(userId),
        memberCount: mockGroupChats.find((item) => item.id === group.sourceGroupId)?.memberCount ??
          group.memberCount,
        onlineCount: mockGroupChats.find((item) => item.id === group.sourceGroupId)?.onlineCount ??
          group.onlineCount,
        lastMessageAt: (mockSpectatorMessages[group.id] || []).at(-1)?.createdAt ||
          sourceMessages.at(-1)?.createdAt || '',
      }
    })
    return HttpResponse.json({ code: 0, data: { groupChats, spectatorGroups } })
  }),
  http.get('/api/group-chats/:id/members', async ({ params, request }) => {
    const groupId = String(params.id)
    const userId = new URL(request.url).searchParams.get('userId')?.trim()
    const group = mockGroupChats.find((item) => item.id === groupId && item.joined)
    if (!group || !userId) {
      return HttpResponse.json({ code: 1004, msg: '找不到已加入的兴趣群' }, { status: 404 })
    }

    return HttpResponse.json({
      code: 0,
      data: { members: getMockGroupMembers(groupId, userId) },
    })
  }),
  http.post('/api/group-chats/:id/join', async ({ params, request }) => {
    await delay(250)
    const body = await request.json() as { userId?: string; mode?: 'spectate' }
    const userId = body.userId?.trim()
    if (!userId) {
      return HttpResponse.json({ code: 1002, msg: '缺少当前用户信息' }, { status: 400 })
    }

    if (body.mode === 'spectate') {
      const sourceGroup = mockGroupChats.find((group) => group.id === params.id)
      const spectatorGroup = mockSpectatorGroups.find((group) => group.sourceGroupId === params.id)
      if (!sourceGroup || !spectatorGroup) {
        return HttpResponse.json({ code: 1004, msg: '找不到来源兴趣或对应的围观群' }, { status: 404 })
      }

      const currentSpectatorGroup = mockSpectatorGroups.find((group) =>
        group.id !== spectatorGroup.id && getSpectatorMembers(group.id).has(userId),
      )
      if (currentSpectatorGroup) {
        return HttpResponse.json(
          { code: 1005, msg: '同时只能加入一个围观群，请先退出当前围观群' },
          { status: 409 },
        )
      }

      const members = getSpectatorMembers(spectatorGroup.id)
      if (!members.has(userId)) {
        mockSpectatorJoinedAt.set(
          getSpectatorMemberKey(userId, spectatorGroup.id),
          Date.now(),
        )
      }
      members.add(userId)
      return HttpResponse.json({
        code: 0,
        message: '已加入围观群',
        data: {
          groupChat: {
            ...spectatorGroup,
            watching: true,
            memberCount: sourceGroup.memberCount,
            onlineCount: sourceGroup.onlineCount,
            heat: sourceGroup.heat,
          },
        },
      })
    }

    const groupChat = mockGroupChats.find((group) => group.id === params.id)
    if (!groupChat) {
      return HttpResponse.json({ code: 1004, msg: '找不到这个兴趣' }, { status: 404 })
    }

    if (!groupChat.joined) {
      groupChat.joined = true
      groupChat.memberCount += 1
      groupChat.onlineCount += 1
    }

    return HttpResponse.json({
      code: 0,
      message: '已直接加入群聊',
      data: {
        groupChat: {
          ...groupChat,
          newMessageCount: getGroupUnreadCount(userId, groupChat.id),
        },
      },
    })
  }),
  http.post('/api/spectator-groups/:id/leave', async ({ params, request }) => {
    const groupId = String(params.id)
    const spectatorGroup = mockSpectatorGroups.find((group) => group.id === groupId)
    if (!spectatorGroup) {
      return HttpResponse.json({ code: 1004, msg: '找不到这个围观群' }, { status: 404 })
    }

    const body = await request.json() as { userId?: string }
    const userId = body.userId?.trim()
    if (!userId) {
      return HttpResponse.json({ code: 1002, msg: '缺少当前用户信息' }, { status: 400 })
    }

    const members = getSpectatorMembers(groupId)
    members.delete(userId)
    mockSpectatorJoinedAt.delete(getSpectatorMemberKey(userId, groupId))
    mockNextMinutePreferences.delete(getGroupWatcherKey(userId, groupId))
    return HttpResponse.json({
      code: 0,
      message: '已退出围观群',
      data: {
        groupChat: {
          ...spectatorGroup,
          watching: false,
          memberCount: members.size,
          onlineCount: members.size,
        },
      },
    })
  }),
  http.post('/api/group-chats/:id/leave', async ({ params, request }) => {
    await delay(250)
    const groupChat = mockGroupChats.find((group) => group.id === params.id && group.joined)
    if (!groupChat) {
      return HttpResponse.json({ code: 1004, msg: '找不到已加入的群聊' }, { status: 404 })
    }

    const body = await request.json() as { userId?: string }
    const userId = body.userId?.trim()
    if (!userId) {
      return HttpResponse.json({ code: 1002, msg: '缺少当前用户信息' }, { status: 400 })
    }

    groupChat.joined = false
    groupChat.memberCount = Math.max(0, groupChat.memberCount - 1)
    groupChat.onlineCount = Math.max(0, groupChat.onlineCount - 1)
    mockStayTomorrowPreferences.delete(`${groupChat.id}:${userId}`)
    return HttpResponse.json({
      code: 0,
      message: '已退出群聊',
      data: { groupChat },
    })
  }),
  http.get('/api/group-chats/:id/see-you-tomorrow', async ({ params, request }) => {
    const groupChat = mockGroupChats.find((group) => group.id === params.id && group.joined)
    if (!groupChat) {
      return HttpResponse.json({ code: 1004, msg: '找不到这个群聊' }, { status: 404 })
    }

    const userId = new URL(request.url).searchParams.get('userId')?.trim()
    if (!userId) {
      return HttpResponse.json({ code: 1002, msg: '缺少当前用户信息' }, { status: 400 })
    }

    const preferenceKey = `${groupChat.id}:${userId}`
    return HttpResponse.json({
      code: 0,
      data: { wantsToStayTomorrow: mockStayTomorrowPreferences.has(preferenceKey) },
    })
  }),
  http.post('/api/group-chats/:id/see-you-tomorrow', async ({ params, request }) => {
    const groupChat = mockGroupChats.find((group) => group.id === params.id && group.joined)
    if (!groupChat) {
      return HttpResponse.json({ code: 1004, msg: '找不到这个群聊' }, { status: 404 })
    }

    const body = await request.json() as { userId?: string }
    const userId = body.userId?.trim()
    if (!userId) {
      return HttpResponse.json({ code: 1002, msg: '缺少当前用户信息' }, { status: 400 })
    }

    mockStayTomorrowPreferences.add(`${groupChat.id}:${userId}`)
    return HttpResponse.json({
      code: 0,
      message: '已告知群聊你明天还会在',
      data: { wantsToStayTomorrow: true },
    })
  }),
  http.get('/api/spectator-groups/:id/next-minute', async ({ params, request }) => {
    const groupId = String(params.id)
    const group = mockSpectatorGroups.find((item) => item.id === groupId)
    const userId = new URL(request.url).searchParams.get('userId')?.trim()
    if (!group || !userId || !getSpectatorMembers(groupId).has(userId)) {
      return HttpResponse.json({ code: 1004, msg: '找不到已加入的围观群' }, { status: 404 })
    }

    return HttpResponse.json({
      code: 0,
      data: { wantsToStayTomorrow: mockNextMinutePreferences.has(getGroupWatcherKey(userId, groupId)) },
    })
  }),
  http.post('/api/spectator-groups/:id/next-minute', async ({ params, request }) => {
    const groupId = String(params.id)
    const group = mockSpectatorGroups.find((item) => item.id === groupId)
    const body = await request.json() as { userId?: string }
    const userId = body.userId?.trim()
    if (!group || !userId || !getSpectatorMembers(groupId).has(userId)) {
      return HttpResponse.json({ code: 1004, msg: '找不到已加入的围观群' }, { status: 404 })
    }

    mockNextMinutePreferences.add(getGroupWatcherKey(userId, groupId))
    return HttpResponse.json({
      code: 0,
      message: '已告诉围观群你下三分钟还会在',
      data: { wantsToStayTomorrow: true },
    })
  }),
  http.post('/api/spectator-groups/:id/convert', async ({ params, request }) => {
    const groupId = String(params.id)
    const spectatorGroupIndex = mockSpectatorGroups.findIndex((group) => group.id === groupId)
    const body = await request.json() as { userId?: string }
    const userId = body.userId?.trim()
    const spectatorGroup = mockSpectatorGroups[spectatorGroupIndex]
    if (
      !spectatorGroup ||
      !userId ||
      !getSpectatorMembers(groupId).has(userId)
    ) {
      return HttpResponse.json({ code: 1004, msg: '找不到已加入的围观群' }, { status: 404 })
    }

    const sourceGroup = mockGroupChats.find((group) => group.id === spectatorGroup.sourceGroupId)
    if (!sourceGroup) {
      return HttpResponse.json({ code: 1004, msg: '找不到来源兴趣群' }, { status: 404 })
    }

    const sourceMessages = (mockChatMessages[`group:${sourceGroup.id}`] || [])
      .filter((message) => {
        const joinedAt = getSpectatorJoinTime(userId, groupId)
        const createdAt = Date.parse(message.createdAt || '')
        return joinedAt !== undefined && createdAt >= joinedAt
      })
      .map((message) => ({
        ...message,
        id: `source:${message.id}`,
        isSourceMessage: true,
        sourceGroupName: sourceGroup.name,
      }))
    const spectatorMessages = mockSpectatorMessages[groupId] || []
    const convertedGroup = {
      ...spectatorGroup,
      kind: 'interest' as const,
      name: `${sourceGroup.name} · 兴趣群`,
      description: spectatorGroup.description,
      tags: [...sourceGroup.tags],
      heat: sourceGroup.heat,
      joined: true,
      watching: false,
      memberCount: Math.max(1, getSpectatorMembers(groupId).size),
      onlineCount: Math.max(1, getSpectatorMembers(groupId).size),
    }
    mockChatMessages[`group:${groupId}`] = [...sourceMessages, ...spectatorMessages]
      .sort((left, right) => (Date.parse(left.createdAt || '') || 0) - (Date.parse(right.createdAt || '') || 0))
    mockGroupChats.push(convertedGroup)
    mockSpectatorGroups.splice(spectatorGroupIndex, 1)
    for (const memberId of getSpectatorMembers(groupId)) {
      mockSpectatorJoinedAt.delete(getSpectatorMemberKey(memberId, groupId))
    }
    mockSpectatorMembers.delete(groupId)
    mockNextMinutePreferences.delete(getGroupWatcherKey(userId, groupId))
    return HttpResponse.json({
      code: 0,
      message: '围观群已转化为兴趣群',
      data: { groupChat: convertedGroup },
    })
  }),
  http.get('/api/spectator-groups/:id/messages', async ({ params, request }) => {
    await delay(200)
    const groupId = String(params.id)
    const group = mockSpectatorGroups.find((item) => item.id === groupId)
    const userId = new URL(request.url).searchParams.get('userId')?.trim()
    if (!group || !userId || !getSpectatorMembers(groupId).has(userId)) {
      return HttpResponse.json({ code: 1004, msg: '找不到已加入的围观群' }, { status: 404 })
    }

    const joinedAt = getSpectatorJoinTime(userId, groupId)
    if (joinedAt === undefined) {
      return HttpResponse.json({ code: 1004, msg: '找不到围观加入时间' }, { status: 404 })
    }

    const sourceMessages = (mockChatMessages[`group:${group.sourceGroupId}`] || [])
      .filter((message) => Date.parse(message.createdAt || '') >= joinedAt)
      .map((message) => ({
        ...message,
        id: `source:${message.id}`,
        isSourceMessage: true,
        sourceGroupName: group.sourceGroupName,
      }))
    const spectatorMessages = mockSpectatorMessages[groupId] || []
    const messages = [...sourceMessages, ...spectatorMessages]
      .sort((left, right) =>
        (Date.parse(left.createdAt || '') || 0) - (Date.parse(right.createdAt || '') || 0),
      )
    return HttpResponse.json({ code: 0, data: { messages } })
  }),
  http.post('/api/spectator-groups/:id/messages', async ({ params, request }) => {
    const groupId = String(params.id)
    const group = mockSpectatorGroups.find((item) => item.id === groupId)
    const body = await request.json() as Omit<MockChatMessage, 'id'>
    if (
      !group ||
      !body.senderId ||
      !getSpectatorMembers(groupId).has(body.senderId) ||
      !body.content?.trim()
    ) {
      return HttpResponse.json({ code: 1002, msg: '围观群不存在或消息内容无效' }, { status: 400 })
    }

    const message: MockChatMessage = {
      ...body,
      id: `spectator-${groupId}-${Date.now()}`,
      content: body.content.trim(),
      createdAt: body.createdAt || new Date().toISOString(),
    }
    mockSpectatorMessages[groupId] ??= []
    mockSpectatorMessages[groupId].push(message)
    broadcastSpectatorMessage(groupId, message)
    return HttpResponse.json({ code: 0, data: { message } })
  }),
  http.get('/api/group-chats/:id/messages', async ({ params, request }) => {
    await delay(200)
    const id = String(params.id)
    const canJoin = mockGroupChats.some((group) => group.id === id && group.joined)
    if (!canJoin) {
      return HttpResponse.json({ code: 1004, msg: '找不到这个聊天' }, { status: 404 })
    }

    const userId = new URL(request.url).searchParams.get('userId')?.trim()
    if (!userId) {
      return HttpResponse.json({ code: 1002, msg: '缺少当前用户信息' }, { status: 400 })
    }
    const messages = mockChatMessages[`group:${id}`] || []
    const readCursor = mockGroupReadCursors.get(getGroupReadCursorKey(userId, id)) || 0
    const unreadMentionMessageIds = messages
      .slice(readCursor)
      .filter((message) => message.senderId !== userId && message.mentions?.includes(userId))
      .map((message) => message.id)
    return HttpResponse.json({ code: 0, data: { messages, unreadMentionMessageIds } })
  }),
  http.post('/api/group-chats/:id/read', async ({ params, request }) => {
    const id = String(params.id)
    const groupChat = mockGroupChats.find((group) => group.id === id && group.joined)
    if (!groupChat) {
      return HttpResponse.json({ code: 1004, msg: '找不到已加入的群聊' }, { status: 404 })
    }

    const body = await request.json() as { userId?: string; lastReadMessageId?: string }
    const userId = body.userId?.trim()
    const lastReadMessageId = body.lastReadMessageId?.trim()
    if (!userId || !lastReadMessageId) {
      return HttpResponse.json({ code: 1002, msg: '缺少用户信息或已读消息标识' }, { status: 400 })
    }

    const messages = mockChatMessages[`group:${id}`] || []
    const acknowledgedIndex = messages.findIndex((message) => message.id === lastReadMessageId)
    if (acknowledgedIndex === -1) {
      return HttpResponse.json({ code: 1004, msg: '找不到已读消息' }, { status: 404 })
    }

    const cursorKey = getGroupReadCursorKey(userId, id)
    const currentCursor = mockGroupReadCursors.get(cursorKey) || 0
    const readCursor = Math.max(currentCursor, acknowledgedIndex + 1)
    mockGroupReadCursors.set(cursorKey, readCursor)
    const unreadMessages = messages.slice(readCursor)
    const newMessageCount = unreadMessages
      .filter((message) => message.senderId !== userId).length
    const unreadMentionCount = unreadMessages
      .filter((message) => message.senderId !== userId && message.mentions?.includes(userId)).length
    return HttpResponse.json({ code: 0, data: { newMessageCount, unreadMentionCount } })
  }),
  http.post('/api/group-chats/:id/messages', async ({ params, request }) => {
    const id = String(params.id)
    const isJoinedGroup = mockGroupChats.some((group) => group.id === id && group.joined)
    if (!isJoinedGroup) {
      return HttpResponse.json({ code: 1004, msg: '找不到这个聊天' }, { status: 404 })
    }

    const body = await request.json() as Omit<MockChatMessage, 'id'>
    if (
      !body.content?.trim() ||
      (body.mentions !== undefined &&
        (!Array.isArray(body.mentions) || body.mentions.some((userId) => typeof userId !== 'string')))
    ) {
      return HttpResponse.json({ code: 1002, msg: '消息内容或提及对象无效' }, { status: 400 })
    }

    const message: MockChatMessage = {
      ...body,
      id: `group-${id}-${Date.now()}`,
      content: body.content.trim(),
      createdAt: body.createdAt || new Date().toISOString(),
    }
    const chatKey = `group:${id}`
    mockChatMessages[chatKey] ??= []
    mockChatMessages[chatKey].push(message)
    const groupChat = mockGroupChats.find((group) => group.id === id)
    if (groupChat) groupChat.heat = Math.min(100, groupChat.heat + 1)
    broadcastGroupMessage(id, message)

    return HttpResponse.json({ code: 0, data: { message } })
  }),
  mockGroupChatSocketHandler,
]