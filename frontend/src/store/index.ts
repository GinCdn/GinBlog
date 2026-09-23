/**
 * 全局状态管理（Zustand）
 * 管理网站配置、用户信息、管理员信息
 */
import { create } from 'zustand'
import { publicApi, userApi, adminApi } from '@/api'
import { setToken, removeToken, setUsername } from '@/utils/auth'
import type { SiteConfig, User, AdminInfo, LoginForm, UserLoginResponse } from '@/types'

// 网站配置状态
export interface AppState {
  siteConfig: SiteConfig | null
  siteConfigLoaded: boolean
  loadSiteConfig: () => Promise<void>
}

export const useAppStore = create<AppState>((set) => ({
  siteConfig: null,
  siteConfigLoaded: false,
  loadSiteConfig: async () => {
    try {
      const res = await publicApi.getSiteInfo()
      if (res.code === 200) {
        set({ siteConfig: res.data })
      }
    } catch {
      // 配置加载失败时使用默认值
    } finally {
      set({ siteConfigLoaded: true })
    }
  }
}))

// 用户状态
interface UserState {
  userInfo: User | null
  token: string | null
  login: (form: LoginForm) => Promise<Result<UserLoginResponse>>
  getUserInfo: () => Promise<void>
  logout: () => void
}

import type { Result } from '@/types'

export const useUserStore = create<UserState>((set) => ({
  userInfo: null,
  token: null,
  login: async (form: LoginForm) => {
    const res = await userApi.login(form)
    if (res.data?.token) {
      setToken('user', res.data.token)
      setUsername('user', res.data.UserVo?.Username || form.username)
      set({ token: res.data.token })
    }
    return res
  },
  getUserInfo: async () => {
    try {
      const res = await userApi.getUserInfo()
      if (res.data) {
        set({ userInfo: res.data })
      }
    } catch {
      // 忽略
    }
  },
  logout: () => {
    removeToken('user')
    set({ userInfo: null, token: null })
  }
}))

// 管理员状态
interface AdminState {
  adminInfo: AdminInfo | null
  token: string | null
  login: (form: LoginForm) => Promise<Result>
  getAdminInfo: () => Promise<void>
  logout: () => void
}

export const useAdminStore = create<AdminState>((set) => ({
  adminInfo: null,
  token: null,
  login: async (form: LoginForm) => {
    const res = await adminApi.login(form)
    if (res.data?.token) {
      setToken('admin', res.data.token)
      setUsername('admin', form.username)
      set({ token: res.data.token })
    }
    return res
  },
  getAdminInfo: async () => {
    try {
      const res = await adminApi.getAdminInfo()
      if (res.data) {
        set({ adminInfo: res.data })
      }
    } catch {
      // 忽略
    }
  },
  logout: () => {
    removeToken('admin')
    set({ adminInfo: null, token: null })
  }
}))
