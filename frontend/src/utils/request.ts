/**
 * Axios 请求封装
 * 统一处理请求拦截、响应拦截、错误处理
 */
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { message } from 'antd'
import { getToken, removeToken } from './auth'
import type { Result } from '@/types'

const instance: AxiosInstance = axios.create({
  baseURL: '',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器：自动添加 Authorization header
instance.interceptors.request.use(
  (config) => {
    // 根据请求路径判断使用哪个角色的 token
    const isAdmin = config.url?.includes('/admin/')
    const role = isAdmin ? 'admin' : 'user'
    const token = getToken(role)

    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // URLSearchParams 与 FormData 由 axios 自动设置 Content-Type，
    // 若保留默认的 application/json 会导致表单参数无法被后端解析
    if (config.data instanceof URLSearchParams || config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }

    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器：统一错误处理
instance.interceptors.response.use(
  (response) => {
    const res = response.data as Result
    // 后端返回 code !== 200 表示业务错误
    if (res.code !== undefined && res.code !== 200) {
      message.error(res.msg || '请求失败')
      // 认证错误，清除 token 并跳转登录页
      const isLoginRequest = response.config.url === '/api/user/login' || response.config.url === '/api/admin/login'
      if (!isLoginRequest && (res.code === 401 || res.code === 40101 || res.code === 40102 || res.code === 40301)) {
        const isAdmin = window.location.pathname.includes('/admin/')
        removeToken(isAdmin ? 'admin' : 'user')
        if (isAdmin) {
          window.location.href = '/admin/login'
        } else {
          window.location.href = '/user/login'
        }
      }
      return Promise.reject(new Error(res.msg || '请求失败'))
    }
    return response
  },
  (error) => {
    if (error.response) {
      const status = error.response.status
      switch (status) {
        case 401:
          message.error('未登录或登录已过期')
          break
        case 403:
          message.error('无权限访问')
          break
        case 404:
          message.error('请求的资源不存在')
          break
        case 500:
          message.error('服务器内部错误')
          break
        default:
          message.error(error.response.data?.msg || `请求失败(${status})`)
      }
    } else if (error.message?.includes('timeout')) {
      message.error('请求超时，请稍后重试')
    } else {
      message.error('网络异常，请检查网络连接')
    }
    return Promise.reject(error)
  }
)

// 封装 request 函数
export function request<T = Result>(config: AxiosRequestConfig): Promise<T> {
  return instance(config).then((res) => res.data as T)
}

export default request
