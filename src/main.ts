import { createApp } from 'vue'
import App from './App.vue'

async function enableMocking() {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === 'true') {
    const { worker } = await import('../mocks/browser')
    // onUnhandledRequest: 'bypass' 表示未匹配的请求照常发真实网络
    return worker.start({ onUnhandledRequest: 'bypass' })
  }
}

enableMocking().then(() => {
  createApp(App).mount('#app')
})
