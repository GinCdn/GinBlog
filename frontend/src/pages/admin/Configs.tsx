import { useEffect, useState } from 'react'
import { Alert, Button, Card, Collapse, Divider, Drawer, Form, Input, InputNumber, message, Select, Spin, Switch, Table, Typography } from 'antd'
import { EditOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import { adminApi, publicApi } from '@/api'
import type { PaymentConfig, RegisterConfig } from '@/types'

const GINAPI_REALNAME_APP_SLUG = 'alipay-realname'

type Row = Record<string, any>

export function RegisterConfigPage() {
  const [form] = Form.useForm<RegisterConfig>()
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    publicApi.getRegisterInfo()
      .then((res) => form.setFieldsValue(normalizeRegisterConfig(res.data)))
      .finally(() => setLoading(false))
  }, [form])
  return <Page title="注册配置"><Spin spinning={loading}><Form form={form} layout="vertical" onFinish={async (values) => saveResult(await adminApi.updateRegisterConfig(values as Row))}>
    <div className="config-grid"><Number name="username_min_len" label="用户名最小长度" min={5} max={20} /><Number name="username_max_len" label="用户名最大长度" min={5} max={20} /><Number name="password_min_len" label="密码最小长度" min={6} max={20} /><Number name="password_max_len" label="密码最大长度" min={6} max={20} /><Form.Item name="password_rule" label="密码规则"><Select options={[{ value: 1, label: '字母与数字' }, { value: 2, label: '大小写字母与数字' }]} /></Form.Item></div>
    <Switches names={['status', 'verify_email', 'verify_phone', 'required_username', 'required_email', 'required_phone', 'required_qq']} labels={['允许注册', '验证邮箱', '验证手机', '必填用户名', '必填邮箱', '必填手机', '必填 QQ']} /><Save />
  </Form></Spin></Page>
}

type RegisterConfigResponse = RegisterConfig & {
  usernameMinLen?: number
  usernameMaxLen?: number
  passwordMinLen?: number
  passwordMaxLen?: number
  passwordRule?: number
  verifyEmail?: boolean
  verifyPhone?: boolean
  requiredUsername?: boolean
  requiredPhone?: boolean
  requiredEmail?: boolean
  requiredQQ?: boolean
}

function normalizeRegisterConfig(data: RegisterConfigResponse): RegisterConfig {
  return {
    username_min_len: data.username_min_len ?? data.usernameMinLen,
    username_max_len: data.username_max_len ?? data.usernameMaxLen,
    password_min_len: data.password_min_len ?? data.passwordMinLen,
    password_max_len: data.password_max_len ?? data.passwordMaxLen,
    password_rule: data.password_rule ?? data.passwordRule,
    verify_email: data.verify_email ?? data.verifyEmail,
    verify_phone: data.verify_phone ?? data.verifyPhone,
    required_username: data.required_username ?? data.requiredUsername,
    required_phone: data.required_phone ?? data.requiredPhone,
    required_email: data.required_email ?? data.requiredEmail,
    required_qq: data.required_qq ?? data.requiredQQ,
    status: data.status,
  }
}

export function PaymentConfigPage() {
  const [items, setItems] = useState<PaymentConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [originals, setOriginals] = useState<Record<number, PaymentConfig>>({})
  const reload = async () => {
    setLoading(true)
    try {
      const result = await adminApi.getPaymentConfigs()
      // 在线充值和文章支付统一走易支付，历史官方接口配置首次保存时会平滑切换为易支付。
      const rows = (Array.isArray(result.data) ? result.data : []).map((item) => ({ ...item, method: 'epay', scene: 'page' }))
      setItems(rows)
      setOriginals(Object.fromEntries(rows.map((item) => [item.id, { ...item }])))
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void reload() }, [])
  const updateItem = (id: number, patch: Partial<PaymentConfig>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))
  const save = async (config: PaymentConfig, toggleOnly = false) => {
    setSavingId(config.id)
    try {
      const payload: Row = toggleOnly ? { id: config.id, enabled: config.enabled } : {
        id: config.id, method: 'epay', scene: 'page',
        enabled: config.enabled, notify_url: config.notify_url, return_url: config.return_url,
        epay_pay_url: config.epay_pay_url, epay_pid: config.epay_pid, epay_pay_key: config.epay_pay_key,
      }
      const result = await adminApi.updatePaymentConfig(payload)
      if (result.code !== 200) throw new Error(result.msg || '支付配置保存失败')
      // 保存后重新从服务端读取安全响应，使密钥只以已配置状态回显。
      await reload()
      message.success(toggleOnly ? `${config.enabled ? '已启用' : '已停用'}支付通道` : '支付配置已保存')
    } catch (error) {
      if (toggleOnly && originals[config.id]) updateItem(config.id, { enabled: originals[config.id].enabled })
      message.error(error instanceof Error ? error.message : '支付配置保存失败')
    } finally {
      setSavingId(null)
    }
  }
  return <div className="admin-page"><Alert className="admin-inline-alert" type="info" showIcon message="支付渠道按各自通道独立保存" description="切换接入方式后，旧方式的密钥会保留在服务端；本次保存只提交当前方式需要的字段。" />
    <Spin spinning={loading}>{items.map((config) => <PaymentConfigCard key={config.id} config={config} saving={savingId === config.id} onChange={(patch) => updateItem(config.id, patch)} onSave={(current) => void save(current)} onToggle={(enabled) => void save({ ...config, enabled }, true)} onReset={() => originals[config.id] && updateItem(config.id, originals[config.id])} />)}</Spin>
  </div>
}

function PaymentConfigCard({ config, saving, onChange, onSave, onToggle, onReset }: { config: PaymentConfig; saving: boolean; onChange: (patch: Partial<PaymentConfig>) => void; onSave: (config: PaymentConfig) => void; onToggle: (enabled: boolean) => void; onReset: () => void }) {
  const isAlipay = config.channel === 'alipay'
  const normalizedConfig = { ...config, method: 'epay', scene: 'page' }
  const isEpay = true
  const channelName = isAlipay ? '支付宝' : '微信支付'
  const notifyTip = 'https://你的域名/api/pay/notify'
  const returnTip = 'https://你的域名/api/pay/return'

  const advancedFields = isEpay ? (
    <div className="config-grid">
      <Form.Item label="易支付接口地址">
        <Input value={normalizedConfig.epay_pay_url} placeholder="https://pay.example.com/" onChange={(event) => onChange({ epay_pay_url: event.target.value })} />
      </Form.Item>
      <Form.Item label="易支付商户 ID">
        <InputNumber value={normalizedConfig.epay_pid === undefined || normalizedConfig.epay_pid === '' ? undefined : globalThis.Number(normalizedConfig.epay_pid)} min={1} style={{ width: '100%' }} onChange={(value) => onChange({ epay_pid: value === null ? '' : String(value) })} />
      </Form.Item>
      <Form.Item className="config-span-2" label="易支付商户密钥" extra={normalizedConfig.epay_pay_key_configured ? '已配置，留空则保留原密钥' : undefined}>
        <Input.Password value={normalizedConfig.epay_pay_key} placeholder={normalizedConfig.epay_pay_key_configured ? '留空则不修改' : '请输入商户密钥'} onChange={(event) => onChange({ epay_pay_key: event.target.value })} />
      </Form.Item>
    </div>
  ) : isAlipay ? (
    <div className="config-grid">
      <Form.Item label="支付宝 App ID">
        <Input value={normalizedConfig.alipay_app_id} onChange={(event) => onChange({ alipay_app_id: event.target.value })} />
      </Form.Item>
      <Form.Item className="config-span-2" label="支付宝应用私钥" extra={normalizedConfig.alipay_private_key_configured ? '已配置，留空则保留原密钥' : undefined}>
        <Input.TextArea rows={3} value={normalizedConfig.alipay_private_key} placeholder={normalizedConfig.alipay_private_key_configured ? '留空则不修改' : '请输入支付宝应用私钥'} onChange={(event) => onChange({ alipay_private_key: event.target.value })} />
      </Form.Item>
      <Form.Item className="config-span-2" label="支付宝公钥" extra={normalizedConfig.alipay_public_key_configured ? '已配置，留空则保留原密钥' : undefined}>
        <Input.TextArea rows={3} value={normalizedConfig.alipay_public_key} placeholder={normalizedConfig.alipay_public_key_configured ? '留空则不修改' : '请输入支付宝公钥'} onChange={(event) => onChange({ alipay_public_key: event.target.value })} />
      </Form.Item>
    </div>
  ) : (
    <div className="config-grid">
      <Form.Item label="微信 App ID">
        <Input value={normalizedConfig.wxpay_app_id} onChange={(event) => onChange({ wxpay_app_id: event.target.value })} />
      </Form.Item>
      <Form.Item label="微信商户号">
        <Input value={normalizedConfig.wxpay_mch_id} onChange={(event) => onChange({ wxpay_mch_id: event.target.value })} />
      </Form.Item>
      <Form.Item className="config-span-2" label="微信 API 密钥" extra={normalizedConfig.wxpay_api_key_configured ? '已配置，留空则保留原密钥' : undefined}>
        <Input.Password value={normalizedConfig.wxpay_api_key} placeholder={normalizedConfig.wxpay_api_key_configured ? '留空则不修改' : '请输入微信 API 密钥'} onChange={(event) => onChange({ wxpay_api_key: event.target.value })} />
      </Form.Item>
    </div>
  )

  return (
    <Card size="small" className="admin-panel admin-form-panel payment-config-card" bordered={false} title={<div className="payment-config-title"><span>{normalizedConfig.name || '支付通道'}</span><Switch checked={Boolean(normalizedConfig.enabled)} loading={saving} checkedChildren="启用" unCheckedChildren="停用" onChange={onToggle} /></div>}>
      <Form layout="vertical">
        <div className="config-grid">
          <Form.Item label="支付渠道"><Input value={channelName} disabled /></Form.Item>
          <Form.Item label="支付方式" extra="余额充值和文章解锁均使用易支付跳转页"><Input value="易支付" disabled /></Form.Item>
        </div>
        <div className="config-grid">
          <Form.Item label="异步通知地址" extra={`建议填写：${notifyTip}`}><Input value={normalizedConfig.notify_url} placeholder={notifyTip} onChange={(event) => onChange({ notify_url: event.target.value })} /></Form.Item>
          <Form.Item label="同步跳转地址" extra={`建议填写：${returnTip}`}><Input value={normalizedConfig.return_url} placeholder={returnTip} onChange={(event) => onChange({ return_url: event.target.value })} /></Form.Item>
        </div>
        <Collapse className="payment-advanced-fields" size="small" items={[{ key: 'advanced', label: isEpay ? '易支付密钥配置' : isAlipay ? '支付宝官方密钥配置' : '微信官方密钥配置', children: advancedFields }]} />
        <div className="admin-form-actions"><Button icon={<ReloadOutlined />} onClick={onReset}>重置</Button><Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => onSave(normalizedConfig)}>保存</Button></div>
      </Form>
    </Card>
  )
}

/** 管理员实名认证配置页面，按 GinCDN 实名配置页面保持单列布局和字段行为一致。 */
export function AlipayConfigPage() {
  const [form] = Form.useForm<Row>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [channel, setChannel] = useState('alipay')
  const [providerType, setProviderType] = useState('official')
  const [configured, setConfigured] = useState({ secret: false, privateKey: false, publicKey: false, ginapiSecret: false })
  const [pendingFormValues, setPendingFormValues] = useState<Row | null>(null)

  const load = async (preferredChannel?: string, preferredProvider?: string) => {
    setLoading(true)
    try {
      const result = await adminApi.getRealNameConfig()
      if (result.code !== 200) throw new Error(result.msg || '获取实名配置失败')
      const data = result.data || {}
      const nextChannel = preferredChannel || data.channel || 'alipay'
      const nextProvider = nextChannel === 'alipay' ? (preferredProvider || data.provider_type || 'official') : 'official'
      setChannel(nextChannel)
      setProviderType(nextProvider)
      setConfigured({
        secret: Boolean(data.secret_configured),
        privateKey: Boolean(data.private_key_configured),
        publicKey: Boolean(data.public_key_configured),
        ginapiSecret: Boolean(data.ginapi_app_secret_configured),
      })
      setPendingFormValues({
        channel: nextChannel,
        provider_type: nextProvider,
        app_id: data.app_id || '',
        secret: '',
        private_key: '',
        public_key: '',
        redirect_uri: data.redirect_uri || '',
        rule_id: data.rule_id || '',
        ginapi_base_url: data.ginapi_base_url || '',
        ginapi_app_key: data.ginapi_app_key || '',
        ginapi_app_secret: '',
        ginapi_app_slug: GINAPI_REALNAME_APP_SLUG,
        status: Boolean(data.status),
      })
    } catch (error) {
      message.error(error instanceof Error ? error.message : '获取实名配置失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  useEffect(() => {
    if (!pendingFormValues) return
    form.setFieldsValue(pendingFormValues)
    form.setFields([
      { name: 'ginapi_base_url', errors: [] },
      { name: 'ginapi_app_key', errors: [] },
      { name: 'ginapi_app_secret', errors: [] },
    ])
  }, [form, pendingFormValues, channel, providerType])

  const watchedChannel = Form.useWatch('channel', form)
  const watchedProviderType = Form.useWatch('provider_type', form)
  const selectedChannel = String(watchedChannel || channel)
  const selectedProviderType = String(watchedProviderType || providerType)
  const config = channelConfig[selectedChannel] || channelConfig.alipay
  const isGinApi = selectedChannel === 'alipay' && selectedProviderType === 'ginapi'
  const handleChannelChange = (value: string) => {
    setChannel(value)
    setProviderType('official')
    setConfigured({ secret: false, privateKey: false, publicKey: false, ginapiSecret: false })
    setPendingFormValues({
      channel: value,
      provider_type: 'official',
      app_id: '',
      secret: '',
      private_key: '',
      public_key: '',
      redirect_uri: '',
      rule_id: '',
      ginapi_base_url: '',
      ginapi_app_key: '',
      ginapi_app_secret: '',
      ginapi_app_slug: GINAPI_REALNAME_APP_SLUG,
      status: Boolean(form.getFieldValue('status')),
    })
    void load(value, 'official')
  }
  const submit = async (values: Row) => {
    setSaving(true)
    try {
      const submitChannel = String(values.channel || selectedChannel)
      const submitProviderType = String(values.provider_type || selectedProviderType)
      const submitConfig = channelConfig[submitChannel] || channelConfig.alipay
      const submitIsGinApi = submitChannel === 'alipay' && submitProviderType === 'ginapi'
      const payload: Row = { channel: submitChannel, provider_type: submitProviderType, status: Boolean(values.status) }
      if (!submitIsGinApi) payload.app_id = String(values.app_id || '').trim()
      if (submitConfig.showSecret && String(values.secret || '').trim()) payload.secret = String(values.secret).trim()
      if (submitConfig.showPrivateKey && String(values.private_key || '').trim()) payload.private_key = String(values.private_key).trim()
      if (submitConfig.showPublicKey && String(values.public_key || '').trim()) payload.public_key = String(values.public_key).trim()
      if (submitConfig.showRedirectUri) payload.redirect_uri = String(values.redirect_uri || '').trim()
      if (submitConfig.showRuleId) payload.rule_id = String(values.rule_id || '').trim()
      if (submitIsGinApi) {
        payload.ginapi_base_url = String(values.ginapi_base_url || '').trim()
        payload.ginapi_app_key = String(values.ginapi_app_key || '').trim()
        if (String(values.ginapi_app_secret || '').trim()) payload.ginapi_app_secret = String(values.ginapi_app_secret).trim()
        payload.ginapi_app_slug = GINAPI_REALNAME_APP_SLUG
      }
      const result = await adminApi.updateRealNameConfig(payload)
      if (!saveResult(result)) return
      await load()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '实名配置保存失败')
    } finally {
      setSaving(false)
    }
  }

  const secretExtra = configured.secret ? '已配置，留空保存时保留原值。' : config.secretHint
  const privateKeyExtra = configured.privateKey ? '已配置，留空保存时保留原值。' : 'RSA2私钥，用于签名'
  const publicKeyExtra = configured.publicKey ? '已配置，留空保存时保留原值。' : '支付宝开放平台提供的公钥，用于验签'
  const ginapiSecretExtra = configured.ginapiSecret ? '已配置，留空保存时保留原值。' : '请输入 GinApi 应用 AppSecret'

  return <Page title="实名配置"><Spin spinning={loading}><Form className="realname-config-form" form={form} layout="vertical" onFinish={submit} onValuesChange={(changed) => { if (changed.channel) handleChannelChange(changed.channel); if (changed.provider_type) setProviderType(changed.provider_type) }} requiredMark="optional">
    <Divider>实名认证配置</Divider>
    <Form.Item name="channel" label="配置渠道" rules={[{ required: true, message: '请选择配置渠道' }]}>
      <Select placeholder="请选择配置渠道" options={[{ value: 'alipay', label: '支付宝实名信息' }, { value: 'aliyun', label: '阿里云金融级实人' }, { value: 'tencent', label: '腾讯云人脸识别' }, { value: 'mobile_three', label: '手机号三要素认证' }]} />
    </Form.Item>
    <Typography.Text type="secondary" className="realname-form-hint">选择实名认证渠道</Typography.Text>
    {channel === 'alipay' ? <Form.Item name="provider_type" label="认证服务" rules={[{ required: true, message: '请选择认证服务' }]}>
      <Select placeholder="请选择认证服务" options={[{ value: 'official', label: '支付宝官方实名认证' }, { value: 'ginapi', label: 'GinApi 实名认证应用' }]} />
    </Form.Item> : null}
    {channel === 'alipay' ? <Typography.Text type="secondary" className="realname-form-hint">固定选择当前支付宝实名认证的服务来源</Typography.Text> : null}
    {!isGinApi ? <><Form.Item name="app_id" label={config.appIdLabel} rules={[{ required: true, message: config.appIdPlaceholder }]}>
      <Input placeholder={config.appIdPlaceholder} /></Form.Item>
    <Typography.Text type="secondary" className="realname-form-hint">{config.appIdHint}</Typography.Text>
      {channel === 'mobile_three' ? <a className="realname-market-link" href="https://market.aliyun.com/detail/cmapi00066757?spm=5176.29867242_210807074.0.0.44e83e7ei5tUVO#sku=yuncode6075700003" target="_blank" rel="noopener noreferrer">前往阿里云市场获取 AppCode</a> : null}</> : null}
    {isGinApi ? <>
      <Form.Item name="ginapi_base_url" label="GinApi 地址" rules={[{ required: true, message: '请输入 GinApi 地址' }]}>
        <Input placeholder="例如：http://127.0.0.1:8080" /></Form.Item>
      <Typography.Text type="secondary" className="realname-form-hint">填写 GinApi 服务根地址，不要填写 /api 或末尾斜杠</Typography.Text>
        <Typography.Text type="secondary" className="realname-form-hint">推荐站点：<a href="https://api.shuha.cn" target="_blank" rel="noopener noreferrer">https://api.shuha.cn</a></Typography.Text>
      <Form.Item name="ginapi_app_key" label="AppKey" rules={[{ required: true, message: '请输入 GinApi AppKey' }]}><Input placeholder="请输入 GinApi 应用 AppKey" /></Form.Item>
      <Form.Item name="ginapi_app_secret" label="AppSecret" extra={ginapiSecretExtra} rules={[{ required: !configured.ginapiSecret, message: '请输入 GinApi AppSecret' }]}><Input.Password placeholder={configured.ginapiSecret ? '已配置，留空保持不变' : '请输入 GinApi 应用 AppSecret'} /></Form.Item>

    </> : null}
    {config.showSecret ? <Form.Item name="secret" label={config.secretLabel} extra={secretExtra} rules={[{ required: !configured.secret, message: config.secretPlaceholder }]}><Input.Password placeholder={configured.secret ? '已配置，留空保持不变' : config.secretPlaceholder} /></Form.Item> : null}
    {config.showPrivateKey && !isGinApi ? <Form.Item name="private_key" label="应用私钥" extra={privateKeyExtra} rules={[{ required: !configured.privateKey, message: '请输入应用私钥' }]}><Input.TextArea rows={4} placeholder={configured.privateKey ? '已配置，留空保持不变' : '请输入应用私钥'} /></Form.Item> : null}
    {config.showPublicKey && !isGinApi ? <Form.Item name="public_key" label="支付宝公钥" extra={publicKeyExtra} rules={[{ required: !configured.publicKey, message: '请输入支付宝公钥' }]}><Input.TextArea rows={4} placeholder={configured.publicKey ? '已配置，留空保持不变' : '请输入支付宝公钥'} /></Form.Item> : null}
    {config.showRedirectUri && !isGinApi ? <><Form.Item name="redirect_uri" label="回调地址" rules={[{ required: true, message: '请输入回调地址' }]}><Input placeholder="请输入回调地址" /></Form.Item>
    <Typography.Text type="secondary" className="realname-form-hint">例如：/api/user/alipay/realname/callback</Typography.Text></> : null}
    {config.showRuleId ? <><Form.Item name="rule_id" label="场景ID" rules={[{ required: true, message: '请输入场景ID' }]}><Input placeholder="请输入场景ID" /></Form.Item>
    <Typography.Text type="secondary" className="realname-form-hint">腾讯云人脸识别场景ID</Typography.Text></> : null}
    <Form.Item name="status" label="服务状态" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item>
    <div className="admin-form-actions"><Button onClick={() => void load()}>重置</Button><Button type="primary" htmlType="submit" loading={saving}>保存</Button></div>
  </Form></Spin></Page>
}

const channelConfig: Record<string, { appIdLabel: string; appIdPlaceholder: string; appIdHint: string; showSecret: boolean; secretLabel: string; secretPlaceholder: string; secretHint: string; showPrivateKey: boolean; showPublicKey: boolean; showRedirectUri: boolean; showRuleId: boolean }> = {
  alipay: { appIdLabel: 'AppId', appIdPlaceholder: '请输入 AppId', appIdHint: '在支付宝开放平台获取', showSecret: false, secretLabel: '', secretPlaceholder: '', secretHint: '', showPrivateKey: true, showPublicKey: true, showRedirectUri: true, showRuleId: false },
  aliyun: { appIdLabel: 'AppId', appIdPlaceholder: '请输入 AppId', appIdHint: '在阿里云控制台获取', showSecret: true, secretLabel: 'Secret', secretPlaceholder: '请输入 Secret', secretHint: '在阿里云控制台获取，请勿泄露', showPrivateKey: false, showPublicKey: false, showRedirectUri: false, showRuleId: false },
  tencent: { appIdLabel: 'SecretId', appIdPlaceholder: '请输入 SecretId', appIdHint: '在腾讯云控制台获取', showSecret: true, secretLabel: 'SecretKey', secretPlaceholder: '请输入 SecretKey', secretHint: '在腾讯云控制台获取，请勿泄露', showPrivateKey: false, showPublicKey: false, showRedirectUri: false, showRuleId: true },
  mobile_three: { appIdLabel: 'AppCode', appIdPlaceholder: '请输入阿里云 AppCode', appIdHint: '购买手机号三要素服务后，在阿里云市场获取 AppCode', showSecret: false, secretLabel: '', secretPlaceholder: '', secretHint: '', showPrivateKey: false, showPublicKey: false, showRedirectUri: false, showRuleId: false },
}
export function PromotionConfigPage() { return <RemoteForm title="推广配置" load={adminApi.getPromotionConfig} save={adminApi.updatePromotionConfig} fields={[['min_withdrawal', '最低提现金额', false, 'number'], ['commission_settle_days', '佣金结算延迟天数', false, 'number']]} switches={[['status', '启用推广功能'], ['require_real_name', '申请推广需要实名认证']]} /> }

export function RoleConfigPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Row | null>(null)
  const [form] = Form.useForm()
  const load = () => { setLoading(true); adminApi.getRoleDiscounts({ page: 1, page_size: 20 }).then((res) => { const data = (res.data as any)?.data || res.data; setRows(data?.list || []) }).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [])
  const open = (row: Row) => { setEditing(row); form.setFieldsValue({ ...row, role_name: row.role_name || row.roleName, discount_rate: row.discount_rate ?? row.discountRate, upgrade_recharge: row.upgrade_recharge ?? row.upgradeRecharge, package_rebate: row.package_rebate ?? row.packageRebate }) }
  return <Page title="角色折扣"><Table rowKey="id" loading={loading} dataSource={rows} pagination={false} scroll={{ x: 820 }} columns={[{ title: '角色', dataIndex: 'role_name', render: (_, row) => row.role_name || row.roleName }, { title: '等级', dataIndex: 'role_level', render: (_, row) => row.role_level || row.roleLevel }, { title: '折扣率', dataIndex: 'discount_rate', render: (_, row) => row.discount_rate ?? row.discountRate }, { title: '升级充值', dataIndex: 'upgrade_recharge', render: (_, row) => row.upgrade_recharge ?? row.upgradeRecharge }, { title: '套餐返佣', dataIndex: 'package_rebate', render: (_, row) => row.package_rebate ?? row.packageRebate }, { title: '状态', dataIndex: 'status', render: (value) => value ? '启用' : '停用' }, { title: '操作', fixed: 'right', render: (_, row) => <Button type="link" icon={<EditOutlined />} onClick={() => open(row)}>编辑</Button> }]} />
  <Drawer title="编辑角色折扣" width={560} open={Boolean(editing)} onClose={() => setEditing(null)} destroyOnHidden extra={<Button type="primary" onClick={() => form.submit()}>保存</Button>}><Form form={form} layout="vertical" onFinish={async (values) => { const result = await adminApi.updateRoleDiscount({ ...values, id: editing?.id }); if (saveResult(result)) { setEditing(null); load() } }}><Form.Item name="role_name" label="角色名称"><Input disabled={Boolean(editing?.is_default || editing?.isDefault)} /></Form.Item><div className="config-grid"><Number name="discount_rate" label="折扣率" min={0} max={100} step={0.01} /><Number name="upgrade_recharge" label="升级充值金额" min={0} step={0.01} /><Number name="package_rebate" label="套餐返佣比例" min={0} max={100} step={0.01} /></div><Form.Item name="status" label="状态" valuePropName="checked"><Switch disabled={Boolean(editing?.is_default || editing?.isDefault)} /></Form.Item><Form.Item name="remark" label="备注"><Input.TextArea rows={3} maxLength={255} /></Form.Item></Form></Drawer></Page>
}

function RemoteForm({ title, load, save, fields, switches = [] }: { title: string; load: () => Promise<any>; save: (data: Row) => Promise<any>; fields: [string, string, boolean?, string?][]; switches?: [string, string][] }) {
  const [form] = Form.useForm(); const [loading, setLoading] = useState(true)
  useEffect(() => { load().then((res) => form.setFieldsValue(res.data)).finally(() => setLoading(false)) }, [form, load])
  return <Page title={title}><Spin spinning={loading}><Form form={form} layout="vertical" onFinish={async (values) => saveResult(await save(values))}><div className="config-grid">{fields.map(([name, label, text, type]) => <Form.Item key={name} name={name} label={label}>{text ? <Input.TextArea rows={4} /> : type === 'number' ? <InputNumber min={0} style={{ width: '100%' }} /> : <Input />}</Form.Item>)}</div><Switches names={switches.map(([name]) => name)} labels={switches.map(([, label]) => label)} /><Save /></Form></Spin></Page>
}
function Number({ name, label, min, max, step = 1 }: { name: string; label: string; min: number; max?: number; step?: number }) { return <Form.Item name={name} label={label}><InputNumber min={min} max={max} step={step} style={{ width: '100%' }} /></Form.Item> }
function Switches({ names, labels }: { names: string[]; labels: string[] }) { return <div className="switch-grid">{names.map((name, index) => <Form.Item key={name} name={name} label={labels[index]} valuePropName="checked"><Switch /></Form.Item>)}</div> }
function Save() { return <div className="admin-form-actions"><Button type="primary" htmlType="submit">保存配置</Button></div> }
function Page({ title, children }: { title: string; children: React.ReactNode }) { return <div className="admin-page"><Card className="admin-panel admin-form-panel" title={title} bordered={false}>{children}</Card></div> }
function saveResult(result: { code: number; msg?: string }) { if (result.code === 200) { message.success(result.msg || '保存成功'); return true }; message.error(result.msg || '保存失败'); return false }
