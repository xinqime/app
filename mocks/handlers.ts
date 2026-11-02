import { http, HttpResponse, delay } from 'msw'

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
]