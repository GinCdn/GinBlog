import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, Descriptions, Form, Image, Input, message, Spin, Steps } from 'antd'
import { CheckCircleFilled, LinkOutlined } from '@ant-design/icons'
import { userApi } from '@/api'
import { useUserStore } from '@/store'

interface RealNameInfo {
  real_name?: string
  id_card?: string
  account?: string
  channel?: string
  provider_type?: string
  verify_status?: boolean
  verify_msg?: string
  create_time?: string
  update_time?: string
  auth_url?: string
  alipay_auth_url?: string
}

const POLL_INTERVAL = 2000
const POLL_LIMIT = 60000

/** 用户实名认证页，发起认证后等待认证服务返回最终结果。 */
export default function RealName() {
  const [searchParams] = useSearchParams()
  const user = useUserStore((state) => state.userInfo)
  const refreshUser = useUserStore((state) => state.getUserInfo)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [info, setInfo] = useState<RealNameInfo | null>(null)
  const [pendingUrl, setPendingUrl] = useState('')
  const callbackStatus = searchParams.get('realname_status')
  const callbackTitle = searchParams.get('title') || (callbackStatus === 'success' ? '实名认证成功' : '实名认证未通过')
  const callbackMessage = searchParams.get('message') || ''
  const [form] = Form.useForm()
  const pollStartedAt = useRef(0)

  /** 加载当前实名信息，静默模式用于轮询认证结果。 */
  const loadInfo = useCallback(async (showError = true) => {
    try {
      const result = await userApi.getRealNameInfo()
      if (result.code !== 200) throw new Error(result.msg || '实名认证信息加载失败')
      const nextInfo = (result.data || {}) as RealNameInfo
      setInfo(nextInfo)
      return nextInfo
    } catch (error) {
      if (showError) message.error(error instanceof Error ? error.message : '实名认证信息加载失败')
      return null
    }
  }, [])

  useEffect(() => {
    if (!user) return
    loadInfo().finally(() => setLoading(false))
  }, [user, loadInfo])

  /** 跳转认证页面后定时查询认证结果，超时后提示用户稍后查询。 */
  useEffect(() => {
    if (!pendingUrl || info?.verify_status) return
    let stopped = false
    setChecking(true)
    setTimedOut(false)
    pollStartedAt.current = Date.now()

    let timer: number | undefined
    const stopPolling = () => {
      if (timer !== undefined) window.clearInterval(timer)
      setChecking(false)
    }

    const check = async () => {
      const nextInfo = await loadInfo(false)
      if (stopped) return
      if (nextInfo?.verify_status) {
        setPendingUrl('')
        stopPolling()
        message.success('实名认证成功')
        await refreshUser()
        return
      }
      if (Date.now() - pollStartedAt.current >= POLL_LIMIT) {
        stopPolling()
        setTimedOut(true)
      }
    }

    void check()
    timer = window.setInterval(() => void check(), POLL_INTERVAL)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [pendingUrl, info?.verify_status, loadInfo, refreshUser])

  /** 在新窗口打开认证服务返回的官方认证地址。 */
  const openAuthPage = () => {
    if (pendingUrl) window.open(pendingUrl, '_blank', 'noopener,noreferrer')
  }

  const qrCodeUrl = pendingUrl ? `/api/qrcode/alipay?url=${encodeURIComponent(pendingUrl)}` : ''

  if (loading) return <div className="user-page"><h2>实名认证</h2><Card className="user-panel"><Spin /></Card></div>

  const approved = Boolean(info?.verify_status)
  const failed = !approved && Boolean(info?.verify_msg)
  const pending = Boolean(pendingUrl) && !approved && !failed

  return (
    <div className="user-page">
      <h2>实名认证</h2>
      <Card className="user-panel">
        <Steps current={approved ? 2 : pending ? 1 : 0} items={[{ title: '填写认证信息' }, { title: '身份认证' }, { title: '认证完成' }]} style={{ marginBottom: 28 }} />
        {approved ? <Alert type="success" showIcon icon={<CheckCircleFilled />} message="实名认证成功" style={{ marginBottom: 20 }} /> : null}
        {callbackStatus ? <Alert type={callbackStatus === 'success' ? 'success' : 'error'} showIcon message={callbackTitle} description={callbackMessage || '认证结果已返回，请根据提示继续操作。'} style={{ marginBottom: 20 }} /> : null}
        {approved ? (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="认证状态">已认证</Descriptions.Item>
            <Descriptions.Item label="真实姓名">{info?.real_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="证件号码">{info?.id_card || '-'}</Descriptions.Item>
            <Descriptions.Item label="认证账号">{info?.account || '-'}</Descriptions.Item>
            <Descriptions.Item label="认证时间">{info?.update_time || info?.create_time || '-'}</Descriptions.Item>
          </Descriptions>
        ) : null}
        {failed ? <Alert type="error" showIcon message="实名认证未通过" description={info?.verify_msg} style={{ marginBottom: 20 }} /> : null}
        {pending ? (
          <div className="narrow-form" style={{ width: '100%', maxWidth: 520, margin: '0 auto' }}>
            <Alert
              type={timedOut ? 'warning' : 'info'}
              showIcon
              message={timedOut ? '认证结果尚未返回' : checking ? '正在获取认证结果' : '等待身份认证'}
              description={timedOut ? '请确认认证页面已完成操作，稍后重新进入本页即可继续查询。' : '完成身份认证后，本页面会自动获取结果，无需手动刷新。'}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 20 }}>
              <Image width={240} src={qrCodeUrl} alt="身份认证二维码" preview={{ mask: '查看二维码' }} />
              <Button type="primary" icon={<LinkOutlined />} style={{ marginTop: 20 }} onClick={openAuthPage}>前往身份认证</Button>
            </div>
          </div>
        ) : null}
        {!approved && !pending ? (
          <>
            <Alert type="info" showIcon message="使用身份认证服务完成实名认证" description="请填写本人真实姓名、身份证号码和认证账号。认证账号需要是手机号码或邮箱。" style={{ maxWidth: 520, margin: '0 auto 20px' }} />
            <Form form={form} layout="vertical" className="narrow-form" style={{ maxWidth: 520, margin: '0 auto' }} onFinish={async (values) => {
              setSubmitting(true)
              try {
                const result = await userApi.verifyRealName(values)
                const nextInfo = result.data as RealNameInfo | undefined
                const authURL = nextInfo?.auth_url || nextInfo?.alipay_auth_url
                if (result.code === 200 && typeof authURL === 'string' && authURL) {
                  setPendingUrl(authURL)
                  setInfo({
                    verify_status: false,
                    verify_msg: '',
                    provider_type: nextInfo?.provider_type,
                    alipay_auth_url: authURL,
                    auth_url: authURL,
                  })
                  form.resetFields()
                } else {
                  message.error(result.msg || '发起实名认证失败')
                }
              } catch (error) {
                message.error(error instanceof Error ? error.message : '发起实名认证失败')
              } finally {
                setSubmitting(false)
              }
            }}>
              <Form.Item name="real_name" label="真实姓名" rules={[{ required: true, message: '请输入真实姓名' }]}><Input maxLength={16} /></Form.Item>
              <Form.Item name="id_card" label="身份证号码" rules={[{ required: true, message: '请输入身份证号码' }, { pattern: /^\d{17}[\dXx]$/, message: '身份证号码格式不正确' }]}><Input maxLength={18} /></Form.Item>
              <Form.Item name="account" label="认证账号" rules={[{ required: true, message: '请输入认证账号' }]}><Input placeholder="请输入手机号码或邮箱" /></Form.Item>
              <Button block loading={submitting} type="primary" htmlType="submit">发起实名认证</Button>
            </Form>
          </>
        ) : null}
      </Card>
    </div>
  )
}