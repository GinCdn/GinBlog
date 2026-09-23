import { useEffect, useState } from 'react'
import { Alert, Button, Card, Divider, Form, Input, message, Modal, Radio, Spin, Switch } from 'antd'
import { ReloadOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons'
import { adminApi } from '@/api'

type SmsConfigResponse = {
  provider?: 'smsbao' | 'aliyun'
  status?: boolean
  smsBaoUser?: string
  smsBaoPasswordConfigured?: boolean
  aliyunAccessKeyId?: string
  aliyunAccessKeySecretConfigured?: boolean
  aliyunSignName?: string
  aliyunTemplateCode?: string
  aliyunRegionId?: string
}

type SmsConfigForm = {
  provider: 'smsbao' | 'aliyun'
  status: boolean
  sms_bao_user?: string
  sms_bao_password?: string
  aliyun_access_key_id?: string
  aliyun_access_key_secret?: string
  aliyun_sign_name?: string
  aliyun_template_code?: string
  aliyun_region_id?: string
}

type SmsTestForm = {
  phone: string
}

/** 管理员短信平台配置，敏感字段留空保存时保留当前值。 */
export default function SmsConfig() {
  const [form] = Form.useForm<SmsConfigForm>()
  const [testForm] = Form.useForm<SmsTestForm>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [testing, setTesting] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [savedStatus, setSavedStatus] = useState(false)
  const [configured, setConfigured] = useState<SmsConfigResponse>({})
  const provider = Form.useWatch('provider', form) || 'smsbao'

  /** 将接口展示结构转换为后端更新接口要求的表单字段名。 */
  const applyConfig = (config: SmsConfigResponse) => {
    setConfigured(config)
    setSavedStatus(!!config.status)
    form.setFieldsValue({
      provider: config.provider || 'smsbao',
      status: !!config.status,
      sms_bao_user: config.smsBaoUser || '',
      sms_bao_password: '',
      aliyun_access_key_id: config.aliyunAccessKeyId || '',
      aliyun_access_key_secret: '',
      aliyun_sign_name: config.aliyunSignName || '',
      aliyun_template_code: config.aliyunTemplateCode || '',
      aliyun_region_id: config.aliyunRegionId || 'cn-hangzhou',
    })
  }

  /** 重新读取已保存配置，避免敏感字段回显。 */
  const loadConfig = async () => {
    setLoading(true)
    try {
      const result = await adminApi.getSmsConfig()
      applyConfig((result.data || {}) as SmsConfigResponse)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '短信配置加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadConfig()
  }, [])

  useEffect(() => {
    if (countdown <= 0) return undefined
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [countdown])

  /** 保存当前服务商的配置，未填写的敏感字段不覆盖已保存值。 */
  const submit = async (values: SmsConfigForm) => {
    setSaving(true)
    try {
      const data: Record<string, unknown> = {
        provider: values.provider,
        status: values.status,
      }
      if (values.provider === 'smsbao') {
        data.sms_bao_user = values.sms_bao_user || ''
        data.sms_bao_password = values.sms_bao_password || ''
      } else {
        data.aliyun_access_key_id = values.aliyun_access_key_id || ''
        data.aliyun_access_key_secret = values.aliyun_access_key_secret || ''
        data.aliyun_sign_name = values.aliyun_sign_name || ''
        data.aliyun_template_code = values.aliyun_template_code || ''
        data.aliyun_region_id = values.aliyun_region_id || 'cn-hangzhou'
      }
      await adminApi.updateSmsConfig(data)
      message.success('短信配置已保存')
      await loadConfig()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '短信配置保存失败')
    } finally {
      setSaving(false)
    }
  }

  /** 打开测试弹窗，测试始终使用后端已经保存的短信配置。 */
  const openTest = () => {
    if (!savedStatus) {
      message.warning('请先启用短信服务并保存配置')
      return
    }
    testForm.resetFields()
    setCountdown(0)
    setTestOpen(true)
  }

  /** 使用当前已保存配置发送测试验证码。 */
  const handleTest = async (values: SmsTestForm) => {
    setTesting(true)
    try {
      const result = await adminApi.testSms({ phone: values.phone })
      if (result.code !== 200) throw new Error(result.msg || '验证码发送失败')
      message.success('验证码发送成功，请查收短信')
      setCountdown(60)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '验证码发送失败')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="admin-page">
      <Card title="短信配置" className="admin-panel admin-form-panel" bordered={false}>
        <Spin spinning={loading}>
          <Alert
            className="admin-inline-alert"
            message="注册配置中开启手机号验证码后，将使用这里保存的短信服务发送验证码。"
            type="info"
            showIcon
          />
          <Form<SmsConfigForm> form={form} layout="vertical" className="sms-config-form" onFinish={submit} initialValues={{ provider: 'smsbao', status: false, aliyun_region_id: 'cn-hangzhou' }}>
            <Form.Item
              label="服务状态"
              name="status"
              valuePropName="checked"
              extra="停用后，用户注册手机号验证码不会发送短信。"
            >
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>

            <Form.Item label="短信服务商" name="provider" rules={[{ required: true, message: '请选择短信服务商' }]}>
              <Radio.Group>
                <Radio value="smsbao">短信宝</Radio>
                <Radio value="aliyun">阿里云短信</Radio>
              </Radio.Group>
            </Form.Item>

            {provider === 'smsbao' ? (
              <>
                <Divider titlePlacement="start">短信宝配置</Divider>
                <Form.Item label="短信宝账号" name="sms_bao_user" rules={[{ required: true, message: '请输入短信宝账号' }]}>
                  <Input placeholder="请输入短信宝账号" />
                </Form.Item>
                <Form.Item label="短信宝密码" name="sms_bao_password" extra={configured.smsBaoPasswordConfigured ? '密码已配置，留空保存时不会修改。' : '首次启用前需要填写短信宝密码。'}>
                  <Input.Password autoComplete="new-password" placeholder="留空表示保持原密码" />
                </Form.Item>
              </>
            ) : (
              <>
                <Divider titlePlacement="start">阿里云短信配置</Divider>
                <Form.Item label="AccessKey ID" name="aliyun_access_key_id" rules={[{ required: true, message: '请输入 AccessKey ID' }]}>
                  <Input placeholder="请输入阿里云 AccessKey ID" />
                </Form.Item>
                <Form.Item label="AccessKey Secret" name="aliyun_access_key_secret" extra={configured.aliyunAccessKeySecretConfigured ? '密钥已配置，留空保存时不会修改。' : '首次启用前需要填写 AccessKey Secret。'}>
                  <Input.Password autoComplete="new-password" placeholder="留空表示保持原密钥" />
                </Form.Item>
                <Form.Item label="短信签名" name="aliyun_sign_name" rules={[{ required: true, message: '请输入短信签名' }]}>
                  <Input placeholder="请输入已审核通过的短信签名" />
                </Form.Item>
                <Form.Item label="模板代码" name="aliyun_template_code" rules={[{ required: true, message: '请输入包含 code 变量的模板代码' }]}>
                  <Input placeholder="请输入包含 code 变量的模板代码" />
                </Form.Item>
                <Form.Item label="地域" name="aliyun_region_id">
                  <Input placeholder="默认 cn-hangzhou" />
                </Form.Item>
              </>
            )}

            <div className="admin-form-actions sms-config-actions">
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存</Button>
              <Button icon={<ReloadOutlined />} onClick={() => void loadConfig()} disabled={saving || testing}>重置</Button>
              <Button icon={<SendOutlined />} onClick={openTest} disabled={saving || testing}>测试</Button>
            </div>
          </Form>
        </Spin>
      </Card>

      <Modal
        title="测试发送验证码"
        open={testOpen}
        onCancel={() => { setTestOpen(false); setCountdown(0); testForm.resetFields() }}
        destroyOnHidden
        footer={null}
      >
        <Form<SmsTestForm> form={testForm} layout="vertical" onFinish={handleTest}>
          <Form.Item
            label="手机号"
            name="phone"
            rules={[
              { required: true, message: '请输入手机号' },
              { pattern: /^1[3-9]\d{9}$/, message: '手机号格式错误' },
            ]}
          >
            <Input maxLength={11} placeholder="请输入接收验证码的手机号" />
          </Form.Item>
          <div className="sms-config-test-hint">验证码有效期为 5 分钟，发送间隔为 60 秒。</div>
          <div className="admin-form-actions">
            <Button onClick={() => { setTestOpen(false); setCountdown(0); testForm.resetFields() }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={testing} disabled={countdown > 0}>
              {countdown > 0 ? `${countdown} 秒后重试` : '发送验证码'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}