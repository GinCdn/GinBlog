import type { RegisterConfig } from '@/types'

/** 注册配置中生效的密码要求。 */
export interface PasswordRequirement {
  min: number
  max: number
  rule: number
  hint: string
}

function readNumber(config: RegisterConfig | undefined, snakeName: keyof RegisterConfig, camelName: keyof RegisterConfig, fallback: number): number {
  const value = config?.[snakeName] ?? config?.[camelName]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** 读取注册配置，并兼容历史下划线字段和当前驼峰字段。 */
export function getPasswordRequirement(config?: RegisterConfig): PasswordRequirement {
  const min = Math.max(1, readNumber(config, 'password_min_len', 'passwordMinLen', 6))
  const configuredMax = readNumber(config, 'password_max_len', 'passwordMaxLen', 20)
  const max = Math.max(min, configuredMax)
  const rule = readNumber(config, 'password_rule', 'passwordRule', 1)
  const hint = rule === 2
    ? `密码为 ${min}-${max} 位，需包含大小写字母和数字`
    : `密码为 ${min}-${max} 位，需包含字母和数字`
  return { min, max, rule, hint }
}

/** 返回前端表单可展示的动态密码校验提示。 */
export function getPasswordValidationMessage(value: string, requirement: PasswordRequirement): string {
  if (value.length < requirement.min || value.length > requirement.max) {
    return `密码长度应为 ${requirement.min}-${requirement.max} 位`
  }
  if (requirement.rule === 2) {
    if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) return requirement.hint
    return ''
  }
  if (!/[a-zA-Z]/.test(value) || !/\d/.test(value)) return requirement.hint
  return ''
}
