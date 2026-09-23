/** 用户注册页面，根据后台注册配置动态展示字段和校验规则。 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, Form, Input, Radio, Row, Col, Space, message } from 'antd'
import { LockOutlined, MailOutlined, PhoneOutlined, QqOutlined, SafetyOutlined, UserOutlined } from '@ant-design/icons'
import { publicApi, userApi } from '@/api'
import { getGeetestValidate } from '@/composables/useGeetestCaptcha'
import { useAppStore } from '@/store'
import type { RegisterConfig } from '@/types'

interface RegisterValues { username?: string; password: string; confirmPassword: string; email?: string; code?: string; phone?: string; qq?: string; sex: 1 | 2 }
const EMAIL_REG = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const PHONE_REG = /^\d{11}$/
const QQ_REG = /^\d{5,11}$/
type NormalizedRegisterConfig = Required<Pick<RegisterConfig, 'username_min_len' | 'username_max_len' | 'password_min_len' | 'password_max_len' | 'password_rule' | 'verify_email' | 'verify_phone' | 'required_username' | 'required_phone' | 'required_email' | 'required_qq' | 'status'>>
const DEFAULT_CONFIG: NormalizedRegisterConfig = { username_min_len: 5, username_max_len: 20, password_min_len: 6, password_max_len: 20, password_rule: 1, verify_email: true, verify_phone: false, required_username: true, required_phone: false, required_email: true, required_qq: true, status: true }

function normalizeConfig(data?: RegisterConfig): NormalizedRegisterConfig {
  const value = data as Record<string, unknown> | undefined
  const bool = (snake: string, camel: string, fallback: boolean) => typeof value?.[snake] === 'boolean' ? value[snake] as boolean : typeof value?.[camel] === 'boolean' ? value[camel] as boolean : fallback
  const number = (snake: string, camel: string, fallback: number) => typeof (value?.[snake] ?? value?.[camel]) === 'number' ? (value?.[snake] ?? value?.[camel]) as number : fallback
  return { username_min_len: number('username_min_len', 'usernameMinLen', 5), username_max_len: number('username_max_len', 'usernameMaxLen', 20), password_min_len: number('password_min_len', 'passwordMinLen', 6), password_max_len: number('password_max_len', 'passwordMaxLen', 20), password_rule: number('password_rule', 'passwordRule', 1), verify_email: bool('verify_email', 'verifyEmail', true), verify_phone: bool('verify_phone', 'verifyPhone', false), required_username: bool('required_username', 'requiredUsername', true), required_phone: bool('required_phone', 'requiredPhone', false), required_email: bool('required_email', 'requiredEmail', true), required_qq: bool('required_qq', 'requiredQQ', true), status: bool('status', 'status', true) }
}

export default function Register() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { siteConfig, loadSiteConfig } = useAppStore()
  const [form] = Form.useForm<RegisterValues>()
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const timerRef = useRef<number | null>(null)
  const showEmail = config.required_email || config.verify_email
  const showCode = config.verify_email
  const passwordHint = config.password_rule === 2 ? `密码为 ${config.password_min_len}-${config.password_max_len} 位，须包含大小写字母和数字` : `密码为 ${config.password_min_len}-${config.password_max_len} 位，须包含字母和数字`
  useEffect(() => {
    void loadSiteConfig()
    void publicApi.getRegisterInfo().then((res) => { if (res.code === 200) setConfig(normalizeConfig(res.data)) })
    return () => { if (timerRef.current) window.clearInterval(timerRef.current) }
  }, [loadSiteConfig])
  const formRules = useMemo(() => ({
    username: config.required_username ? [{ required: true, message: '请输入用户名' }, { min: config.username_min_len, max: config.username_max_len, message: `用户名长度为 ${config.username_min_len}-${config.username_max_len} 位` }, { pattern: /^[a-zA-Z0-9_]+$/, message: '用户名仅支持字母、数字和下划线' }] : [],
    password: [{ required: true, message: '请设置登录密码' }, { min: config.password_min_len, max: config.password_max_len, message: passwordHint }, { pattern: config.password_rule === 2 ? /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/ : /^(?=.*[a-zA-Z])(?=.*\d).+$/, message: passwordHint }],
    email: showEmail ? [{ required: true, message: '请输入邮箱地址' }, { pattern: EMAIL_REG, message: '请输入正确的邮箱格式' }] : [],
    phone: config.required_phone ? [{ required: true, message: '请输入手机号' }, { pattern: PHONE_REG, message: '手机号必须为 11 位数字' }] : [{ pattern: PHONE_REG, message: '手机号必须为 11 位数字' }],
    qq: config.required_qq ? [{ required: true, message: '请输入 QQ 号' }, { pattern: QQ_REG, message: 'QQ 号必须为 5-11 位数字' }] : [{ pattern: QQ_REG, message: 'QQ 号必须为 5-11 位数字' }],
  }), [config, passwordHint, showEmail])
  const handleSendCode = async () => { try { const { email } = await form.validateFields(['email']); if (!email) return; setSending(true); const res = await publicApi.sendCode({ email, ...await getGeetestValidate('email') }); if (res.code !== 200) return message.error(res.msg || '验证码发送失败'); message.success('验证码已发送至邮箱，请注意查收'); setCountdown(60); timerRef.current = window.setInterval(() => setCountdown((value) => { if (value <= 1) { if (timerRef.current) window.clearInterval(timerRef.current); return 0 }; return value - 1 }), 1000) } catch (error) { if (error instanceof Error) message.error(error.message); /* 表单校验提示由组件展示 */ } finally { setSending(false) } }
  const handleFinish = async (values: RegisterValues) => { if (!config.status) return message.warning('当前暂未开放用户注册'); setLoading(true); try { const res = await userApi.register({ username: values.username || '', password: values.password, email: values.email || '', code: values.code || '', phone: values.phone || '', qq: values.qq || '', sex: values.sex, invite_code: searchParams.get('invite_code') || '' }); if (res.code !== 200) return message.error(res.msg || '注册失败，请稍后重试'); message.success('注册成功，即将跳转登录'); navigate('/user/login') } finally { setLoading(false) } }
  return <div className="auth-page">
    <Card className="auth-card">
      <div className="auth-header">
        {siteConfig?.logo ? <img className="auth-logo" src={siteConfig.logo} alt="网站标识" /> : null}
        <h1>用户注册</h1>
        <p>创建账号后即可使用用户中心服务</p>
      </div>
      <Form form={form} onFinish={handleFinish} initialValues={{ sex: 1 }} size="large" layout="vertical">
        {config.required_username && <Form.Item name="username" label="用户名" rules={formRules.username}><Input prefix={<UserOutlined />} placeholder={`用户名（${config.username_min_len}-${config.username_max_len} 位）`} autoComplete="username" /></Form.Item>}
        <Form.Item name="password" label="登录密码" rules={formRules.password}><Input.Password prefix={<LockOutlined />} placeholder={passwordHint} autoComplete="new-password" /></Form.Item>
        <Form.Item name="confirmPassword" label="确认密码" dependencies={['password']} rules={[{ required: true, message: '请再次输入密码' }, ({ getFieldValue }) => ({ validator: (_, value) => !value || value === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error('两次输入的密码不一致')) })]}><Input.Password prefix={<LockOutlined />} placeholder="请再次输入密码" autoComplete="new-password" /></Form.Item>
        <Row gutter={12}>
          {config.required_qq && <Col xs={24} sm={12}><Form.Item name="qq" label="QQ 号" rules={formRules.qq}><Input prefix={<QqOutlined />} placeholder="请输入 QQ 号" /></Form.Item></Col>}
          <Col xs={24} sm={config.required_qq ? 12 : 24}><Form.Item name="sex" label="性别" rules={[{ required: true, message: '请选择性别' }]}><Radio.Group className="auth-sex-group"><Radio.Button value={1}>男</Radio.Button><Radio.Button value={2}>女</Radio.Button></Radio.Group></Form.Item></Col>
        </Row>
        {showEmail && <Form.Item name="email" label="邮箱地址" rules={formRules.email}><Input prefix={<MailOutlined />} placeholder="请输入邮箱地址" autoComplete="email" /></Form.Item>}
        {config.required_phone && <Form.Item name="phone" label="手机号码" rules={formRules.phone}><Input prefix={<PhoneOutlined />} placeholder="请输入手机号" autoComplete="tel" /></Form.Item>}
        {showCode && <Form.Item name="code" label="邮箱验证码" rules={[{ required: true, message: '请输入邮箱验证码' }]}><Space.Compact block><Input prefix={<SafetyOutlined />} placeholder="请输入邮箱验证码" /><Button className="auth-code-button" disabled={countdown > 0 || sending} loading={sending} onClick={handleSendCode}>{countdown > 0 ? `${countdown} 秒后重发` : '获取验证码'}</Button></Space.Compact></Form.Item>}
        <Form.Item className="auth-submit-item"><Button type="primary" htmlType="submit" loading={loading} disabled={!config.status} block>{config.status ? '立即注册' : '注册已关闭'}</Button></Form.Item>
        <div className="auth-switch">已有账号？<Link to="/user/login">用户登录</Link></div>
      </Form>
    </Card>
    <div className="auth-copyright">{siteConfig?.copyright || 'GinBlog'}</div>
  </div>
}
