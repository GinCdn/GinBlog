import { formatChinaTime } from '@/utils/time'
import { useEffect, useState } from 'react'
import { Card, Table, Tag } from 'antd'
import { adminApi } from '@/api'
import type { AppOrder } from '@/types'
const time = (v?: string) => formatChinaTime(v)
export default function AppOrders() { const [rows, setRows] = useState<AppOrder[]>([]); useEffect(() => { void adminApi.getAppOrders().then((r) => setRows(r.data || [])) }, []); return <div className="admin-page"><Card className="admin-panel admin-table" title="应用订单" bordered={false}><Table rowKey="id" dataSource={rows} columns={[{ title: '订单号', render: (_, r) => r.orderNo || r.order_no }, { title: '用户', dataIndex: 'username' }, { title: '应用 ID', render: (_, r) => r.appId || r.app_id }, { title: '套餐 ID', render: (_, r) => r.planId || r.plan_id }, { title: '金额', render: (_, r) => `￥${Number(r.amount || 0).toFixed(2)}` }, { title: '支付方式', dataIndex: 'paymentMethod' }, { title: '状态', dataIndex: 'status', render: (v: boolean) => <Tag color={v ? 'green' : 'gold'}>{v ? '已支付' : '待支付'}</Tag> }, { title: '创建时间', render: (_, r) => time(r.createTime) }]} /></Card></div> }
