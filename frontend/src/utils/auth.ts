/**
 * 认证工具函数，负责管理管理员和用户令牌及用户名的本地存储。
 */

type Role = 'admin' | 'user'

const storageKeys = {
  adminToken: 'adminToken',
  adminUsername: 'adminUsername',
  userToken: 'userToken',
  userUsername: 'userUsername'
}

/**
 * 规范化本地令牌，兼容旧版本误存的 Bearer 前缀和首尾引号。
 */
function normalizeToken(token: string | null): string | null {
  if (!token) return null
  let normalized = token.trim()
  if ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
    normalized = normalized.slice(1, -1).trim()
  }
  if (/^Bearer\s+/i.test(normalized)) {
    normalized = normalized.replace(/^Bearer\s+/i, '').trim()
  }
  normalized = normalized.replace(/[\r\n\t\s]/g, '')
  return normalized || null
}

/**
 * 获取指定角色的令牌，并在读取旧数据时自动完成兼容性修复。
 */
export function getToken(role: Role): string | null {
  const key = role === 'admin' ? storageKeys.adminToken : storageKeys.userToken
  const stored = localStorage.getItem(key)
  const normalized = normalizeToken(stored)
  if (normalized && normalized !== stored) {
    localStorage.setItem(key, normalized)
  }
  return normalized
}

/**
 * 保存指定角色的令牌，确保本地只保存纯令牌内容。
 */
export function setToken(role: Role, token: string): void {
  const key = role === 'admin' ? storageKeys.adminToken : storageKeys.userToken
  const normalized = normalizeToken(token)
  if (normalized) {
    localStorage.setItem(key, normalized)
  } else {
    localStorage.removeItem(key)
  }
}

/**
 * 删除指定角色的认证令牌和关联用户名，避免失效令牌清除后仍显示已登录。
 */
export function removeToken(role: Role): void {
  const tokenKey = role === 'admin' ? storageKeys.adminToken : storageKeys.userToken
  const usernameKey = role === 'admin' ? storageKeys.adminUsername : storageKeys.userUsername
  localStorage.removeItem(tokenKey)
  localStorage.removeItem(usernameKey)
}

/**
 * 获取指定角色的用户名。
 */
export function getUsername(role: Role): string | null {
  const key = role === 'admin' ? storageKeys.adminUsername : storageKeys.userUsername
  return localStorage.getItem(key)
}

/**
 * 保存指定角色的用户名。
 */
export function setUsername(role: Role, username: string): void {
  const key = role === 'admin' ? storageKeys.adminUsername : storageKeys.userUsername
  localStorage.setItem(key, username)
}

/**
 * 判断指定角色是否已完成认证。
 */
export function isAuthenticated(role: Role): boolean {
  return !!getToken(role)
}