import { formatChinaTime } from '@/utils/time'

/** 用户中心接口数据兼容处理。 */
export type UserRecord = Record<string, any>

/** 解开历史接口中可能存在的一层 data 包装。 */
export function unwrapUserData(value: unknown): UserRecord {
  const data = (value || {}) as UserRecord
  return data.data && typeof data.data === 'object' && !Array.isArray(data.data) ? data.data as UserRecord : data
}

/** 兼容分页接口的两种返回结构。 */
export function parseUserPage(value: unknown): { list: UserRecord[]; total: number } {
  const data = unwrapUserData(value)
  return { list: Array.isArray(data.list) ? data.list : [], total: Number(data.pagination?.total ?? data.total ?? 0) }
}

/** 读取驼峰和下划线两种字段名。 */
export function readUserField<T = unknown>(row: UserRecord | null | undefined, camel: string, snake?: string): T | undefined {
  if (!row) return undefined
  return (row[camel] ?? row[snake || camel]) as T | undefined
}

/** 统一展示后端时间字段。 */
export function formatUserTime(value: unknown): string {
  if (!value) return '-'
  return formatChinaTime(value)
}
