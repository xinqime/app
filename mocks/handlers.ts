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
]