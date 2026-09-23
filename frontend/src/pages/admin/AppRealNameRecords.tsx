import { formatChinaTime } from '@/utils/time'
import type { ColumnsType } from 'antd/es/table'
import { Tag } from 'antd'
import { adminApi } from '@/api'
import DataTable from '@/pages/shared/DataTable'

type Row = Record<string, unknown>

const formatTime = (value: unknown) => formatChinaTime(value)

function statusTag(value: unknown) {
  const status = String(value || '')
  if (status === 'success') return <Tag color="green">认证成功</Tag>
  if (status === 'failed') return <Tag color="red">认证失败</Tag>
  return <Tag color="gold">认证中</Tag>
}

const columns: ColumnsType<Row> = [
  { title: '用户', dataIndex: 'username', width: 120, ellipsis: true },
  { title: '应用', dataIndex: 'app_name', width: 160, ellipsis: true },
  { title: '套餐', dataIndex: 'plan_name', width: 150, ellipsis: true },
  { title: '姓名', dataIndex: 'real_name', width: 100 },
  { title: '身份证号', dataIndex: 'id_card', width: 170 },
  { title: '支付宝账号', dataIndex: 'alipay_account', width: 170, ellipsis: true },
  { title: '认证流水号', dataIndex: 'verify_id', width: 210, ellipsis: true },
  { title: '状态', dataIndex: 'status', width: 110, render: statusTag },
  { title: '结果说明', dataIndex: 'verify_message', width: 180, ellipsis: true },
  { title: '发起时间', dataIndex: 'create_time', width: 170, render: formatTime },
  { title: '更新时间', dataIndex: 'update_time', width: 170, render: formatTime },
]

export default function AppRealNameRecords() {
  return (
    <DataTable
      title="应用实名调用记录"
      load={adminApi.getAppRealNameRecords}
      columns={columns}
      searchLabel="用户名"
      statusOptions={[
        { value: 'pending', label: '认证中' },
        { value: 'success', label: '认证成功' },
        { value: 'failed', label: '认证失败' },
      ]}
      filters={[
        { key: 'app_id', label: '应用 ID', type: 'number' },
        { key: 'verify_id', label: '认证流水号' },
      ]}
    />
  )
}
