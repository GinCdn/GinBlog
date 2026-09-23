import { formatChinaTime } from '@/utils/time'
import { useState } from 'react'
import { Button, Descriptions, Form, Input, message, Modal, Select, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { adminApi } from '@/api'
import DataTable from '@/pages/shared/DataTable'

type Kind = 'recharge' | 'order' | 'promotionUsers' | 'invites' | 'commissions' | 'withdrawals'
type Row = Record<string, any>

const time = (value: unknown) => formatChinaTime(value)
const money = (value: unknown) => `￥${Number(value || 0).toFixed(2)}`
const field = (row: Row, camel: string, snake: string) => row[camel] ?? row[snake]
const methodName = (value: unknown) => ({ alipay: '支付宝', wechat: '微信', bank: '银行卡' } as Record<string, string>)[String(value)] || String(value || '-')
const payTypeName = (value: unknown) => ({ alipay: '支付宝', wxpay: '微信', wechat: '微信', balance: '余额支付' } as Record<string, string>)[String(value)] || '-'

function paidTag(value: unknown) { return value === true ? <Tag color="green">已支付</Tag> : <Tag color="gold">未支付</Tag> }
function commissionTag(value: unknown) {
  const status = Number(value)
  return status === 1 ? <Tag color="green">已结算</Tag> : status === 2 ? <Tag color="blue">已提现</Tag> : <Tag color="gold">待结算</Tag>
}
function withdrawalTag(value: unknown) {
  const status = Number(value)
  return status === 1 ? <Tag color="green">已通过</Tag> : status === 2 ? <Tag color="red">已拒绝</Tag> : status === 3 ? <Tag color="blue">已打款</Tag> : <Tag color="gold">待审核</Tag>
}

function WithdrawalDetails({ record }: { record: Row }) {
  const method = String(record.method)
  const items: any[] = [{ key: 'name', label: '收款人姓名', children: record.real_name || '-' }, { key: 'method', label: '提现方式', children: methodName(method) }]
  if (method === 'alipay') items.push({ key: 'account', label: '支付宝账号', children: record.alipay_account || '-' }, { key: 'qrcode', label: '收款二维码', children: record.alipay_qrcode ? <a href={record.alipay_qrcode} target="_blank" rel="noreferrer">查看图片</a> : '-' })
  if (method === 'wechat') items.push({ key: 'account', label: '微信号', children: record.wechat_account || '-' }, { key: 'qrcode', label: '收款二维码', children: record.wechat_qrcode ? <a href={record.wechat_qrcode} target="_blank" rel="noreferrer">查看图片</a> : '-' })
  if (method === 'bank') items.push({ key: 'card', label: '银行卡号', children: record.bank_card || '-' }, { key: 'phone', label: '预留手机号', children: record.bank_phone || '-' })
  return <Descriptions column={1} size="small" items={items} />
}

function withdrawalAccount(record: Row) {
  const method = String(record.method || '')
  if (method === 'alipay') return record.alipay_account || '-'
  if (method === 'wechat') return record.wechat_account || '-'
  if (method === 'bank') return record.bank_card || '-'
  return '-'
}

export default function Records({ kind }: { kind: Kind }) {
  const [detail, setDetail] = useState<Row | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const review = (record: Row) => {
    let status = 1
    let rejectReason = ''
    Modal.confirm({
      title: '处理提现申请',
      content: <Form layout="vertical"><Form.Item label="审核结果"><Select defaultValue={1} options={[{ value: 1, label: '通过' }, { value: 2, label: '拒绝' }, { value: 3, label: '标记已打款' }]} onChange={(value) => { status = value }} /></Form.Item><Form.Item label="拒绝原因"><Input.TextArea rows={3} maxLength={200} placeholder="拒绝时必须填写" onChange={(event) => { rejectReason = event.target.value }} /></Form.Item></Form>,
      onOk: async () => {
        if (status === 2 && !rejectReason.trim()) { message.error('拒绝提现时必须填写原因'); return Promise.reject() }
        // 后端审核接口使用 action 与 reason 参数
        const actionMap: Record<number, string> = { 1: 'approve', 2: 'reject', 3: 'paid' } as const
        const res = await adminApi.reviewWithdrawal({ id: record.id, action: actionMap[status], reason: rejectReason.trim() })
        if (res.code === 200) { message.success(res.msg || '处理成功'); setReloadVersion((value) => value + 1); return }
        throw new Error(res.msg || '处理失败')
      },
    })
  }

  const specs: Record<Kind, { title: string; load: any; columns: ColumnsType<Row>; searchKey?: string; searchLabel?: string; statusOptions?: { label: string; value: string | number | boolean }[]; statusLabel?: string; filters?: { key: string; label: string; type?: 'input' | 'number' | 'select' | 'datetime'; options?: { label: string; value: string | number | boolean }[] }[] }> = {
    recharge: { title: '充值记录管理', load: adminApi.getRechargeOrders, columns: [
      { title: '记录ID', dataIndex: 'id', width: 90 },
      { title: '用户名', dataIndex: 'username', width: 150, ellipsis: true },
      { title: '订单号', dataIndex: 'tradeNo', width: 210, render: (_, row) => field(row, 'tradeNo', 'trade_no'), ellipsis: true },
      { title: '金额(元)', dataIndex: 'amount', width: 110, render: money },
      { title: '支付方式', dataIndex: 'payType', width: 110, render: (_, row) => payTypeName(field(row, 'payType', 'pay_type')) },
      { title: '支付状态', dataIndex: 'status', width: 110, render: paidTag },
      { title: '创建时间', dataIndex: 'createTime', width: 180, render: (_, row) => time(field(row, 'createTime', 'create_time')) },
      { title: '支付时间', dataIndex: 'payTime', width: 180, render: (_, row) => time(field(row, 'payTime', 'pay_time')) },
      { title: '备注', dataIndex: 'remark', width: 180, render: (value) => value || '-', ellipsis: true },
    ], filters: [
      { key: 'trade_no', label: '充值订单号' },
      { key: 'pay_type', label: '支付方式', type: 'select', options: [{ label: '支付宝', value: 'alipay' }, { label: '微信', value: 'wxpay' }, { label: '余额支付', value: 'balance' }] },
      { key: 'min_amount', label: '最小金额', type: 'number' },
      { key: 'max_amount', label: '最大金额', type: 'number' },
    ], statusOptions: [{ label: '已支付', value: true }, { label: '未支付', value: false }], statusLabel: '支付状态' },
    order: { title: '支付订单', load: adminApi.getPayOrders, columns: [
      { title: '订单ID', dataIndex: 'id', width: 90 }, { title: '订单号', width: 210, render: (_, row) => field(row, 'tradeNo', 'trade_no'), ellipsis: true }, { title: '订单名称', width: 180, render: (_, row) => field(row, 'name', 'name') || '-', ellipsis: true }, { title: '用户', dataIndex: 'username', width: 150, ellipsis: true }, { title: '支付方式', width: 110, render: (_, row) => payTypeName(field(row, 'payType', 'pay_type')) }, { title: '金额', width: 110, render: (_, row) => money(field(row, 'money', 'money') ?? field(row, 'amount', 'amount')) }, { title: '支付状态', dataIndex: 'status', width: 110, render: paidTag }, { title: '创建时间', width: 180, render: (_, row) => time(field(row, 'createTime', 'create_time')) }, { title: '支付时间', width: 180, render: (_, row) => time(field(row, 'payTime', 'pay_time')) },
    ], filters: [
      { key: 'trade_no', label: '订单号' },
      { key: 'pay_type', label: '支付方式', type: 'select', options: [{ label: '支付宝', value: 'alipay' }, { label: '微信', value: 'wxpay' }, { label: '余额支付', value: 'balance' }] },
      { key: 'start_time', label: '开始时间', type: 'datetime' },
      { key: 'end_time', label: '结束时间', type: 'datetime' },
    ], statusOptions: [{ label: '未支付', value: false }, { label: '已支付', value: true }], statusLabel: '订单状态' },
    promotionUsers: { title: '推广用户', load: adminApi.getPromotionUsers, columns: [
      { title: 'ID', dataIndex: 'id', width: 80 }, { title: '用户名', dataIndex: 'username', width: 160, ellipsis: true }, { title: '推广码', dataIndex: 'promo_code', width: 170 }, { title: '邀请人数', dataIndex: 'invitee_count', width: 120 }, { title: '累计佣金', dataIndex: 'total_commission', width: 130, render: money }, { title: '开通时间', dataIndex: 'createTime', width: 180, render: (_, row) => time(field(row, 'createTime', 'create_time')) },
    ] },
    invites: { title: '邀请关系', load: adminApi.getInviteRelations, searchKey: 'inviter_name', searchLabel: '邀请人', filters: [{ key: 'invitee_name', label: '被邀请人' }], columns: [
      { title: 'ID', dataIndex: 'id', width: 80 }, { title: '邀请人ID', dataIndex: 'inviter_id', width: 100 }, { title: '邀请人', dataIndex: 'inviter_name', width: 180, ellipsis: true }, { title: '被邀请人ID', dataIndex: 'invitee_id', width: 110 }, { title: '被邀请人', dataIndex: 'invitee_name', width: 180, ellipsis: true }, { title: '绑定时间', dataIndex: 'createTime', width: 180, render: (_, row) => time(field(row, 'createTime', 'create_time')) },
    ] },
    commissions: { title: '佣金记录', load: adminApi.getCommissions, searchKey: 'inviter_name', searchLabel: '邀请人', statusOptions: [{ label: '待结算', value: 0 }, { label: '已结算', value: 1 }, { label: '已提现', value: 2 }], columns: [
      { title: '邀请人', dataIndex: 'inviter_name', width: 150, ellipsis: true }, { title: '被邀请人', dataIndex: 'invitee_name', width: 150, ellipsis: true }, { title: '订单号', dataIndex: 'order_no', width: 190, ellipsis: true }, { title: '订单金额', dataIndex: 'order_amount', width: 120, render: money }, { title: '返佣比例', dataIndex: 'rebate_rate', width: 110, render: (value) => `${Number(value || 0)}%` }, { title: '佣金金额', dataIndex: 'amount', width: 120, render: money }, { title: '状态', dataIndex: 'status', width: 110, render: commissionTag }, { title: '创建时间', dataIndex: 'createTime', width: 180, render: (_, row) => time(field(row, 'createTime', 'create_time')) },
    ] },
    withdrawals: { title: '提现审核', load: adminApi.getWithdrawals, statusOptions: [{ label: '待审核', value: 0 }, { label: '通过', value: 1 }, { label: '拒绝', value: 2 }, { label: '已打款', value: 3 }], filters: [{ key: 'method', label: '提现方式', type: 'select', options: [{ label: '支付宝', value: 'alipay' }, { label: '微信', value: 'wechat' }, { label: '银行卡', value: 'bank' }] }], columns: [
      { title: '用户', dataIndex: 'username', width: 150, ellipsis: true }, { title: '金额', dataIndex: 'amount', width: 110, render: money }, { title: '方式', dataIndex: 'method', width: 110, render: methodName }, { title: '收款账号', width: 180, ellipsis: true, render: (_, row) => withdrawalAccount(row) }, { title: '收款信息', width: 110, render: (_, row) => <Button type="link" onClick={() => setDetail(row)}>查看</Button> }, { title: '状态', dataIndex: 'status', width: 110, render: withdrawalTag }, { title: '拒绝原因', dataIndex: 'reject_reason', width: 180, ellipsis: true, render: (value) => value || '-' }, { title: '申请时间', dataIndex: 'createTime', width: 180, render: (_, row) => time(field(row, 'createTime', 'create_time')) }, { title: '审核时间', dataIndex: 'review_time', width: 180, render: (_, row) => time(field(row, 'reviewTime', 'review_time')) }, { title: '操作', fixed: 'right', width: 100, render: (_, row) => Number(row.status) === 0 ? <Button type="link" onClick={() => review(row)}>审核</Button> : '-' },
    ] },
  }
  return <><DataTable {...specs[kind]} reloadKey={`${kind}-${reloadVersion}`} /><Modal title="提现收款信息" open={Boolean(detail)} footer={null} onCancel={() => setDetail(null)} destroyOnClose>{detail && <WithdrawalDetails record={detail} />}</Modal></>
}
