import request from '@/utils/request'
import type { Result } from '@/types'

interface AntiBrushPublicConfig {
  captcha_id?: string
  captchaId?: string
  email_anti_brush?: boolean
  emailAntiBrush?: boolean
  sms_anti_brush?: boolean
  smsAntiBrush?: boolean
}

export interface GeetestValidateResult {
  lot_number: string
  captcha_output: string
  pass_token: string
  gen_time: string
}

interface GeetestInstance {
  onSuccess(callback: () => void): GeetestInstance
  onError?(callback: (error?: unknown) => void): GeetestInstance
  onReady?(callback: () => void): GeetestInstance
  onClose?(callback: () => void): GeetestInstance
  showCaptcha?: () => void
  getValidate(): GeetestValidateResult
}

declare global {
  interface Window {
    initGeetest4?: (options: { captchaId: string; product: string; language?: string }, callback: (captcha: GeetestInstance) => void) => void
    __geetest4Loading?: Promise<void>
  }
}

async function loadGeetestScript(): Promise<void> {
  if (window.initGeetest4) return
  if (window.__geetest4Loading) return window.__geetest4Loading

  window.__geetest4Loading = new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      timer = undefined
      reject(new Error('极验验证组件加载超时，请检查网络连接'))
    }, 15000)
    const finish = (error?: Error) => {
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      if (error) reject(error)
      else resolve()
    }

    const existing = document.querySelector('script[data-geetest-v4]') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => finish(), { once: true })
      existing.addEventListener('error', () => finish(new Error('极验验证组件加载失败')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://static.geetest.com/v4/gt4.js'
    script.async = true
    script.dataset.geetestV4 = 'true'
    script.onload = () => finish()
    script.onerror = () => finish(new Error('极验验证组件加载失败'))
    document.head.appendChild(script)
  })

  try {
    await window.__geetest4Loading
  } catch (error) {
    window.__geetest4Loading = undefined
    throw error
  }
}

// 获取指定验证码发送场景所需的极验结果，关闭防刷时返回空对象保持原有请求兼容。
export async function getGeetestValidate(scene: 'email' | 'sms'): Promise<Partial<GeetestValidateResult>> {
  const response = await request<Result<AntiBrushPublicConfig>>({ url: '/api/anti-brush/config', method: 'GET' })
  const config = response.data || {}
  const enabled = scene === 'email'
    ? Boolean(config.email_anti_brush ?? config.emailAntiBrush)
    : Boolean(config.sms_anti_brush ?? config.smsAntiBrush)
  if (!enabled) return {}

  const captchaId = String(config.captcha_id ?? config.captchaId ?? '')
  if (!captchaId) throw new Error('管理员尚未完整配置极验行为验证')
  await loadGeetestScript()
  if (!window.initGeetest4) throw new Error('极验验证组件加载失败')

  return new Promise((resolve, reject) => {
    let settled = false
    const timer = window.setTimeout(() => finishReject(new Error('极验验证组件初始化超时，请检查CaptchaID或网络连接')), 15000)
    const finishResolve = (validate: GeetestValidateResult) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve(validate)
    }
    const finishReject = (error: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      reject(error)
    }

    try {
      window.initGeetest4!({ captchaId, product: 'bind', language: 'zho' }, (captcha) => {
        captcha.onSuccess(() => {
          const validate = captcha.getValidate()
          if (!validate?.lot_number || !validate.captcha_output || !validate.pass_token || !validate.gen_time) {
            finishReject(new Error('行为验证结果不完整，请重试'))
            return
          }
          finishResolve(validate)
        })
        captcha.onError?.(() => finishReject(new Error('行为验证未通过，请重试')))
        captcha.onClose?.(() => finishReject(new Error('已取消行为验证')))
        const showCaptcha = () => {
          if (captcha.showCaptcha) {
            captcha.showCaptcha()
            return
          }
          finishReject(new Error('验证组件未提供显示方法'))
        }
        if (captcha.onReady) captcha.onReady(showCaptcha)
        else showCaptcha()
      })
    } catch (error) {
      finishReject(error instanceof Error ? error : new Error('极验验证组件初始化失败'))
    }
  })
}