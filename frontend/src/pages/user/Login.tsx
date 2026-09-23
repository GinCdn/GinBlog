/**
 * 用户登录页
 * 提供账号密码登录、Canvas 图形验证码校验、记住密码功能
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Form, Input, Button, Checkbox, Card, message } from 'antd'
import { UserOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons'
import { useUserStore, useAppStore } from '@/store'
import type { LoginForm } from '@/types'

// 登录表单值（在 LoginForm 基础上增加验证码字段）
interface LoginValues extends LoginForm {
  code: string
}

// 验证码字符集（数字 + 小写字母）
const CAPTCHA_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz'

// 生成指定位数的随机验证码
function generateCaptchaCode(length = 4): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CAPTCHA_CHARS.charAt(Math.floor(Math.random() * CAPTCHA_CHARS.length))
  }
  return code
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useUserStore()
  const { siteConfig, loadSiteConfig } = useAppStore()
  const [form] = Form.useForm<LoginValues>()
  const [loading, setLoading] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 当前验证码答案，存于 ref 避免闭包过期
  const captchaAnswerRef = useRef('')

  // 绘制验证码到 canvas
  const drawCaptcha = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const width = canvas.width
    const height = canvas.height
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#f9f9f9'
    ctx.fillRect(0, 0, width, height)
    const code = generateCaptchaCode(4)
    captchaAnswerRef.current = code
    ctx.font = 'bold 22px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const charWidth = width / (code.length + 1)
    const colors = ['#333', '#555', '#222']
    for (let i = 0; i < code.length; i++) {
      ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)]
      const x = charWidth * (i + 1)
      const y = height / 2
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(((Math.random() * 16 - 8) * Math.PI) / 180)
      ctx.fillText(code[i], 0, 0)
      ctx.restore()
    }
    // 干扰线
    for (let i = 0; i < 2; i++) {
      ctx.strokeStyle = ['#ddd', '#eee'][Math.floor(Math.random() * 2)]
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(Math.random() * width, Math.random() * height)
      ctx.lineTo(Math.random() * width, Math.random() * height)
      ctx.stroke()
    }
    // 干扰点
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = '#eee'
      ctx.beginPath()
      ctx.arc(Math.random() * width, Math.random() * height, 1, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 组件挂载时加载站点配置并绘制验证码
  useEffect(() => {
    loadSiteConfig()
    drawCaptcha()
  }, [loadSiteConfig])

  // 登录提交
  const handleFinish = async (values: LoginValues) => {
    // 前端校验证码（不区分大小写）
    if (values.code.toLowerCase() !== captchaAnswerRef.current.toLowerCase()) {
      message.error('验证码错误，请重新输入')
      drawCaptcha()
      form.setFieldValue('code', '')
      return
    }
    setLoading(true)
    try {
      await login({
        username: values.username,
        password: values.password,
        remember: values.remember,
      })
      message.success('登录成功')
      // 优先跳转到来源页，否则进入个人中心
      const redirect = (location.state as { from?: string } | null)?.from
      navigate(redirect || '/user/console', { replace: true })
    } catch {
      // 错误信息已由请求拦截器统义提示，刷新验证码
      drawCaptcha()
      form.setFieldValue('code', '')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <div className="auth-header">
          {siteConfig?.logo ? <img className="auth-logo" src={siteConfig.logo} alt="网站标识" /> : null}
          <h1>用户登录</h1>
          <p>使用您的账号登录用户中心</p>
        </div>
        <Form form={form} onFinish={handleFinish} initialValues={{ remember: true }} size="large">
          <Form.Item
            name="username"
            rules={[
              { required: true, message: '请输入用户名、邮箱或手机号' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="请输入用户名、邮箱或手机号" autoComplete="username" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, max: 20, message: '密码长度 6-20 位' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
          </Form.Item>
          <Form.Item
            name="code"
            rules={[
              { required: true, message: '请输入验证码' },
              { len: 4, message: '验证码为 4 位' },
            ]}
          >
            <Input
              prefix={<SafetyOutlined />}
              placeholder="请输入验证码"
              suffix={
                <canvas
                  ref={canvasRef}
                  width={84}
                  height={32}
                  onClick={drawCaptcha}
                  title="点击刷新验证码"
                  style={{ cursor: 'pointer', borderRadius: 2, border: '1px solid #e6e6e6', display: 'block' }}
                />
              }
            />
          </Form.Item>
          <Form.Item name="remember" valuePropName="checked">
            <Checkbox>记住密码</Checkbox>
          </Form.Item>
          <Form.Item className="auth-submit-item">
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
          <div className="auth-switch">
            <Link to="/user/register">注册账号</Link>
            <span style={{ margin: '0 8px', color: '#ccc' }}>|</span>
            <Link to="/user/forgot">找回密码</Link>
          </div>
        </Form>
      </Card>
      <div className="auth-copyright">{siteConfig?.copyright || 'GinBlog'}</div>
    </div>
  )
}
