import { useEffect, useState } from 'react'
import { Alert, Button, Card, Form, Input, message, Switch } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { adminApi } from '@/api'

/** 管理员验证码与邮件短信防刷配置，验证码密钥留空保留原值。 */
export default function AntiBrushConfig() {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [configured, setConfigured] = useState<Record<string, unknown>>()

  useEffect(() => {
    void adminApi.getAntiBrushConfig().then((result) => {
      const config = (result.data || {}) as Record<string, unknown>
      setConfigured(config)
      form.setFieldsValue(config)
    })
  }, [form])

  /** 保存防刷配置并重新加载脱敏后的展示值。 */
  const submit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      await adminApi.updateAntiBrushConfig(values)
      message.success('防刷配置已保存')
      const result = await adminApi.getAntiBrushConfig()
      const config = (result.data || {}) as Record<string, unknown>
      setConfigured(config)
      form.setFieldsValue({ captcha_key: '', ...config })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-page">
      <Card title="防刷配置" className="admin-panel admin-form-panel" bordered={false}>
        <Alert className="admin-inline-alert" message="验证码密钥留空表示保留当前值；开关用于控制邮件和短信验证码发送频率限制。" showIcon type="info" />
        <Form form={form} layout="vertical" className="anti-brush-config-form" onFinish={submit}>
          <Form.Item label="验证码 ID" name="captcha_id"><Input /></Form.Item>
          <Form.Item label="验证码 Key" name="captcha_key" extra={configured?.captcha_key_configured ? '已配置，留空保存时不会修改。' : '未配置'}><Input.Password autoComplete="new-password" /></Form.Item>
          <Form.Item label="邮件防刷" name="email_anti_brush" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item label="短信防刷" name="sms_anti_brush" valuePropName="checked"><Switch /></Form.Item>
          <div className="admin-form-actions">
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存配置</Button>
          </div>
        </Form>
      </Card>
    </div>
  )
}