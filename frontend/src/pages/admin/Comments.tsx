import { formatChinaTime } from '@/utils/time'
import { useEffect, useState } from 'react'
import { Button, Card, Col, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import { CheckOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import { adminApi } from '@/api'
import type { Comment, PageResponse } from '@/types'

interface CommentFilterValues {
  articleId?: number
  content?: string
  status?: number
  parentId?: number
}

interface CommentPage {
  list: Comment[]
  total: number
  page: number
  pageSize: number
}

type ApiRecord = Record<string, unknown>

const statusOptions = [
  { value: 0, label: '待审核' },
  { value: 1, label: '已通过' },
  { value: 2, label: '已拒绝' },
  { value: 3, label: '垃圾评论' },
]

const statusTag = (status: number) => {
  if (status === 1) return <Tag color="green">已通过</Tag>
  if (status === 2) return <Tag color="orange">已拒绝</Tag>
  if (status === 3) return <Tag color="red">垃圾评论</Tag>
  return <Tag color="gold">待审核</Tag>
}

const displayTime = (value?: string) => formatChinaTime(value)

/** 兼容后端评论接口的驼峰字段和下划线字段。 */
function normalizeComment(value: unknown): Comment {
  const source = (value || {}) as ApiRecord
  const get = <T,>(...keys: string[]) => {
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null) return source[key] as T
    }
    return undefined
  }
  return {
    id: Number(get<number>('id', 'ID') || 0),
    articleId: Number(get<number>('articleId', 'article_id', 'ArticleID') || 0),
    content: String(get<string>('content', 'Content') || ''),
    userId: Number(get<number>('userId', 'user_id', 'UserID') || 0),
    nickName: String(get<string>('nickName', 'nick_name', 'NickName') || ''),
    email: String(get<string>('email', 'Email') || ''),
    parentId: Number(get<number>('parentId', 'parent_id', 'ParentID') || 0),
    isAuthor: Boolean(get<boolean>('isAuthor', 'is_author', 'IsAuthor')),
    status: Number(get<number>('status', 'Status') || 0),
    ip: String(get<string>('ip', 'IP') || ''),
    createTime: String(get<string>('createTime', 'create_time', 'CreateTime') || ''),
    updateTime: String(get<string>('updateTime', 'update_time', 'UpdateTime') || ''),
  }
}

/** 从评论接口响应中提取列表和分页信息。 */
function extractCommentPage(value: unknown, fallbackPage: number, fallbackPageSize: number): CommentPage {
  const source = (value || {}) as ApiRecord
  const listValue = source.list ?? source.data
  const list = Array.isArray(listValue) ? listValue.map(normalizeComment) : []
  const total = Number(source.total || 0)
  const page = Number(source.page || fallbackPage)
  const pageSize = Number(source.page_size || source.pageSize || fallbackPageSize)
  return { list, total, page, pageSize }
}

/** 管理员评论管理页面，提供筛选、分页、审核和删除操作。 */
export default function Comments() {
  const [filterForm] = Form.useForm<CommentFilterValues>()
  const [reviewForm] = Form.useForm<{ status: number }>()
  const [rows, setRows] = useState<Comment[]>([])
  const [loading, setLoading] = useState(false)
  const [reviewing, setReviewing] = useState<Comment | null>(null)
  const [reviewingLoading, setReviewingLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [filters, setFilters] = useState<CommentFilterValues>({})
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 })

  const loadComments = async (page = pagination.page, pageSize = pagination.pageSize, nextFilters = filters) => {
    setLoading(true)
    try {
      const result = await adminApi.getAdminComments({
        page,
        page_size: pageSize,
        article_id: nextFilters.articleId,
        content: nextFilters.content?.trim() || undefined,
        status: nextFilters.status,
        parent_id: nextFilters.parentId,
      })
      const pageData = extractCommentPage(result.data as PageResponse<Comment>, page, pageSize)
      setRows(pageData.list)
      setPagination({ page: pageData.page, pageSize: pageData.pageSize, total: pageData.total })
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadComments(1, 20, {})
  }, [])

  const search = async () => {
    const values = await filterForm.validateFields()
    setFilters(values)
    await loadComments(1, pagination.pageSize, values)
  }

  const reset = async () => {
    filterForm.resetFields()
    setFilters({})
    await loadComments(1, 20, {})
  }

  const openReview = (comment: Comment) => {
    setReviewing(comment)
    reviewForm.setFieldsValue({ status: 1 })
  }

  const submitReview = async () => {
    if (!reviewing) return
    const values = await reviewForm.validateFields()
    setReviewingLoading(true)
    try {
      await adminApi.updateAdminComment({ id: reviewing.id, status: values.status })
      message.success('评论审核成功')
      setReviewing(null)
      await loadComments()
    } finally {
      setReviewingLoading(false)
    }
  }

  const remove = async (id: number) => {
    setDeletingId(id)
    try {
      await adminApi.deleteAdminComment(id)
      message.success('评论删除成功')
      await loadComments()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="admin-page">
      <Card
        className="admin-panel"
        title={<div><Typography.Title level={4} style={{ margin: 0 }}>评论管理</Typography.Title><Typography.Text type="secondary">管理网站所有评论，支持筛选、分页、审核和删除操作</Typography.Text></div>}
        extra={<Button icon={<ReloadOutlined />} onClick={() => void loadComments()} loading={loading}>刷新</Button>}
      >
        <Card size="small" className="admin-filter-card" style={{ marginBottom: 16 }}>
          <Form form={filterForm} layout="vertical" onFinish={() => void search()}>
            <Row gutter={[16, 0]}>
              <Col xs={24} sm={12} md={6}>
                <Form.Item label="文章ID" name="articleId"><InputNumber min={1} precision={0} placeholder="请输入文章ID" style={{ width: '100%' }} /></Form.Item>
              </Col>
              <Col xs={24} sm={12} md={7}>
                <Form.Item label="评论内容" name="content"><Input allowClear placeholder="请输入内容关键词" /></Form.Item>
              </Col>
              <Col xs={24} sm={12} md={5}>
                <Form.Item label="评论状态" name="status"><Select allowClear options={statusOptions} placeholder="全部状态" /></Form.Item>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Form.Item label="父评论ID" name="parentId"><InputNumber min={0} precision={0} placeholder="请输入父评论ID" style={{ width: '100%' }} /></Form.Item>
              </Col>
              <Col xs={24} md={4}>
                <Form.Item label="操作"><Space><Button type="primary" htmlType="submit">搜索</Button><Button onClick={() => void reset()}>重置</Button></Space></Form.Item>
              </Col>
            </Row>
          </Form>
        </Card>

        <Table<Comment>
          className="admin-table"
          rowKey="id"
          loading={loading}
          dataSource={rows}
          tableLayout="fixed"
          scroll={{ x: 1320 }}
          pagination={{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => void loadComments(page, pageSize),
          }}
          columns={[
            { title: '评论ID', dataIndex: 'id', width: 80 },
            { title: '文章ID', dataIndex: 'articleId', width: 90 },
            { title: '评论内容', dataIndex: 'content', width: 280, render: (value: string) => <Tooltip title={value}><Typography.Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0 }}>{value || '-'}</Typography.Paragraph></Tooltip> },
            { title: '评论人', width: 190, render: (_: unknown, record: Comment) => <Space direction="vertical" size={0}><span>{record.nickName || '游客'}</span><Typography.Text type="secondary">{record.email || '-'}</Typography.Text></Space> },
            { title: '是否作者', dataIndex: 'isAuthor', width: 100, render: (value: boolean) => value ? <Tag color="blue">是</Tag> : '否' },
            { title: '状态', dataIndex: 'status', width: 110, render: (value: number) => statusTag(value) },
            { title: 'IP地址', dataIndex: 'ip', width: 140, render: (value: string) => value || '-' },
            { title: '创建时间', dataIndex: 'createTime', width: 180, render: (value: string) => displayTime(value) },
            { title: '更新时间', dataIndex: 'updateTime', width: 180, render: (value: string) => displayTime(value) },
            { title: '操作', width: 170, fixed: 'right', render: (_: unknown, record: Comment) => <Space><Button size="small" type="link" icon={<CheckOutlined />} disabled={record.status !== 0} onClick={() => openReview(record)}>审核</Button><Popconfirm title="确定删除这条评论吗？" onConfirm={() => void remove(record.id)}><Button size="small" type="link" danger loading={deletingId === record.id} icon={<DeleteOutlined />}>删除</Button></Popconfirm></Space> },
          ]}
        />
      </Card>

      <Modal title="审核评论" open={Boolean(reviewing)} onCancel={() => setReviewing(null)} onOk={() => void submitReview()} okText="提交审核" cancelText="取消" confirmLoading={reviewingLoading} destroyOnHidden>
        <Form form={reviewForm} layout="vertical">
          <Form.Item label="评论内容"><Typography.Paragraph ellipsis={{ rows: 3 }} style={{ marginBottom: 0 }}>{reviewing?.content || '-'}</Typography.Paragraph></Form.Item>
          <Form.Item label="审核结果" name="status" rules={[{ required: true, message: '请选择审核结果' }]}>
            <Select options={[{ value: 1, label: '通过' }, { value: 2, label: '拒绝' }, { value: 3, label: '标记为垃圾评论' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}