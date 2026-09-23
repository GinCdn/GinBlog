import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, Col, Descriptions, Form, Image, Input, InputNumber, message, Modal, Radio, Row, Segmented, Space, Spin, Statistic, Table, Tag, Typography, Upload, type UploadProps } from 'antd'
import { CopyOutlined, LinkOutlined, UploadOutlined, WalletOutlined } from '@ant-design/icons'
import { userApi } from '@/api'
import { useUserStore } from '@/store'
import { formatUserTime, parseUserPage, readUserField, unwrapUserData, type UserRecord } from '@/utils/user-data'

type WithdrawalMethod = 'alipay' | 'wechat' | 'bank'
type RechargeValues = { amount: number; pay_way: 'alipay' | 'wxpay' }
const pageSize = 20
const money = (value: unknown) => Number(value || 0).toFixed(2)
const methodName = (value: unknown) => ({ alipay: '支付宝', wxpay: '微信', wechat: '微信', balance: '余额支付' }[String(value)] || '-')
const commissionStatus = (value: unknown) => ({ 0: ['gold', '待结算'], 1: ['green', '已结算'], 2: ['blue', '已提现'] }[Number(value)] || ['default', '未知'])
const withdrawalStatus = (value: unknown) => ({ 0: ['gold', '待审核'], 1: ['green', '已通过'], 2: ['red', '已拒绝'], 3: ['blue', '已打款'] }[Number(value)] || ['default', '未知'])

// 余额充值页面创建在线订单、打开支付页面，并展示待支付订单信息。
export function RechargePage() {
  const user = useUserStore((state) => state.userInfo)
  const getUserInfo = useUserStore((state) => state.getUserInfo)
  const [form] = Form.useForm()
  const [searchParams, setSearchParams] = useSearchParams()
  const rechargeAmount = Form.useWatch('amount', form)
  const [loading, setLoading] = useState(false)
  const [payment, setPayment] = useState<UserRecord | null>(null)
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'success'>('pending')
  const currentBalance = Number(user?.money ?? user?.balance ?? 0)

  useEffect(() => {
    if (searchParams.get('payment') !== 'success') return
    const tradeNo = searchParams.get('trade_no') || ''
    setPaymentStatus('success')
    setPayment(tradeNo ? { order_no: tradeNo } as UserRecord : null)
    void getUserInfo()
    message.success('支付成功，余额已更新')
    setSearchParams({}, { replace: true })
  }, [getUserInfo, searchParams, setSearchParams])

  useEffect(() => {
    const handlePaymentReturn = (event: MessageEvent) => {
      if (event.data?.source !== 'ginblog' || event.data?.type !== 'payment-success') return
      setPaymentStatus('success')
      void getUserInfo()
    }
    window.addEventListener('message', handlePaymentReturn)
    return () => window.removeEventListener('message', handlePaymentReturn)
  }, [getUserInfo])

  const submit = async (values: RechargeValues) => {
    setLoading(true)
    try {
      const result = await userApi.createRecharge(values)
      const response = unwrapUserData(result.data)
      const order = unwrapUserData(response)
      if (order.pay_info === undefined || order.pay_info === null) throw new Error(result.msg || '支付订单创建失败')
      // 新旧接口字段兼容，避免订单弹窗因缺少金额或时间显示为默认值。
      const displayOrder = {
        ...order,
        order_no: response.order_no ?? order.order_no,
        amount: order.amount ?? response.amount ?? values.amount,
        pay_way: order.pay_way ?? response.pay_way ?? values.pay_way,
        create_time: order.create_time ?? response.create_time ?? new Date().toISOString(),
      }
      setPaymentStatus('pending')
      setPayment(displayOrder)
      const payInfo = order.pay_info
      const url = typeof payInfo === 'string' ? payInfo : payInfo?.payurl || payInfo?.url || payInfo?.qrcode
      if (typeof url === 'string' && /^https?:\/\//.test(url) && !(typeof payInfo === 'object' && payInfo?.qrcode)) {
        window.open(url, '_blank')
        message.success('支付页面已在新窗口打开')
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '支付订单创建失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const orderNo = String(payment?.order_no || '')
    if (!orderNo) return

    let stopped = false
    let timer: ReturnType<typeof setInterval> | undefined
    const checkPayment = async () => {
      try {
        const result = await userApi.getOrders({ page: 1, page_size: 50 })
        const page = parseUserPage(result.data)
        const order = page.list.find((item) => String(readUserField(item, 'tradeNo', 'trade_no') || '') === orderNo)
        const paid = order?.status === true || order?.status === 1 || order?.status === '1'
        if (!paid || stopped) return
        stopped = true
        if (timer) clearInterval(timer)
        setPaymentStatus('success')
        await getUserInfo()
        message.success('支付成功，余额已更新')
      } catch {
        // 支付平台回调和订单查询存在短暂延迟，查询失败时继续等待下一次轮询。
      }
    }

    void checkPayment()
    timer = setInterval(() => { void checkPayment() }, 2000)
    return () => {
      stopped = true
      if (timer) clearInterval(timer)
    }
  }, [getUserInfo, payment?.order_no])

  const payInfo = payment?.pay_info
  const payUrl = typeof payInfo === 'string' ? payInfo : payInfo?.payurl || payInfo?.url || payInfo?.qrcode
  const qrCode = Boolean(typeof payInfo === 'object' && payInfo?.qrcode) || payment?.scene === 'native'

  return (
    <UserPage title="余额充值" hideTitle>
      <Card className="user-panel recharge-card" title="余额充值">
        <div className="recharge-current-balance">
          <Typography.Text>当前账户余额</Typography.Text>
          <strong>￥{money(currentBalance)}</strong>
        </div>
        <Form
          form={form}
          layout="vertical"
          className="recharge-form"
          initialValues={{ amount: 100, pay_way: 'alipay' }}
          onFinish={submit}
        >
          <Form.Item label="充值金额" required>
            <div className="recharge-quick-amounts" aria-label="快捷金额">
              {[10, 20, 50, 100, 200, 500].map((amount) => (
                <Button
                  key={amount}
                  type={Number(rechargeAmount) === amount ? 'primary' : 'default'}
                  onClick={() => form.setFieldValue('amount', amount)}
                >
                  {amount}元
                </Button>
              ))}
            </div>
            <Form.Item name="amount" noStyle rules={[{ required: true, message: '请输入充值金额' }]}>
              <InputNumber min={0.01} max={10000} precision={2} placeholder="请输入充值金额" />
            </Form.Item>
          </Form.Item>
          <Form.Item label="支付方式" name="pay_way" rules={[{ required: true, message: '请选择支付方式' }]}>
            <Radio.Group
              className="payment-method-options"
              optionType="button"
              buttonStyle="solid"
              options={[
                { value: 'alipay', label: '支付宝' },
                { value: 'wxpay', label: '微信支付' },
              ]}
            />
          </Form.Item>
          <Button type="primary" block htmlType="submit" loading={loading} className="recharge-submit-button">
            确认充值
          </Button>
        </Form>
      </Card>
      <Modal title="继续完成支付" open={Boolean(payment)} footer={null} onCancel={() => setPayment(null)} destroyOnClose>
        {payment ? (
          <>
          {paymentStatus === 'success' ? <Alert type="success" showIcon message="支付成功" description="余额已更新，可以关闭此窗口。" style={{ marginBottom: 16 }} /> : <Alert type="info" showIcon message="等待支付结果" description="完成支付后页面会自动检测到账状态。" style={{ marginBottom: 16 }} />}
          <Descriptions column={1} size="small">
            <Descriptions.Item label="订单号">{payment.order_no || '-'}</Descriptions.Item>
            <Descriptions.Item label="充值金额">￥{money(payment.amount)}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{formatUserTime(readUserField(payment, 'createTime', 'create_time'))}</Descriptions.Item>
            {qrCode && payUrl ? (
              <Descriptions.Item label="扫码支付">
                <div className="recharge-payment-qrcode">
                  <Image width={180} src={`/api/qrcode/${payment.pay_way === 'wxpay' ? 'wechat' : 'alipay'}?url=${encodeURIComponent(payUrl)}`} />
                </div>
              </Descriptions.Item>
            ) : null}
            {!qrCode && payUrl ? (
              <Descriptions.Item label="支付链接">
                <Button type="link" icon={<LinkOutlined />} onClick={() => window.open(payUrl, '_blank')}>
                  打开支付页面
                </Button>
              </Descriptions.Item>
            ) : null}
          </Descriptions>
          </>
        ) : null}
      </Modal>
    </UserPage>
  )
}
export function OrderPage() { return <SimpleList title="支付订单" load={userApi.getOrders} columns={[{ title: '订单号', render: (_: unknown, row: UserRecord) => readUserField(row, 'tradeNo', 'trade_no') || '-' }, { title: '订单名称', render: (_: unknown, row: UserRecord) => readUserField(row, 'name') || '-' }, { title: '金额', render: (_: unknown, row: UserRecord) => `￥${money(row.money ?? row.amount)}` }, { title: '支付方式', render: (_: unknown, row: UserRecord) => methodName(readUserField(row, 'payType', 'pay_type')) }, { title: '状态', render: (_: unknown, row: UserRecord) => <Tag color={(row.status === 1 || row.status === true) ? 'success' : 'warning'}>{(row.status === 1 || row.status === true) ? '已支付' : '待支付'}</Tag> }, { title: '创建时间', render: (_: unknown, row: UserRecord) => formatUserTime(readUserField(row, 'createTime', 'create_time')) }, { title: '支付时间', render: (_: unknown, row: UserRecord) => formatUserTime(readUserField(row, 'payTime', 'pay_time')) }]} /> }
export function RolePage() { return <SimpleList title="角色优惠" load={userApi.getRoleDiscounts} columns={[{ title: '角色', render: (_: unknown, row: UserRecord) => readUserField(row, 'roleName', 'role_name') || '-' }, { title: '套餐折扣', render: (_: unknown, row: UserRecord) => `${readUserField(row, 'discountRate', 'discount_rate') ?? 0}%` }, { title: '升级充值金额', render: (_: unknown, row: UserRecord) => `￥${money(readUserField(row, 'upgradeRecharge', 'upgrade_recharge'))}` }, { title: '套餐返佣比例', render: (_: unknown, row: UserRecord) => `${readUserField(row, 'packageRebate', 'package_rebate') ?? 0}%` }, { title: '说明', dataIndex: 'remark', render: (v: unknown) => v || '-' }]} /> }

export function PromotionPage() {
  const [loading, setLoading] = useState(true); const [applying, setApplying] = useState(false); const [status, setStatus] = useState<UserRecord>({ applied: false }); const [stats, setStats] = useState<UserRecord>({}); const [invitees, setInvitees] = useState<UserRecord[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1)
  const approved = status.applied && Number(status.status) === 1
  const inviteLink = useMemo(() => status.promo_code ? `${window.location.origin}/user/register?invite_code=${status.promo_code}` : '', [status.promo_code])
  const load = async (nextPage = 1) => { setLoading(true); try { const current = await userApi.getPromotionStatus(); const next = unwrapUserData(current.data); setStatus(next); if (!next.applied || Number(next.status) !== 1) { setStats({}); setInvitees([]); setTotal(0); return }; const [statResult, listResult] = await Promise.all([userApi.getPromotionStats(), userApi.getInvitees({ page: nextPage, page_size: pageSize })]); setStats(unwrapUserData(statResult.data)); const data = parseUserPage(listResult.data); setInvitees(data.list); setTotal(data.total) } catch (error) { message.error(error instanceof Error ? error.message : '推广信息加载失败') } finally { setLoading(false) } }
  useEffect(() => { void load(1) }, [])
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); message.success('已复制') } catch { message.error('复制失败，请手动复制') } }
  return <UserPage title="推广概览"><Spin spinning={loading}>{approved ? <><Row gutter={[16, 16]} className="statistics-row">{[['邀请人数', stats.total_invitee, ''], ['累计佣金', stats.total_commission, '￥'], ['待结算佣金', stats.pending_commission, '￥'], ['可提现金额', stats.balance_amount, '￥']].map(([title, value, prefix]) => <Col xs={12} lg={6} key={String(title)}><Card className="user-panel"><Statistic title={title} value={Number(value || 0)} precision={prefix ? 2 : 0} prefix={prefix} /></Card></Col>)}</Row><Card className="user-panel" title="推广信息"><Descriptions column={{ xs: 1, md: 2 }}><Descriptions.Item label="推广码">{status.promo_code} <Button type="link" icon={<CopyOutlined />} onClick={() => copy(status.promo_code)}>复制</Button></Descriptions.Item><Descriptions.Item label="累计已提现">￥{money(stats.withdrawn_amount)}</Descriptions.Item><Descriptions.Item label="推广链接" span={2}><Typography.Text ellipsis style={{ maxWidth: 460 }}>{inviteLink}</Typography.Text> <Button type="link" icon={<CopyOutlined />} onClick={() => copy(inviteLink)}>复制</Button></Descriptions.Item></Descriptions></Card><Card className="user-panel" title="被邀请用户"><Table rowKey="id" dataSource={invitees} locale={{ emptyText: '暂无被邀请用户' }} pagination={{ current: page, total, pageSize, onChange: (next) => { setPage(next); void load(next) } }} columns={[{ title: '用户', render: (_: unknown, row: UserRecord) => readUserField(row, 'inviteeName', 'invitee_name') || '-' }, { title: '绑定时间', render: (_: unknown, row: UserRecord) => formatUserTime(readUserField(row, 'createTime', 'create_time')) }]} /></Card></> : <Card className="user-panel">{status.applied ? <Alert type={Number(status.status) === 0 ? 'warning' : 'error'} showIcon message={Number(status.status) === 0 ? '推广申请正在审核中' : '推广申请已被拒绝'} description={status.reject_reason || '审核完成后可查看推广链接、佣金和提现记录。'} /> : <Alert type="info" showIcon message="尚未开通推广功能" description="开通后可邀请新用户并获得符合规则的佣金。" />}{!status.applied && <Button type="primary" style={{ marginTop: 16 }} loading={applying} onClick={async () => { setApplying(true); try { await userApi.applyPromotion(); message.success('推广申请已提交'); await load(1) } catch (error) { message.error(error instanceof Error ? error.message : '推广开通失败') } finally { setApplying(false) } }}>申请开通</Button>}</Card>}</Spin></UserPage>
}

export function CommissionPage() { return <SimpleList title="佣金明细" load={userApi.getCommissions} columns={[{ title: '被邀请用户', render: (_: unknown, row: UserRecord) => readUserField(row, 'inviteeName', 'invitee_name') || '-' }, { title: '订单号', render: (_: unknown, row: UserRecord) => readUserField(row, 'orderNo', 'order_no') || '-' }, { title: '订单金额', render: (_: unknown, row: UserRecord) => `￥${money(readUserField(row, 'orderAmount', 'order_amount'))}` }, { title: '返佣比例', render: (_: unknown, row: UserRecord) => `${readUserField(row, 'rebateRate', 'rebate_rate') || 0}%` }, { title: '佣金金额', render: (_: unknown, row: UserRecord) => `￥${money(row.amount)}` }, { title: '状态', render: (_: unknown, row: UserRecord) => { const [color, label] = commissionStatus(row.status); return <Tag color={color}>{label}</Tag> } }, { title: '创建时间', render: (_: unknown, row: UserRecord) => formatUserTime(readUserField(row, 'createTime', 'create_time')) }]} /> }

export function WithdrawalPage() {
  const [form] = Form.useForm(); const [method, setMethod] = useState<WithdrawalMethod>('alipay'); const [loading, setLoading] = useState(false); const [rows, setRows] = useState<UserRecord[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1)
  const load = async (nextPage = 1) => { setLoading(true); try { const result = await userApi.getWithdrawals({ page: nextPage, page_size: pageSize }); const data = parseUserPage(result.data); setRows(data.list); setTotal(data.total) } catch (error) { message.error(error instanceof Error ? error.message : '提现记录加载失败') } finally { setLoading(false) } }
  useEffect(() => { void load(1) }, [])
  const upload = async (option: Parameters<NonNullable<UploadProps['customRequest']>>[0], name: 'alipay_qrcode' | 'wechat_qrcode') => { const data = new FormData(); data.append('file', option.file as File); try { const result = await userApi.upload(data); if (!result.data) throw new Error(result.msg || '二维码上传失败'); form.setFieldValue(name, result.data); option.onSuccess?.(result); message.success('二维码上传成功') } catch (error) { message.error(error instanceof Error ? error.message : '二维码上传失败'); option.onError?.(error as Error) } }
  const submit = async (values: UserRecord) => { const data: UserRecord = { amount: values.amount, method, real_name: values.real_name }; if (method === 'alipay') Object.assign(data, { alipay_account: values.alipay_account, alipay_qrcode: values.alipay_qrcode }); if (method === 'wechat') Object.assign(data, { wechat_account: values.wechat_account, wechat_qrcode: values.wechat_qrcode }); if (method === 'bank') Object.assign(data, { bank_card: values.bank_card, bank_phone: values.bank_phone }); setLoading(true); try { await userApi.applyWithdrawal(data); message.success('提现申请已提交，请等待审核'); form.resetFields(); await load(1) } catch (error) { message.error(error instanceof Error ? error.message : '提现申请提交失败') } finally { setLoading(false) } }
  return <UserPage title="提现申请"><Row gutter={[16, 16]}><Col xs={24} xl={10}><Card className="user-panel"><Form form={form} layout="vertical" className="narrow-form" onFinish={submit}><Form.Item label="提现方式"><Segmented block value={method} options={[{ value: 'alipay', label: '支付宝' }, { value: 'wechat', label: '微信' }, { value: 'bank', label: '银行卡' }]} onChange={(value) => setMethod(value as WithdrawalMethod)} /></Form.Item><Form.Item name="amount" label="提现金额" rules={[{ required: true, message: '请输入提现金额' }]}><InputNumber min={1} precision={2} addonAfter="元" style={{ width: '100%' }} /></Form.Item><Form.Item name="real_name" label="收款人真实姓名" rules={[{ required: true, message: '请输入收款人真实姓名' }]}><Input /></Form.Item>{method === 'alipay' ? <AccountFields account="alipay_account" qrcode="alipay_qrcode" label="支付宝账号" form={form} upload={upload} /> : method === 'wechat' ? <AccountFields account="wechat_account" qrcode="wechat_qrcode" label="微信号" form={form} upload={upload} /> : <><Form.Item name="bank_card" label="银行卡号" rules={[{ required: true, message: '请输入银行卡号' }]}><Input /></Form.Item><Form.Item name="bank_phone" label="银行预留手机号"><Input /></Form.Item></>}<Button type="primary" icon={<WalletOutlined />} htmlType="submit" loading={loading}>提交提现申请</Button></Form></Card></Col><Col xs={24} xl={14}><Card className="user-panel" title="提现记录"><Table rowKey="id" loading={loading} dataSource={rows} scroll={{ x: 700 }} locale={{ emptyText: '暂无提现记录' }} pagination={{ current: page, total, pageSize, onChange: (next) => { setPage(next); void load(next) } }} columns={[{ title: '金额', render: (_: unknown, row: UserRecord) => `￥${money(row.amount)}` }, { title: '方式', render: (_: unknown, row: UserRecord) => methodName(row.method) }, { title: '状态', render: (_: unknown, row: UserRecord) => { const [color, label] = withdrawalStatus(row.status); return <Tag color={color}>{label}</Tag> } }, { title: '申请时间', render: (_: unknown, row: UserRecord) => formatUserTime(readUserField(row, 'createTime', 'create_time')) }, { title: '审核时间', render: (_: unknown, row: UserRecord) => formatUserTime(readUserField(row, 'reviewTime', 'review_time')) }, { title: '拒绝原因', render: (_: unknown, row: UserRecord) => readUserField(row, 'rejectReason', 'reject_reason') || '-' }]} /></Card></Col></Row></UserPage>
}

function AccountFields({ account, qrcode, label, form, upload }: { account: string; qrcode: 'alipay_qrcode' | 'wechat_qrcode'; label: string; form: any; upload: (option: Parameters<NonNullable<UploadProps['customRequest']>>[0], name: 'alipay_qrcode' | 'wechat_qrcode') => Promise<void> }) { const value = Form.useWatch(qrcode, form); return <><Form.Item name={account} label={label} rules={[{ required: true, message: `请输入${label}` }]}><Input /></Form.Item><Form.Item name={qrcode} label="收款二维码" extra="可选，不上传不影响提现申请"><Space direction="vertical">{value && <Image width={108} src={value} />}<Upload accept="image/*" maxCount={1} showUploadList={false} customRequest={(option) => { void upload(option, qrcode) }} beforeUpload={(file) => file.size <= 2 * 1024 * 1024 || (message.error('图片不能超过 2MB'), Upload.LIST_IGNORE)}><Button icon={<UploadOutlined />}>上传二维码</Button></Upload></Space></Form.Item></> }
function SimpleList({ title, load, columns }: { title: string; load: (params: Record<string, unknown>) => Promise<any>; columns: any[] }) { const [rows, setRows] = useState<UserRecord[]>([]); const [loading, setLoading] = useState(true); const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const refresh = async (next = 1) => { setLoading(true); try { const result = await load({ page: next, page_size: pageSize }); const data = parseUserPage(result.data); setRows(data.list); setTotal(data.total) } catch (error) { message.error(error instanceof Error ? error.message : `${title}加载失败`) } finally { setLoading(false) } }; useEffect(() => { void refresh(1) }, []); return <UserPage title={title}><Card className="user-panel"><Table rowKey="id" loading={loading} dataSource={rows} columns={columns} scroll={{ x: 760 }} locale={{ emptyText: `暂无${title}数据` }} pagination={{ current: page, total, pageSize, onChange: (next) => { setPage(next); void refresh(next) } }} /></Card></UserPage> }
function UserPage({ title, children, hideTitle = false }: { title: string; children: React.ReactNode; hideTitle?: boolean }) { return <div className={`user-page${title === '余额充值' ? ' user-recharge-page' : ''}`}>{!hideTitle && <h2>{title}</h2>}{children}</div> }

