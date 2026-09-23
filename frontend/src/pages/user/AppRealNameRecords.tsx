import { formatChinaTime } from '@/utils/time'
import type { ColumnsType } from 'antd/es/table'
import { Tag } from 'antd'
import { userApi } from '@/api'
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
  { title: '应用', dataIndex: 'app_name', width: 170, ellipsis: true },
  { title: '套餐', dataIndex: 'plan_name', width: 160, ellipsis: true },
  { title: '姓名', dataIndex: 'real_name', width: 100 },
  { title: '身份证号', dataIndex: 'id_card', width: 170 },
  { title: '支付宝账号', dataIndex: 'alipay_account', width: 170, ellipsis: true },
  { title: '认证流水号', dataIndex: 'verify_id', width: 220, ellipsis: true },
  { title: '状态', dataIndex: 'status', width: 110, render: statusTag },
  { title: '结果说明', dataIndex: 'verify_message', width: 190, ellipsis: true },
  { title: '发起时间', dataIndex: 'create_time', width: 170, render: formatTime },
  { title: '更新时间', dataIndex: 'update_time', width: 170, render: formatTime },
]

export default function AppRealNameRecords() {
  return (
    <DataTable
      title="实名调用记录"
      load={userApi.getAppRealNameRecords}
      columns={columns}
      searchKey="verify_id"
      searchLabel="认证流水号"
      statusOptions={[
        { value: 'pending', label: '认证中' },
        { value: 'success', label: '认证成功' },
        { value: 'failed', label: '认证失败' },
      ]}
    />
  )
}
