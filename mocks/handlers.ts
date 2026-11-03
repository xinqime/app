import { http, HttpResponse, delay } from 'msw'

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

type MockChatMessage = {
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

export const handlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const { username, password } = await request.json() as { username: string; password: string }
    await delay(600)
    if (username === 'admin' && password === '123456') {
      return HttpResponse.json({ code: 0, data: { token: 'mock-token' } })
    }
    return HttpResponse.json({ code: 1001, msg: '用户名或密码错误' })
  }),
  http.get('/api/group-chats', async () => {
    await delay(300)
    return HttpResponse.json({ code: 0, data: { groupChats: mockGroupChats } })
  }),
  http.post('/api/group-chats/:id/join', async ({ params }) => {
    await delay(250)
    const groupChat = mockGroupChats.find((group) => group.id === params.id)
    if (!groupChat) {
      return HttpResponse.json({ code: 1004, msg: '找不到这个群聊' }, { status: 404 })
    }

    if (!groupChat.joined) {
      groupChat.joined = true
      groupChat.memberCount += 1
      groupChat.onlineCount += 1
    }

    return HttpResponse.json({ code: 0, message: '已直接加入群聊', data: { groupChat } })
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
    }
    const chatKey = `group:${id}`
    mockChatMessages[chatKey] ??= []
    mockChatMessages[chatKey].push(message)

    return HttpResponse.json({ code: 0, data: { message } })
  }),
]