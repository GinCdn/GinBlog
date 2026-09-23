import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar, Button, Card, Col, Form, Input, Modal, Radio, Row, Space, Tag, message } from 'antd'
import { CalendarOutlined, EditOutlined, LockOutlined, MailOutlined, PhoneOutlined, QqOutlined, ReloadOutlined, SafetyOutlined, UserOutlined } from '@ant-design/icons'
import { publicApi, userApi } from '@/api'
import { getGeetestValidate, type GeetestValidateResult } from '@/composables/useGeetestCaptcha'
import { useUserStore } from '@/store'
import type { RegisterConfig } from '@/types'
import { getQQAvatarUrl } from '@/utils/avatar'
import { getPasswordRequirement, getPasswordValidationMessage } from '@/utils/passwordRule'

const EMAIL_REG = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const PHONE_REG = /^\d{11}$/
const QQ_REG = /^\d{5,11}$/
const roleFallback: Record<string, string> = { default: '普通用户', Level1: '一级代理', Level2: '二级代理', Level3: '三级代理', Level4: '顶级代理' }


// VerifyCodeButton 为个人资料修改操作发送当前邮箱验证码。
// 邮件防刷开启时，必须先完成极验行为验证，后端也会对同一凭证进行二次校验。
function VerifyCodeButton({ email }: { email?: string }) {
  const [sending, setSending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current) }, [])

  const send = async () => {
    if (!email || !EMAIL_REG.test(email)) { message.warning('请先确认当前邮箱地址'); return }
    setSending(true)

    let geetestValidate: Partial<GeetestValidateResult> = {}
    try {
      geetestValidate = await getGeetestValidate('email')
    } catch (error) {
      // 极验加载、取消或校验失败时不发送邮件，避免用户误以为验证码已经发出。
      message.error(error instanceof Error ? error.message : '行为验证未完成，请重试')
      setSending(false)
      return
    }

    try {
      const result = await publicApi.sendCode({ email, ...geetestValidate })
      if (result.code !== 200) { message.error(result.msg || '验证码发送失败'); return }
      message.success('验证码已发送至当前邮箱，请注意查收')
      setCountdown(60)
      timer.current = window.setInterval(() => setCountdown((value) => {
        if (value <= 1) { if (timer.current) window.clearInterval(timer.current); return 0 }
        return value - 1
      }), 1000)
    } catch {
      // 请求封装已统一展示接口、网络与服务器错误，此处只阻止未处理的异步异常。
    } finally {
      setSending(false)
    }
  }

  return <Button onClick={() => void send()} disabled={sending || countdown > 0} loading={sending}>{countdown ? `${countdown} 秒后重发` : '获取验证码'}</Button>
}

type BindingKey = 'nickname' | 'phone' | 'email' | 'qq' | 'sex' | 'password'

export default function UserInfo() {
  const { userInfo, getUserInfo, logout } = useUserStore()
  const [registerConfig, setRegisterConfig] = useState<RegisterConfig>()
  const [roles, setRoles] = useState<any[]>([])
  const [active, setActive] = useState<BindingKey | null>(null)
  const [passwordForm] = Form.useForm()
  const [emailForm] = Form.useForm()
  const [bindingForm] = Form.useForm()
  const roleLevel = String(userInfo?.roleLevel || userInfo?.role_level || 'default')
  const roleName = roles.find((item) => String(item.roleLevel ?? item.role_level) === roleLevel)?.roleName || roleFallback[roleLevel] || roleLevel
  const passwordRequirement = useMemo(() => getPasswordRequirement(registerConfig), [registerConfig])
  const avatar = getQQAvatarUrl(userInfo?.qq)

  useEffect(() => {
    void getUserInfo()
    void publicApi.getRegisterInfo().then((res) => { if (res.code === 200) setRegisterConfig(res.data) })
    void userApi.getRoleDiscounts({ page: 1, page_size: 100 }).then((res) => {
      const data: any = res.data
      setRoles(data?.data?.list || data?.list || data || [])
    })
  }, [getUserInfo])

  const submitPassword = async () => {
    const values = await passwordForm.validateFields()
    const result = await userApi.updatePassword({ username: userInfo?.username || '', old_pwd: values.old_pwd, new_pwd: values.new_pwd })
    if (result.code !== 200) { message.error(result.msg || '密码修改失败'); return }
    message.success('密码修改成功，请重新登录'); passwordForm.resetFields(); setActive(null); logout()
  }
  const submitEmail = async () => {
    const values = await emailForm.validateFields()
    if (values.new_email === userInfo?.email) { message.warning('新邮箱不能与当前邮箱相同'); return }
    const result = await userApi.updateEmail({ email: userInfo?.email || '', code: values.code, new_email: values.new_email })
    if (result.code !== 200) { message.error(result.msg || '邮箱修改失败'); return }
    message.success('邮箱修改成功'); emailForm.resetFields(); setActive(null); await getUserInfo()
  }
  const submitNickname = async () => {
    const values = await bindingForm.validateFields()
    const result = await userApi.updateUserInfo({ nick_name: values.nickname })
    if (result.code !== 200) { message.error(result.msg || '昵称修改失败'); return }
    message.success('昵称修改成功')
    bindingForm.resetFields()
    setActive(null)
    await getUserInfo()
  }
  const submitBinding = async () => {
    const values = await bindingForm.validateFields()
    const field = active === 'sex' ? { sex: values.sex } : { [active as string]: values.value }
    const result = await userApi.updateUserInfo(field)
    if (result.code !== 200) { message.error(result.msg || '修改失败'); return }
    message.success('修改成功'); bindingForm.resetFields(); setActive(null); await getUserInfo()
  }
  const bindingItems = useMemo(() => [
    { key: 'nickname' as const, icon: <UserOutlined />, label: '昵称', value: userInfo?.nickName ? `已设置：${userInfo.nickName}` : '未设置', color: '#13c2c2' },
    { key: 'phone' as const, icon: <PhoneOutlined />, label: '密保手机', value: userInfo?.phone ? `已绑定：${userInfo.phone}` : '未绑定', color: '#52c41a' },
    { key: 'email' as const, icon: <MailOutlined />, label: '密保邮箱', value: userInfo?.email ? `已绑定：${userInfo.email}` : '未绑定', color: '#1677ff' },
    { key: 'qq' as const, icon: <QqOutlined />, label: '绑定 QQ', value: userInfo?.qq ? `已绑定：${userInfo.qq}` : '未绑定', color: '#722ed1' },
    { key: 'sex' as const, icon: <UserOutlined />, label: '性别', value: userInfo?.sex === 1 ? '男' : userInfo?.sex === 2 ? '女' : '未设置', color: '#fa8c16' },
    { key: 'password' as const, icon: <LockOutlined />, label: '登录密码', value: '已设置', color: '#f5222d' },
  ], [userInfo])

  return <div className="user-page profile-page"><h2>个人资料</h2><Card className="user-panel profile-card"><Row gutter={[32, 24]}><Col xs={24} md={8} lg={7}><div className="profile-summary"><Avatar size={112} src={avatar} icon={<UserOutlined />} /><h3>{userInfo?.nickName || userInfo?.username || '用户'}</h3><Tag color="blue">{roleName}</Tag><div className="profile-meta"><span><UserOutlined /> 用户名</span><strong>{userInfo?.username || '-'}</strong><span><CalendarOutlined /> 注册时间</span><strong>{userInfo?.createTime || userInfo?.create_time || '-'}</strong><span><ReloadOutlined /> 最后更新</span><strong>{userInfo?.updateTime || userInfo?.update_time || '-'}</strong></div></div></Col><Col xs={24} md={16} lg={17}><div className="profile-details"><div className="profile-section-title">基本信息</div><div className="binding-list">{bindingItems.map((item) => <div className="binding-item" key={item.key}><div className="binding-icon" style={{ color: item.color }}>{item.icon}</div><div className="binding-content"><strong>{item.label}</strong><span>{item.value}</span></div><Button type="link" icon={<EditOutlined />} onClick={() => setActive(item.key)}>修改</Button></div>)}</div></div></Col></Row></Card>
    <Modal title="修改密码" open={active === 'password'} onCancel={() => setActive(null)} onOk={() => void submitPassword()} okText="确认修改" destroyOnHidden><Form form={passwordForm} layout="vertical"><Form.Item name="old_pwd" label="原密码" rules={[{ required: true, message: '请输入原密码' }]}><Input.Password prefix={<LockOutlined />} /></Form.Item><Form.Item name="new_pwd" label="新密码" extra={passwordRequirement.hint} rules={[{ required: true, message: '请输入新密码' }, { validator: (_, value) => { const error = getPasswordValidationMessage(value || '', passwordRequirement); return error ? Promise.reject(new Error(error)) : Promise.resolve() } }]}><Input.Password prefix={<LockOutlined />} placeholder={passwordRequirement.hint} autoComplete="new-password" /></Form.Item><Form.Item name="confirm_pwd" label="确认新密码" dependencies={['new_pwd']} rules={[{ required: true, message: '请再次输入新密码' }, ({ getFieldValue }) => ({ validator: (_, value) => value === getFieldValue('new_pwd') ? Promise.resolve() : Promise.reject(new Error('两次输入的密码不一致')) })]}><Input.Password prefix={<LockOutlined />} /></Form.Item></Form></Modal>
    <Modal title="修改昵称" open={active === 'nickname'} onCancel={() => setActive(null)} onOk={() => void submitNickname()} okText="确认修改" destroyOnHidden><Form form={bindingForm} layout="vertical"><Form.Item name="nickname" label="昵称" initialValue={userInfo?.nickName} rules={[{ required: true, message: '请输入昵称' }, { max: 32, message: '昵称不能超过32个字符' }]}><Input prefix={<UserOutlined />} placeholder="请输入昵称" /></Form.Item></Form></Modal>
    <Modal title="修改邮箱" open={active === 'email'} onCancel={() => setActive(null)} onOk={() => void submitEmail()} okText="确认修改" destroyOnHidden><Form form={emailForm} layout="vertical"><Form.Item name="code" label="验证码" rules={[{ required: true, message: '请输入验证码' }]}><Space.Compact block><Input prefix={<SafetyOutlined />} /><VerifyCodeButton email={userInfo?.email} /></Space.Compact></Form.Item><Form.Item name="new_email" label="新邮箱" rules={[{ required: true, message: '请输入新邮箱' }, { pattern: EMAIL_REG, message: '邮箱格式错误' }]}><Input prefix={<MailOutlined />} /></Form.Item></Form></Modal>
    <Modal title={`修改${active === 'phone' ? '手机号' : active === 'qq' ? 'QQ' : '性别'}`} open={active === 'phone' || active === 'qq' || active === 'sex'} onCancel={() => setActive(null)} onOk={() => void submitBinding()} okText="确认修改" destroyOnHidden><Form form={bindingForm} layout="vertical"><Form.Item name="code" label="邮箱验证码" rules={[{ required: true, message: '请输入邮箱验证码' }]}><Space.Compact block><Input prefix={<SafetyOutlined />} /><VerifyCodeButton email={userInfo?.email} /></Space.Compact></Form.Item>{active === 'sex' ? <Form.Item name="sex" label="性别" initialValue={userInfo?.sex || 1}><Radio.Group><Radio value={1}>男</Radio><Radio value={2}>女</Radio></Radio.Group></Form.Item> : <Form.Item name="value" label={active === 'phone' ? '新手机号' : '新 QQ'} rules={[{ required: true, message: '请输入内容' }, { pattern: active === 'phone' ? PHONE_REG : QQ_REG, message: active === 'phone' ? '手机号必须为 11 位数字' : 'QQ 号必须为 5-11 位数字' }]}><Input prefix={active === 'phone' ? <PhoneOutlined /> : <QqOutlined />} /></Form.Item>}</Form></Modal></div>
}
