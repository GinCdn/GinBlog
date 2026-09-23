/** 管理员找回密码页面，通过邮箱验证码重置管理员密码。 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, Form, Input, message } from 'antd'
import { LockOutlined, MailOutlined, SafetyOutlined } from '@ant-design/icons'
import { publicApi } from '@/api'
import { getGeetestValidate } from '@/composables/useGeetestCaptcha'
import { useAppStore } from '@/store'
import type { RegisterConfig } from '@/types'
import { getPasswordRequirement, getPasswordValidationMessage } from '@/utils/passwordRule'

interface ForgotValues {
  email: string
  code: string
  newPassword: string
  confirmPassword: string
}

const emailRule = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

export default function Forgot() {
  const navigate = useNavigate()
  const { siteConfig, loadSiteConfig } = useAppStore()
  const [form] = Form.useForm<ForgotValues>()
  const [registerConfig, setRegisterConfig] = useState<RegisterConfig>()
  const passwordRequirement = useMemo(() => getPasswordRequirement(registerConfig), [registerConfig])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    void loadSiteConfig()
    void publicApi.getRegisterInfo().then((result) => { if (result.code === 200) setRegisterConfig(result.data) })
    return () => { if (timerRef.current) window.clearInterval(timerRef.current) }
  }, [loadSiteConfig])

  const sendCode = async () => {
    try {
      const { email } = await form.validateFields(['email'])
      setSending(true)
      const result = await publicApi.sendCode({ email, ...await getGeetestValidate('email') })
      if (result.code !== 200) return message.error(result.msg || '验证码发送失败')
      message.success('验证码已发送至邮箱，请注意查收')
      setCountdown(60)
      timerRef.current = window.setInterval(() => setCountdown((value) => {
        if (value <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current)
          return 0
        }
        return value - 1
      }), 1000)
    } catch {
      // 表单校验和请求错误由统一提示处理。
    } finally {
      setSending(false)
    }
  }

  const submit = async () => {
    message.info('当前后端未提供管理员邮箱找回接口，请登录后在管理员账户页面修改密码')
  }

  return <div className="auth-page">
    <Card className="auth-card">
      <div className="auth-header">
        {siteConfig?.logo ? <img className="auth-logo" src={siteConfig.logo} alt="网站标识" /> : null}
        <h1>找回管理员密码</h1>
        <p>验证管理员绑定邮箱后重置密码</p>
      </div>
      <Form form={form} onFinish={submit} size="large" layout="vertical">
        <Form.Item name="email" label="管理员邮箱" rules={[{ required: true, message: '请输入管理员邮箱' }, { pattern: emailRule, message: '请输入正确的邮箱格式' }]}>
          <Input prefix={<MailOutlined />} placeholder="请输入管理员绑定邮箱" autoComplete="email" />
        </Form.Item>
        <Form.Item name="code" label="邮箱验证码" rules={[{ required: true, message: '请输入邮箱验证码' }, { len: 6, message: '验证码为 6 位' }]}>
          <Input prefix={<SafetyOutlined />} placeholder="请输入邮箱验证码" addonAfter={<Button type="link" size="small" disabled={countdown > 0 || sending} loading={sending} onClick={sendCode} style={{ padding: 0 }}>{countdown > 0 ? `${countdown} 秒后重发` : '获取验证码'}</Button>} />
        </Form.Item>
        <Form.Item name="newPassword" label="新密码" extra={passwordRequirement.hint} rules={[{ required: true, message: '请输入新密码' }, { validator: (_, value) => { const error = getPasswordValidationMessage(value || '', passwordRequirement); return error ? Promise.reject(new Error(error)) : Promise.resolve() } }]}>
          <Input.Password prefix={<LockOutlined />} placeholder={passwordRequirement.hint} autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="confirmPassword" label="确认新密码" dependencies={['newPassword']} rules={[{ required: true, message: '请再次输入新密码' }, ({ getFieldValue }) => ({ validator: (_, value) => !value || value === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('两次输入的密码不一致')) })]}>
          <Input.Password prefix={<LockOutlined />} placeholder="请再次输入新密码" autoComplete="new-password" />
        </Form.Item>
        <Form.Item className="auth-submit-item"><Button type="primary" htmlType="submit" loading={loading} block>确认重置</Button></Form.Item>
        <div className="auth-switch">想起密码了？<Link to="/admin/login">返回管理员登录</Link></div>
      </Form>
    </Card>
    <div className="auth-copyright">{siteConfig?.copyright || 'GinBlog'}</div>
  </div>
}
