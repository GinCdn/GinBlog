/**

 * 忘记密码页

 * 通过邮箱验证码重置登录密码

 */

import { useEffect, useMemo, useRef, useState } from 'react'

import { useNavigate, Link } from 'react-router-dom'

import { Form, Input, Button, Card, message } from 'antd'
import { MailOutlined, SafetyOutlined, LockOutlined } from '@ant-design/icons'
import { publicApi, userApi } from '@/api'
import { getGeetestValidate } from '@/composables/useGeetestCaptcha'
import { useAppStore } from '@/store'
import type { RegisterConfig } from '@/types'
import { getPasswordRequirement, getPasswordValidationMessage } from '@/utils/passwordRule'


// 重置密码表单值

interface ForgotFormValues {

  email: string

  code: string

  newPassword: string

  confirmPassword: string

}



// 邮箱格式正则

const EMAIL_REG = /^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/

// 发送验证码冷却时间（秒）

const CODE_COOLDOWN = 60



export default function Forgot() {
  const navigate = useNavigate()
  const { siteConfig, loadSiteConfig } = useAppStore()
  const [form] = Form.useForm<ForgotFormValues>()
  const [registerConfig, setRegisterConfig] = useState<RegisterConfig>()
  const passwordRequirement = useMemo(() => getPasswordRequirement(registerConfig), [registerConfig])

  const [loading, setLoading] = useState(false)

  const [sending, setSending] = useState(false)

  const [countdown, setCountdown] = useState(0)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)



  // 组件卸载时清理倒计时定时器
  useEffect(() => {
    void loadSiteConfig()
    void publicApi.getRegisterInfo().then((result) => { if (result.code === 200) setRegisterConfig(result.data) })
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [loadSiteConfig])


  // 发送邮箱验证码

  const handleSendCode = async () => {

    try {

      const { email } = await form.validateFields(['email'])

      setSending(true)

      await publicApi.sendCode({ email, ...await getGeetestValidate('email') })

      message.success('验证码已发送至邮箱')

      setCountdown(CODE_COOLDOWN)

      timerRef.current = setInterval(() => {

        setCountdown((c) => {

          if (c <= 1) {

            if (timerRef.current) clearInterval(timerRef.current)

            return 0

          }

          return c - 1

        })

      }, 1000)

    } catch {

      // 校验失败或发送失败

    } finally {

      setSending(false)

    }

  }



  // 提交重置密码：先校验证码，再修改密码

  const handleFinish = async (values: ForgotFormValues) => {

    setLoading(true)

    try {

      await userApi.updateEmailPassword({
        email: values.email,

        code: values.code,

        new_pwd: values.newPassword,

      })

      message.success('密码修改成功，即将跳转登录')

      navigate('/user/login')

    } catch {

      // 错误信息已由请求拦截器统义提示

    } finally {

      setLoading(false)

    }

  }



  return (

    <div className="auth-page">
      <Card className="auth-card">
        <div className="auth-header">
          {siteConfig?.logo ? <img className="auth-logo" src={siteConfig.logo} alt="网站标识" /> : null}
          <h1>找回密码</h1>
          <p>验证注册邮箱后重置登录密码</p>
        </div>
        <Form form={form} onFinish={handleFinish} size="large" layout="vertical">
          <Form.Item

            name="email"

            rules={[

              { required: true, message: '请输入邮箱' },

              { pattern: EMAIL_REG, message: '邮箱格式错误' },

            ]}

          >

            <Input prefix={<MailOutlined />} placeholder="请输入注册邮箱" autoComplete="off" />

          </Form.Item>

          <Form.Item name="code" rules={[{ required: true, message: '请输入邮箱验证码' }]}>

            <Input

              prefix={<SafetyOutlined />}

              placeholder="请输入邮箱验证码"

              addonAfter={

                <Button

                  type="link"

                  size="small"

                  disabled={countdown > 0 || sending}

                  loading={sending}

                  onClick={handleSendCode}

                  style={{ padding: 0 }}

                >

                  {countdown > 0 ? `${countdown}秒后重发` : '获取验证码'}

                </Button>

              }

            />

          </Form.Item>

          <Form.Item
            name="newPassword"
            extra={passwordRequirement.hint}
            rules={[
              { required: true, message: '请输入新密码' },
              { validator: (_, value) => { const error = getPasswordValidationMessage(value || '', passwordRequirement); return error ? Promise.reject(new Error(error)) : Promise.resolve() } },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder={passwordRequirement.hint} autoComplete="new-password" />
          </Form.Item>

          <Form.Item

            name="confirmPassword"

            dependencies={['newPassword']}

            rules={[

              { required: true, message: '请确认新密码' },

              ({ getFieldValue }) => ({

                validator(_, value) {

                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve()

                  return Promise.reject(new Error('两次输入的密码不一致'))

                },

              }),

            ]}

          >

            <Input.Password prefix={<LockOutlined />} placeholder="请再次输入新密码" />

          </Form.Item>

          <Form.Item className="auth-submit-item">
            <Button type="primary" htmlType="submit" loading={loading} block>

              确认修改

            </Button>

          </Form.Item>

          <div className="auth-switch">
            想起密码了？<Link to="/user/login">返回登录</Link>

          </div>

        </Form>

      </Card>
      <div className="auth-copyright">{siteConfig?.copyright || 'GinBlog'}</div>
    </div>
  )

}

