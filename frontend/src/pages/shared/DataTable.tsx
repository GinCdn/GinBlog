import { useEffect, useRef, useState } from 'react'
import { Button, Card, DatePicker, Input, InputNumber, Select, Space, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { PageResponse } from '@/types'

interface Props {
  title: string
  load: (params: Record<string, unknown>) => Promise<{ data: PageResponse }>
  columns: ColumnsType<Record<string, unknown>>
  searchKey?: string
  searchLabel?: string
  statusOptions?: { label: string; value: string | number | boolean }[]
  statusLabel?: string
  filters?: FilterField[]
  extra?: React.ReactNode
  reloadKey?: string
}

type FilterField = {
  key: string
  label: string
  type?: 'input' | 'number' | 'select' | 'datetime'
  options?: { label: string; value: string | number | boolean }[]
}

export default function DataTable({ title, load, columns, searchKey = 'username', searchLabel = '用户名', statusOptions, statusLabel = '状态', filters = [], extra, reloadKey }: Props) {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<string | number | undefined>()
  const [filterValues, setFilterValues] = useState<Record<string, string | number | boolean | undefined>>({})
  const requestId = useRef(0)

  const fetchData = async (nextPage = page, nextPageSize = pageSize) => {
    const currentRequestId = ++requestId.current
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page: nextPage, page_size: nextPageSize }
      if (keyword) params[searchKey] = keyword
      if (status !== undefined) params.status = status
      Object.entries(filterValues).forEach(([key, value]) => {
        if (value !== undefined && value !== '') params[key] = value
      })
      const res = await load(params)
      const data = (res.data || {}) as PageResponse & { data?: PageResponse }
      const payload = data.data && !data.list ? data.data : data
      if (currentRequestId !== requestId.current) return
      setRows(Array.isArray(payload.list) ? payload.list as Record<string, unknown>[] : [])
      setTotal(Number(payload.total || payload.pagination?.total || 0))
      setPage(nextPage)
    } finally {
      if (currentRequestId === requestId.current) setLoading(false)
    }
  }

  // 路由复用同一个表格组件时，页面类型变化需要重新加载对应列表。
  useEffect(() => { void fetchData(1, pageSize) }, [reloadKey])

  return <div className="admin-page"><Card className="admin-panel admin-table" title={title} extra={extra} bordered={false}>
    <Space wrap className="table-filter">
      <Input allowClear placeholder={`按${searchLabel}筛选`} value={keyword} onChange={(event) => setKeyword(event.target.value)} onPressEnter={() => void fetchData(1)} />
      {statusOptions && <Select allowClear placeholder={statusLabel} value={status} onChange={setStatus} options={statusOptions} />}
      {filters.map((filter) => {
        const value = filterValues[filter.key]
        const setValue = (next: string | number | boolean | undefined) => setFilterValues((current) => ({ ...current, [filter.key]: next }))
        if (filter.type === 'select') return <Select key={filter.key} allowClear placeholder={filter.label} value={value} options={filter.options} onChange={setValue} />
        if (filter.type === 'number') return <InputNumber key={filter.key} min={0.01} precision={2} placeholder={filter.label} value={value as number | undefined} onChange={(next) => setValue(next ?? undefined)} />
        if (filter.type === 'datetime') return <DatePicker key={filter.key} showTime allowClear placeholder={filter.label} format="YYYY-MM-DD HH:mm:ss" value={value ? dayjs(String(value)) : null} onChange={(date) => setValue(date ? date.format('YYYY-MM-DD HH:mm:ss') : undefined)} />
        return <Input key={filter.key} allowClear placeholder={filter.label} value={value as string | undefined} onChange={(event) => setValue(event.target.value)} onPressEnter={() => void fetchData(1)} />
      })}
      <Button type="primary" onClick={() => void fetchData(1)}>查询</Button>
      <Button onClick={() => { setKeyword(''); setStatus(undefined); setFilterValues({}); setPageSize(20); void fetchData(1, 20) }}>重置</Button>
    </Space>
    <Table<Record<string, unknown>> rowKey={(item) => String(item.id || item.tradeNo || item.trade_no)} columns={columns} dataSource={rows} loading={loading} scroll={{ x: 760 }} pagination={{ current: page, total, pageSize, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: (value) => `共 ${value} 条`, onChange: (next, nextPageSize) => { if (nextPageSize !== pageSize) { setPageSize(nextPageSize); void fetchData(1, nextPageSize); return } void fetchData(next, nextPageSize) } }} />
  </Card></div>
}

export const statusTag = (value: unknown) => {
  const text = value === true || value === 1 ? '已完成' : value === 2 ? '已拒绝' : value === 3 ? '已打款' : '待处理'
  const color = value === true || value === 1 ? 'green' : value === 2 ? 'red' : value === 3 ? 'blue' : 'gold'
  return <Tag color={color}>{text}</Tag>
}
