import { useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Spin, Switch, Typography, message } from 'antd'
import { GlobalOutlined, LockOutlined, MailOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons'
import { PageContainer } from '@ant-design/pro-components'
import { adminApi, publicApi } from '@/api'
import { getGeetestValidate } from '@/composables/useGeetestCaptcha'

interface EmailFormValues {
  host: string
  port: number
  username: string
  password: string
  from_name: string
  skip_tls_verify?: boolean
}

const { Text } = Typography

export default function EmailPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [form] = Form.useForm<EmailFormValues>()
  const [testForm] = Form.useForm<{ email: string }>()

  const loadConfig = async () => {
    setLoading(true)
    try {
      const res = await adminApi.getEmailInfo()
      if (res.code !== 200) throw new Error(res.msg || '邮件配置加载失败')
      if (res.data) {
        form.setFieldsValue({
          host: res.data.host || '',
          port: res.data.port,
          username: res.data.username || '',
          password: res.data.password || '',
          from_name: res.data.fromName || res.data.from_name || '',
          skip_tls_verify: res.data.skip_tls_verify,
        })
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '邮件配置加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadConfig() }, [])

  const handleSubmit = async (values: EmailFormValues) => {
    setSaving(true)
    try {
      const result = await adminApi.updateEmail({ id: 1, ...values, skip_tls_verify: values.skip_tls_verify || false })
      if (result.code !== 200) throw new Error(result.msg || '邮件服务配置保存失败')
      message.success('邮件服务配置已保存')
      void loadConfig()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '邮件服务配置保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleTestSend = async (values: { email: string }) => {
    setTestSending(true)
    try {
      const result = await publicApi.sendCode({ email: values.email, ...await getGeetestValidate('email') })
      if (result.code !== 200) throw new Error(result.msg || '验证码发送失败')
      message.success('验证码已发送，请检查收件箱')
      setCountdown(60)
      const timer = window.setInterval(() => {
        setCountdown((seconds) => {
          if (seconds <= 1) {
            window.clearInterval(timer)
            return 0
          }
          return seconds - 1
        })
      }, 1000)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '验证码发送失败')
    } finally {
      setTestSending(false)
    }
  }

  if (loading) return <Spin className="admin-page-loading" />

  return (
    <PageContainer
      title="邮件服务"
      subTitle="配置系统验证码和通知邮件的 SMTP 服务"
      className="admin-page-container"
    >
      <Card className="admin-panel admin-form-panel" bordered={false}>
        <Alert className="admin-inline-alert" type="info" showIcon message="请使用具备 SMTP 发信权限的邮箱账号或授权码。" />
        <Form className="admin-email-form" form={form} layout="vertical" onFinish={handleSubmit} requiredMark="optional">
          <div className="admin-form-section">
            <div><h3>连接参数</h3><Text type="secondary">用于连接发件邮箱服务</Text></div>
            <Row gutter={[16, 0]}>
              <Col xs={24} md={12}><Form.Item name="host" label="SMTP 主机" rules={[{ required: true, message: '请输入 SMTP 主机' }]}><Input prefix={<GlobalOutlined />} placeholder="例如 smtp.qq.com" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="port" label="端口" rules={[{ required: true, message: '请输入端口' }]}><InputNumber min={1} max={65535} precision={0} style={{ width: '100%' }} placeholder="例如 465" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="username" label="发件邮箱" rules={[{ required: true, message: '请输入发件邮箱账号' }]}><Input prefix={<MailOutlined />} placeholder="name@example.com" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="password" label="授权码或密码" rules={[{ required: true, message: '请输入授权码或密码' }]}><Input.Password prefix={<LockOutlined />} placeholder="请输入授权码或密码" /></Form.Item></Col>
            </Row>
          </div>
          <div className="admin-form-section">
            <div><h3>发件设置</h3><Text type="secondary">控制邮件内显示的发件人信息</Text></div>
            <Row gutter={[16, 0]}>
              <Col xs={24} md={12}><Form.Item name="from_name" label="发件人名称" rules={[{ required: true, message: '请输入发件人名称' }]}><Input placeholder="例如 GinBlog" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="skip_tls_verify" label="TLS 证书校验" valuePropName="checked"><Switch checkedChildren="跳过校验" unCheckedChildren="校验证书" /></Form.Item></Col>
            </Row>
          </div>
          <div className="admin-form-actions"><Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存配置</Button><Button icon={<SendOutlined />} onClick={() => setTestOpen(true)}>发送测试</Button></div>
        </Form>
      </Card>

      <Modal
        title="发送测试验证码"
        open={testOpen}
        onCancel={() => { setTestOpen(false); setCountdown(0); testForm.resetFields() }}
        footer={null}
        destroyOnClose
      >
        <Text type="secondary">验证码会发送到指定收件邮箱，用于验证当前邮件服务。</Text>
        <Form form={testForm} layout="vertical" onFinish={handleTestSend} className="admin-modal-form">
          <Form.Item name="email" label="收件邮箱" rules={[{ required: true, message: '请输入收件邮箱' }, { type: 'email', message: '请输入有效的邮箱地址' }]}><Input prefix={<MailOutlined />} placeholder="name@example.com" /></Form.Item>
          <Button type="primary" htmlType="submit" loading={testSending} disabled={countdown > 0}>{countdown > 0 ? `${countdown} 秒后重试` : '发送验证码'}</Button>
        </Form>
      </Modal>
    </PageContainer>
  )
}
