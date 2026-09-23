/**
 * 管理员登录页面
 * 提供用户名、密码登录及 Canvas 前端验证码校验
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Form, Input, Button, Checkbox, Card, message } from 'antd'
import { UserOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { useAdminStore, useAppStore } from '@/store'

// 验证码字符集（数字 + 小写字母）
const CAPTCHA_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz'

// 生成指定长度的随机验证码
function generateRandomCode(length = 4): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CAPTCHA_CHARS.charAt(Math.floor(Math.random() * CAPTCHA_CHARS.length))
  }
  return code
}

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login } = useAdminStore()
  const { siteConfig, loadSiteConfig } = useAppStore()

  const [loading, setLoading] = useState(false)
  // 验证码答案，存于 ref 避免重渲染
  const captchaAnswerRef = useRef('')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // 重定向地址，缺省跳转控制台
  const redirect = searchParams.get('redirect') || '/admin/console'

  useEffect(() => {
    loadSiteConfig()
  }, [loadSiteConfig])

  // 首次加载及配置变化时刷新页面标题
  useEffect(() => {
    if (siteConfig) {
      document.title = `${siteConfig.title || 'GinBlog'} - 管理员登录页`
    }
  }, [siteConfig])

  // 绘制 Canvas 验证码
  const drawCaptcha = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height

    // 清空画布并填充背景色
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#f9f9f9'
    ctx.fillRect(0, 0, width, height)

    // 生成新验证码
    captchaAnswerRef.current = generateRandomCode(4)

    // 逐字符绘制，带随机旋转与颜色
    ctx.font = 'bold 24px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const charWidth = width / (captchaAnswerRef.current.length + 1)
    const colors = ['#333', '#555', '#222', '#1a6dcc']
    for (let i = 0; i < captchaAnswerRef.current.length; i++) {
      ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)]
      const x = charWidth * (i + 1)
      const y = height / 2
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(((Math.random() * 16 - 8) * Math.PI) / 180)
      ctx.fillText(captchaAnswerRef.current[i], 0, 0)
      ctx.restore()
    }

    // 绘制干扰线
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = ['#ddd', '#ccc', '#eee'][Math.floor(Math.random() * 3)]
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(Math.random() * width, Math.random() * height)
      ctx.lineTo(Math.random() * width, Math.random() * height)
      ctx.stroke()
    }

    // 绘制干扰点
    for (let i = 0; i < 25; i++) {
      ctx.fillStyle = '#ddd'
      ctx.beginPath()
      ctx.arc(Math.random() * width, Math.random() * height, 1, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  useEffect(() => {
    drawCaptcha()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 点击画布刷新验证码
  const handleCaptchaClick = () => {
    drawCaptcha()
    message.success({ content: '验证码已刷新', duration: 0.5 })
  }

  // 提交登录
  const handleFinish = async (values: {
    username: string
    password: string
    code: string
    remember: boolean
  }) => {
    // 前端校验证码（忽略大小写）
    if (values.code.toLowerCase() !== captchaAnswerRef.current.toLowerCase()) {
      message.error('验证码错误，请重新输入')
      drawCaptcha()
      return
    }

    setLoading(true)
    try {
      const res = await login({ username: values.username, password: values.password, remember: values.remember })
      if (res.code === 200) {
        message.success('登录成功，正在跳转...')
        navigate(redirect, { replace: true })
      } else {
        message.error(res.msg || '登录失败')
        drawCaptcha()
      }
    } catch {
      drawCaptcha()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <div className="auth-header">
          {siteConfig?.logo ? <img className="auth-logo" src={siteConfig.logo} alt="网站标识" /> : null}
          <h1>管理员登录</h1>
          <p>登录后台管理系统</p>
        </div>

        <Form
          name="adminLogin"
          initialValues={{ remember: true }}
          onFinish={handleFinish}
          size="large"
        >
          <Form.Item
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, max: 20, message: '用户名长度为 3-20 个字符' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="请输入用户名" autoComplete="off" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, max: 20, message: '密码长度为 6-20 个字符' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
          </Form.Item>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Form.Item
              name="code"
              rules={[
                { required: true, message: '请输入验证码' },
                { len: 4, message: '验证码长度为 4 个字符' },
              ]}
              style={{ flex: 1, marginBottom: 0 }}
            >
              <Input
                prefix={<SafetyCertificateOutlined />}
                placeholder="请输入验证码"
                maxLength={4}
              />
            </Form.Item>
            <canvas
              ref={canvasRef}
              width={120}
              height={46}
              onClick={handleCaptchaClick}
              title="点击刷新验证码"
              style={{
                cursor: 'pointer',
                borderRadius: 4,
                border: '1px solid #d9d9d9',
              }}
            />
          </div>

          <Form.Item name="remember" valuePropName="checked" style={{ marginBottom: 16, marginTop: 16 }}>
            <Checkbox>记住密码</Checkbox>
          </Form.Item>

          <Form.Item className="auth-submit-item">
            <Button type="primary" htmlType="submit" block loading={loading}>
              登录
            </Button>
          </Form.Item>
          <div className="auth-switch"><Link to="/admin/forgot">找回管理员密码</Link></div>
        </Form>
      </Card>

      <div className="auth-copyright">{siteConfig?.copyright || 'GinBlog'}</div>
    </div>
  )
}
