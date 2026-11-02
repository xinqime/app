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
  'friend:luna': [
    {
      id: 'luna-1',
      senderId: 'luna#1024',
      senderName: 'Luna',
      avatar: 'L',
      color: '#b67bea',
      content: '最近在循环听这张专辑，你听过吗？',
    },
    {
      id: 'luna-2',
      senderId: 'admin#0001',
      senderName: 'admin',
      avatar: 'A',
      color: '#5865f2',
      content: '还没有，晚点去听听！',
    },
  ],
  'friend:mika': [
    {
      id: 'mika-1',
      senderId: 'mika#2048',
      senderName: 'Mika',
      avatar: 'M',
      color: '#58a6a0',
      content: '今晚有空一起开一局吗？',
    },
  ],
  'friend:kai': [
    {
      id: 'kai-1',
      senderId: 'kai#3100',
      senderName: 'Kai',
      avatar: 'K',
      color: '#e49b62',
      content: '我整理了一份周末活动清单，发你看看。',
    },
  ],
  'friend:sora': [
    {
      id: 'sora-1',
      senderId: 'sora#4096',
      senderName: 'Sora',
      avatar: 'S',
      color: '#6f8de8',
      content: '嗨，最近怎么样？',
    },
  ],
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

const mockFriends = [
  { id: 'luna', name: 'Luna', initials: 'L', color: '#b67bea' },
  { id: 'mika', name: 'Mika', initials: 'M', color: '#58a6a0' },
  { id: 'kai', name: 'Kai', initials: 'K', color: '#e49b62' },
  { id: 'sora', name: 'Sora', initials: 'S', color: '#6f8de8' },
]

export const handlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const { username, password } = await request.json() as { username: string; password: string }
    await delay(600)
    if (username === 'admin' && password === '123456') {
      return HttpResponse.json({ code: 0, data: { token: 'mock-token' } })
    }
    return HttpResponse.json({ code: 1001, msg: '用户名或密码错误' })
  }),
  http.get('/api/home', async () => {
    await delay(300)
    return HttpResponse.json({
      code: 0,
      data: {
        friends: [
          {
            id: 'luna',
            name: 'Luna',
            initials: 'L',
            status: '正在听音乐',
            activity: '正在听《Midnight City》',
            activityTitle: '音乐',
            activityIcon: '♫',
            color: '#b67bea',
            online: true,
          },
          {
            id: 'mika',
            name: 'Mika',
            initials: 'M',
            status: '正在玩 Minecraft',
            activity: 'Minecraft · 生存模式',
            activityTitle: 'Minecraft',
            activityIcon: '▦',
            color: '#58a6a0',
            online: true,
          },
          {
            id: 'kai',
            name: 'Kai',
            initials: 'K',
            status: '暂时离开',
            activity: '上次在线 12 分钟前',
            activityTitle: '',
            activityIcon: '',
            color: '#e49b62',
            online: false,
          },
          {
            id: 'sora',
            name: 'Sora',
            initials: 'S',
            status: '在线',
            activity: '随时可以开始聊天',
            activityTitle: '',
            activityIcon: '',
            color: '#6f8de8',
            online: true,
          },
        ],
      },
    })
  }),
  http.post('/api/friend-requests', async ({ request }) => {
    const { username } = await request.json() as { username: string }
    await delay(300)
    if (!username.trim()) {
      return HttpResponse.json({ code: 1002, msg: '请输入好友用户名' }, { status: 400 })
    }
    return HttpResponse.json({ code: 0, message: '好友请求已发送。' })
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
  http.get('/api/chats/:type/:id/messages', async ({ params }) => {
    await delay(200)
    const type = String(params.type)
    const id = String(params.id)
    const isKnownChat =
      (type === 'friend' && mockFriends.some((friend) => friend.id === id)) ||
      (type === 'group' && mockGroupChats.some((group) => group.id === id && group.joined))
    if (!isKnownChat) {
      return HttpResponse.json({ code: 1004, msg: '找不到这个聊天' }, { status: 404 })
    }

    return HttpResponse.json({
      code: 0,
      data: { messages: mockChatMessages[`${type}:${id}`] || [] },
    })
  }),
  http.post('/api/chats/:type/:id/messages', async ({ params, request }) => {
    const type = String(params.type)
    const id = String(params.id)
    const isKnownChat =
      (type === 'friend' && mockFriends.some((friend) => friend.id === id)) ||
      (type === 'group' && mockGroupChats.some((group) => group.id === id && group.joined))
    if (!isKnownChat) {
      return HttpResponse.json({ code: 1004, msg: '找不到这个聊天' }, { status: 404 })
    }

    const body = await request.json() as Omit<MockChatMessage, 'id'>
    if (!body.content?.trim()) {
      return HttpResponse.json({ code: 1002, msg: '消息内容不能为空' }, { status: 400 })
    }

    const message: MockChatMessage = {
      ...body,
      id: `${type}-${id}-${Date.now()}`,
      content: body.content.trim(),
    }
    const chatKey = `${type}:${id}`
    mockChatMessages[chatKey] ??= []
    mockChatMessages[chatKey].push(message)

    return HttpResponse.json({ code: 0, data: { message } })
  }),
]