import { http, HttpResponse, delay, ws } from 'msw'

const mockGroupChats = [
  {
    id: 'indie-music',
    name: '独立音乐分享会',
    description: '分享最近循环的歌单，聊聊喜欢的乐队和现场演出。',
    tags: ['音乐', '独立音乐'],
    memberCount: 128,
    onlineCount: 18,
    icon: '♫',
    color: '#8a62c7',
    joined: false,
  },
  {
    id: 'cozy-gamers',
    name: '下班后开黑',
    description: '找队友、聊新游戏，休闲玩家也欢迎加入。',
    tags: ['游戏', '休闲'],
    memberCount: 356,
    onlineCount: 42,
    icon: '🎮',
    color: '#438b75',
    joined: false,
  },
  {
    id: 'book-nook',
    name: '深夜读书角',
    description: '一起读书、交换书单，分享那些想了很久的句子。',
    tags: ['阅读', '文学'],
    memberCount: 84,
    onlineCount: 9,
    icon: '▤',
    color: '#b67b50',
    joined: false,
  },
  {
    id: 'creative-corner',
    name: '灵感交换站',
    description: '插画、摄影、设计和任何正在发生的创作。',
    tags: ['创作', '设计'],
    memberCount: 213,
    onlineCount: 26,
    icon: '✦',
    color: '#5579c4',
    joined: false,
  },
  {
    id: 'dev-lounge',
    name: '代码与咖啡',
    description: '聊聊开发日常、开源项目，欢迎不同技术栈的朋友。',
    tags: ['编程', '科技'],
    memberCount: 492,
    onlineCount: 67,
    icon: '</>',
    color: '#388c9a',
    joined: false,
  },
]

const mockStayTomorrowPreferences = new Set<string>()
const mockGroupReadCursors = new Map<string, number>()
const mockGroupChatSocket = ws.link('/api/group-chats/ws')
const mockSocketClients = new Set<{ userId: string; send: (data: string) => void }>()
let mockMessageTimer: ReturnType<typeof setInterval> | undefined
let mockMessageSequence = 0

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

function broadcastGroupMessage(groupId: string, message: MockChatMessage) {
  for (const client of mockSocketClients) {
    if (client.userId === message.senderId) continue
    client.send(JSON.stringify({
      type: 'message',
      groupId,
      message,
      unreadCount: getGroupUnreadCount(client.userId, groupId),
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
    },
  ],
}

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

function emitMockGroupMessage() {
  const joinedGroups = mockGroupChats.filter((group) => group.joined)
  if (!joinedGroups.length || !mockSocketClients.size) return

  const availableTemplates = mockIncomingMessageTemplates.filter((template) =>
    joinedGroups.some((group) => group.id === template.groupId),
  )
  if (!availableTemplates.length) return

  const template = availableTemplates[mockMessageSequence % availableTemplates.length]
  if (!template) return
  mockMessageSequence += 1
  const groupChat = joinedGroups.find((group) => group.id === template.groupId)
  if (!groupChat) return
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
        lastMessageAt: messages.at(-1)?.createdAt || '',
      }
    })
    return HttpResponse.json({ code: 0, data: { groupChats } })
  }),
  http.post('/api/group-chats/:id/join', async ({ params, request }) => {
    await delay(250)
    const groupChat = mockGroupChats.find((group) => group.id === params.id)
    if (!groupChat) {
      return HttpResponse.json({ code: 1004, msg: '找不到这个群聊' }, { status: 404 })
    }

    const body = await request.json() as { userId?: string }
    const userId = body.userId?.trim()
    if (!userId) {
      return HttpResponse.json({ code: 1002, msg: '缺少当前用户信息' }, { status: 400 })
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
  http.get('/api/group-chats/:id/messages', async ({ params }) => {
    await delay(200)
    const id = String(params.id)
    const isJoinedGroup = mockGroupChats.some((group) => group.id === id && group.joined)
    if (!isJoinedGroup) {
      return HttpResponse.json({ code: 1004, msg: '找不到这个聊天' }, { status: 404 })
    }

    return HttpResponse.json({
      code: 0,
      data: { messages: mockChatMessages[`group:${id}`] || [] },
    })
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
    const newMessageCount = messages
      .slice(readCursor)
      .filter((message) => message.senderId !== userId).length
    return HttpResponse.json({ code: 0, data: { newMessageCount } })
  }),
  http.post('/api/group-chats/:id/messages', async ({ params, request }) => {
    const id = String(params.id)
    const isJoinedGroup = mockGroupChats.some((group) => group.id === id && group.joined)
    if (!isJoinedGroup) {
      return HttpResponse.json({ code: 1004, msg: '找不到这个聊天' }, { status: 404 })
    }

    const body = await request.json() as Omit<MockChatMessage, 'id'>
    if (!body.content?.trim()) {
      return HttpResponse.json({ code: 1002, msg: '消息内容不能为空' }, { status: 400 })
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
    broadcastGroupMessage(id, message)

    return HttpResponse.json({ code: 0, data: { message } })
  }),
  mockGroupChatSocketHandler,
]