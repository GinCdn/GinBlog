import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Col, Descriptions, Empty, Image, Modal, Radio, Row, Space, Tag, Tooltip, Typography, message } from 'antd'
import { ApiOutlined, AppstoreOutlined, ArrowRightOutlined, LinkOutlined, ShoppingCartOutlined } from '@ant-design/icons'
import { userApi } from '@/api'
import type { App, AppCategory, AppEndpoint, AppPlan } from '@/types'
import { unwrapUserData } from '@/utils/user-data'

// 返回应用列表中已预加载的套餐。
function getAppPlans(app: App) {
  return app.plans || []
}

// 格式化套餐调用额度。
function getPlanQuota(plan?: AppPlan) {
  if (!plan) return '-'
  return plan.quota ? `${plan.quota} ${plan.quotaUnit || plan.quota_unit || '次'}` : '不限'
}

// 格式化套餐有效期。
function getPlanValidDays(plan?: AppPlan) {
  if (!plan) return '-'
  const days = plan.validDays ?? plan.valid_days
  return days ? `${days} 天` : '长期有效'
}

// 用户应用市场页面。
export default function AppMarket() {
  const [apps, setApps] = useState<App[]>([])
  const [allApps, setAllApps] = useState<App[]>([])
  const [categories, setCategories] = useState<AppCategory[]>([])
  const [activeCategory, setActiveCategory] = useState<number>()
  const [active, setActive] = useState<App>()
  const [plans, setPlans] = useState<AppPlan[]>([])
  const [endpoints, setEndpoints] = useState<AppEndpoint[]>([])
  const [payWay, setPayWay] = useState<'alipay' | 'wxpay'>('alipay')
  const [loading, setLoading] = useState(false)
  const [payment, setPayment] = useState<Record<string, any> | null>(null)

  useEffect(() => {
    void Promise.all([userApi.getApps(), userApi.getAppCategories()]).then(([appRes, categoryRes]) => {
      const rows = appRes.data || []
      setAllApps(rows)
      setApps(rows)
      setCategories(categoryRes.data || [])
    })
  }, [])

  const visibleAppCount = useMemo(() => apps.length, [apps])

  const selectCategory = (categoryId?: number) => {
    setActiveCategory(categoryId)
    setApps(categoryId === undefined ? allApps : allApps.filter((app) => (app.categoryId || app.category_id) === categoryId))
  }

  const open = async (app: App) => {
    setActive(app)
    const [planRes, endpointRes] = await Promise.all([userApi.getAppPlans(app.id), userApi.getAppEndpoints(app.id)])
    setPlans(planRes.data || [])
    setEndpoints(endpointRes.data || [])
  }

  const buy = async (plan: AppPlan) => {
    setLoading(true)
    try {
      const res = await userApi.createAppOrder({ app_id: active!.id, plan_id: plan.id, pay_way: payWay })
      const data = unwrapUserData(res.data)
      const info = data.pay_info
      const url = typeof info === 'string' ? info : info?.payurl || info?.qrcode
      if (!url) throw new Error(res.msg || '支付信息生成失败')
      setPayment({ ...data, pay_info: info })
      if (typeof info === 'string' && /<form[\s>]/i.test(info)) {
        const popup = window.open('', '_blank')
        if (popup) {
          popup.document.write(info)
          popup.document.close()
          message.success('支付页面已打开，请完成支付')
        }
      } else if (/^https?:\/\//.test(String(url)) && !(typeof info === 'object' && info?.qrcode)) {
        window.open(String(url), '_blank', 'noopener,noreferrer')
        message.success('支付页面已打开，请完成支付')
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '应用套餐购买失败')
    } finally {
      setLoading(false)
    }
  }

  const paymentInfo = payment?.pay_info
  const paymentUrl = typeof paymentInfo === 'string' ? paymentInfo : paymentInfo?.payurl || paymentInfo?.qrcode
  const isForm = typeof paymentInfo === 'string' && /<form[\s>]/i.test(paymentInfo)
  const isQr = !isForm && Boolean(paymentUrl) && (
    payment?.scene === 'native'
    || payment?.scene === 'face_to_face'
    || (typeof paymentInfo === 'object' && Boolean(paymentInfo?.qrcode))
  )

  return (
    <div className="user-page app-market-page">
      <div className="user-page-heading app-market-heading">
        <div>
          <Space size={10} align="center">
            <h2>应用市场</h2>
            <span className="app-market-count">{visibleAppCount} 个应用</span>
          </Space>
          <Typography.Text type="secondary">购买套餐后即可获得独立调用密钥</Typography.Text>
        </div>
      </div>

      <div className="app-market-toolbar">
        <Typography.Text className="app-market-filter-label">应用分类</Typography.Text>
        <Space wrap size={[8, 8]} className="app-category-filter">
          <Button type={!activeCategory ? 'primary' : 'default'} icon={<AppstoreOutlined />} onClick={() => selectCategory()}>
            全部应用
          </Button>
          {categories.map((category) => (
            <Button key={category.id} type={activeCategory === category.id ? 'primary' : 'default'} onClick={() => selectCategory(category.id)}>
              {category.name}
            </Button>
          ))}
        </Space>
      </div>

      <Row gutter={[16, 16]} className="app-market-grid">
        {apps.map((app) => {
          const firstPlan = getAppPlans(app)[0]
          return (
            <Col xs={24} md={12} xxl={8} key={app.id}>
              <Card className="user-panel app-market-card" hoverable onClick={() => void open(app)}>
                <div className="app-market-card-main">
                  <div className="app-logo-box">
                    {app.logo ? <Image preview={false} src={app.logo} alt={`${app.name} 图标`} /> : <ApiOutlined />}
                  </div>
                  <div className="app-market-card-content">
                    <div className="app-market-card-title">
                      <Typography.Title level={4}>{app.name}</Typography.Title>
                      <Tag color="blue">{app.providerName || '第三方应用'}</Tag>
                    </div>
                    <Typography.Paragraph ellipsis={{ rows: 2 }}>
                      {app.summary || app.description || '提供稳定的业务接口调用服务'}
                    </Typography.Paragraph>
                  </div>
                </div>

                <div className="app-market-plan-summary">
                  <div>
                    <span>套餐起价</span>
                    <strong>{firstPlan ? `￥${Number(firstPlan.price).toFixed(2)}` : '-'}</strong>
                  </div>
                  <div>
                    <span>调用额度</span>
                    <strong>{getPlanQuota(firstPlan)}</strong>
                  </div>
                  <div>
                    <span>有效期</span>
                    <strong>{getPlanValidDays(firstPlan)}</strong>
                  </div>
                </div>

                <div className="app-market-card-footer">
                  <Typography.Text type="secondary">{getAppPlans(app).length || '多'} 个可选套餐</Typography.Text>
                  <Tooltip title="查看应用详情">
                    <Button type="link" icon={<ArrowRightOutlined />} onClick={() => void open(app)}>
                      查看详情
                    </Button>
                  </Tooltip>
                </div>
              </Card>
            </Col>
          )
        })}
      </Row>

      {apps.length === 0 && <Empty className="app-market-empty" description="暂无可用应用" />}

      <Modal className="app-market-detail-modal" title={null} open={Boolean(active)} onCancel={() => setActive(undefined)} footer={null} width={760} destroyOnHidden>
        <div className="app-detail-header">
          <div className="app-detail-logo">
            {active?.logo ? <Image preview={false} src={active.logo} alt={`${active.name} 图标`} /> : <ApiOutlined />}
          </div>
          <div className="app-detail-intro">
            <div className="app-detail-title-row">
              <Typography.Title level={3}>{active?.name}</Typography.Title>
              <Tag color="blue">{active?.providerName || '第三方应用'}</Tag>
            </div>
            <Typography.Text type="secondary">{active?.summary || active?.description || '提供稳定的业务接口调用服务'}</Typography.Text>
          </div>
        </div>

        <div className="app-detail-section-heading">
          <Typography.Title level={5}>套餐选择</Typography.Title>
          <Typography.Text type="secondary">{plans.length} 个可选套餐</Typography.Text>
        </div>
        <div className="app-plan-list">
          {plans.map((plan) => (
            <Card className="app-plan-card" size="small" key={plan.id}>
              <div className="app-plan-card-top">
                <div className="app-plan-name">
                  <Typography.Text strong>{plan.name}</Typography.Text>
                  <Typography.Text type="secondary">{plan.description || '标准应用调用套餐'}</Typography.Text>
                </div>
                <div className="app-plan-price">
                  <span>套餐价格</span>
                  <strong>￥{Number(plan.price).toFixed(2)}</strong>
                </div>
              </div>
              <div className="app-plan-card-bottom">
                <div className="app-plan-metrics">
                  <span><em>调用额度</em><strong>{getPlanQuota(plan)}</strong></span>
                  <span><em>有效期</em><strong>{getPlanValidDays(plan)}</strong></span>
                </div>
                <div className="app-plan-actions">
                  <Radio.Group
                    value={payWay}
                    onChange={(event) => setPayWay(event.target.value)}
                    options={[{ value: 'alipay', label: '支付宝' }, { value: 'wxpay', label: '微信支付' }]}
                  />
                  <Button type="primary" icon={<ShoppingCartOutlined />} loading={loading} onClick={() => void buy(plan)}>
                    购买套餐
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="app-detail-section-heading app-detail-endpoint-heading">
          <Typography.Title level={5}>接口文档</Typography.Title>
          <Typography.Text type="secondary">{endpoints.length} 个接口</Typography.Text>
        </div>
        <div className="app-endpoint-list">
          {endpoints.map((endpoint) => (
            <Card className="app-endpoint-card" size="small" key={endpoint.id}>
              <Tag color="blue">{endpoint.method}</Tag>
              <Typography.Text code>{`/api/open/${active?.slug}${endpoint.path}`}</Typography.Text>
              <Typography.Text type="secondary">{endpoint.summary || endpoint.name}</Typography.Text>
            </Card>
          ))}
        </div>
      </Modal>

      <Modal className="app-market-payment-modal" title="继续完成支付" open={Boolean(payment)} footer={null} onCancel={() => setPayment(null)} destroyOnHidden>
        {payment ? (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="订单号">{payment.order_no || '-'}</Descriptions.Item>
            <Descriptions.Item label="支付方式">{payWay === 'wxpay' ? '微信支付' : '支付宝'}</Descriptions.Item>
            {isQr && paymentUrl ? (
              <Descriptions.Item label="扫码支付">
                <div className="app-payment-qr">
                  <Image width={220} src={`/api/qrcode/${payWay === 'wxpay' ? 'wechat' : 'alipay'}?url=${encodeURIComponent(paymentUrl)}`} />
                </div>
              </Descriptions.Item>
            ) : null}
            {!isQr && !isForm && paymentUrl ? (
              <Descriptions.Item label="支付链接">
                <Button type="link" icon={<LinkOutlined />} onClick={() => window.open(paymentUrl, '_blank', 'noopener,noreferrer')}>
                  打开支付页面
                </Button>
              </Descriptions.Item>
            ) : null}
          </Descriptions>
        ) : null}
      </Modal>
    </div>
  )
}