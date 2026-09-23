/// <reference types="vite/client" />

interface Window {
  config?: {
    baseApi?: string
    storageKey?: {
      adminToken: string
      adminUsername: string
      adminRemember: string
      userToken: string
      userUsername: string
      userRemember: string
    }
  }
}

declare module '@/assets/china-map.js'
