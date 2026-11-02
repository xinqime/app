import { http, HttpResponse, delay } from 'msw'

export const handlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const { username, password } = await request.json() as { username: string; password: string }
    await delay(600)
    if (username === 'admin' && password === '123456') {
      return HttpResponse.json({ code: 0, data: { token: 'mock-token' } })
    }
    return HttpResponse.json({ code: 1001, msg: '用户名或密码错误' })
  })
]