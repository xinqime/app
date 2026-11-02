/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK: string   // 注意：所有 VITE_ 变量运行时都是字符串
  readonly VITE_API_BASE: string
  // 更多自定义变量...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}