import { formatChinaTime } from '@/utils/time'
import { useEffect, useRef, useState } from 'react'
import { Button, Col, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Tag, message } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { PageContainer, ProTable, type ActionType, type ProColumns } from '@ant-design/pro-components'
import { adminApi } from '@/api'
import type { User } from '@/types'

type UserForm = {
  nick_name?: string
  username?: string
  password?: string
  sex?: number
  qq?: string
  email?: string
  phone?: string
  money?: number
  status?: number
  role_level?: string
}

type UserPageData = {
  list?: User[]
  total?: number
  page?: number
  page_size?: number
}

const formatTime = (value: unknown) => formatChinaTime(value)

function pageData(data: unknown): UserPageData
{
  if (!data || typeof data !== 'object') return {}

  const payload = data as UserPageData & { data?: UserPageData }
  if (payload.data) return payload.data
  return payload
}

function userMoney(user: User) {
  return Number(user.money ?? user.balance ?? 0)
}

function userStatus(user: User) {
  return Number(user.status) === 2 ? 2 : 1
}

function userRoleLevel(user: User) {
  return String(user.roleLevel ?? user.role_level ?? 'default').trim() || 'default'
}

function userSex(value: unknown) {
  return Number(value) === 1 ? '男' : Number(value) === 2 ? '女' : '未知'
}

function cleanValues(values: UserForm, editing: boolean) {
  const payload: Record<string, unknown> = {}
  const textFields = ['nick_name', 'qq', 'email', 'phone'] as const
  textFields.forEach((field) => {
    const value = values[field]?.trim()
    if (!value) return
    payload[field] = value
  })
  if (!editing && values.username?.trim()) payload.username = values.username.trim()
  if (values.password?.trim()) payload.password = values.password.trim()
  if (values.sex !== undefined) payload.sex = values.sex
  if (values.money !== undefined) payload.money = values.money
  if (values.status !== undefined) payload.status = values.status
  if (values.role_level?.trim()) payload.role_level = values.role_level.trim()
  return payload
}

export default function UserManage() {
  const actionRef = useRef<ActionType>(null)
  const [form] = Form.useForm<UserForm>()
  const [editing, setEditing] = useState<User | null>(null)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [roleOptions, setRoleOptions] = useState<{ value: string; label: string }[]>([{ value: 'default', label: 'default' }])
  const modalOpen = adding || Boolean(editing)

  useEffect(() => {
    let active = true
    void adminApi.getRoleDiscounts({ page: 1, page_size: 100 }).then((result) => {
      if (!active || result.code !== 200) return
      const payload = result.data as { data?: { list?: unknown[] }; list?: unknown[] } | undefined
      const list = payload?.data?.list ?? payload?.list ?? []
      const options = list.flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const role = item as { roleLevel?: string; role_level?: string; roleName?: string; role_name?: string; status?: boolean }
        if (role.status === false) return []
        const value = String(role.roleLevel ?? role.role_level ?? '').trim()
        if (!value) return []
        return [{ value, label: String(role.roleName ?? role.role_name ?? value) }]
      })
      if (!options.some((option) => option.value === 'default')) options.unshift({ value: 'default', label: 'default' })
      if (active) setRoleOptions(options)
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  const openAdd = () => {
    form.resetFields()
    form.setFieldsValue({ sex: undefined, money: 0, status: 1, role_level: 'default' })
    setEditing(null)
    setAdding(true)
  }

  const openEdit = (user: User) => {
    form.resetFields()
    form.setFieldsValue({
      nick_name: user.nickName || '',
      username: user.username,
      sex: Number(user.sex) || undefined,
      qq: user.qq || '',
      email: user.email || '',
      phone: user.phone || '',
      money: userMoney(user),
      status: userStatus(user),
      role_level: userRoleLevel(user),
      password: undefined,
    })
    setAdding(false)
    setEditing(user)
  }

  const closeModal = () => {
    setAdding(false)
    setEditing(null)
    form.resetFields()
  }

  const submit = async () => {
    const values = await form.validateFields()
    const isEditing = Boolean(editing)
    const payload = cleanValues(values, isEditing)
    setSaving(true)
    try {
      const result = isEditing
        ? await adminApi.updateUser({ id: editing?.id, ...payload })
        : await adminApi.createUser(payload)
      if (result.code !== 200) {
        message.error(result.msg || (isEditing ? '用户更新失败' : '用户添加失败'))
        return
      }
      message.success(result.msg || (isEditing ? '用户更新成功' : '用户添加成功'))
      closeModal()
      actionRef.current?.reload()
    } catch (error) {
      message.error(error instanceof Error ? error.message : (isEditing ? '用户更新失败' : '用户添加失败'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (user: User) => {
    try {
      const result = await adminApi.deleteUser(user.id)
      if (result.code !== 200) {
        message.error(result.msg || '用户删除失败')
        return
      }
      message.success(result.msg || '用户删除成功')
      actionRef.current?.reload()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '用户删除失败')
    }
  }

  const columns: ProColumns<User>[] = [
    { title: '用户 ID', dataIndex: 'id', width: 90, valueType: 'digit', fieldProps: { min: 1, precision: 0 } },
    { title: '昵称', dataIndex: 'nickName', width: 150, ellipsis: true, search: false, render: (_, user) => user.nickName || '-' },
    { title: '账号', dataIndex: 'username', width: 160, ellipsis: true },
    { title: '等级', dataIndex: 'roleLevel', width: 120, ellipsis: true, search: false, render: (_, user) => userRoleLevel(user) },
    { title: '性别', dataIndex: 'sex', width: 82, valueType: 'select', valueEnum: { 1: '男', 2: '女' }, render: (_, user) => userSex(user.sex) },
    { title: 'QQ', dataIndex: 'qq', width: 130, ellipsis: true },
    { title: '邮箱', dataIndex: 'email', width: 220, ellipsis: true },
    { title: '电话', dataIndex: 'phone', width: 150, ellipsis: true, search: false },
    {
      title: '实名信息',
      dataIndex: 'real_name_info',
      width: 200,
      search: false,
      render: (_, user) => {
        const info = user.real_name_info
        if (!info) return <Tag>未实名</Tag>
        return (
          <Space direction="vertical" size={0}>
            <Space size={6}>
              <span>{info.real_name || '-'}</span>
              <Tag color={info.verify_status ? 'success' : 'processing'}>{info.verify_status ? '已认证' : '待审核'}</Tag>
            </Space>
            <span>{info.id_card || '-'}</span>
          </Space>
        )
      },
    },
    { title: '余额', dataIndex: 'money', width: 110, search: false, render: (_, user) => `￥${userMoney(user).toFixed(2)}` },
    { title: '状态', dataIndex: 'status', width: 100, valueType: 'select', valueEnum: { 1: '正常', 2: '封禁' }, render: (_, user) => userStatus(user) === 1 ? <Tag color="success">正常</Tag> : <Tag color="error">封禁</Tag> },
    { title: '创建时间', dataIndex: 'createTime', width: 180, search: false, render: (_, user) => formatTime(user.createTime || user.create_time) },
    { title: '更新时间', dataIndex: 'updateTime', width: 180, search: false, render: (_, user) => formatTime(user.updateTime || user.update_time) },
    {
      title: '操作',
      valueType: 'option',
      width: 150,
      fixed: 'right',
      render: (_, user) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(user)}>编辑</Button>
          <Popconfirm title="确定删除此用户吗？" description="删除后用户数据将无法恢复。" onConfirm={() => void remove(user)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <PageContainer
      title="用户管理"
      subTitle="管理系统所有用户，支持筛选、分页、编辑和删除操作"
      extra={<Button icon={<ReloadOutlined />} onClick={() => actionRef.current?.reload()}>刷新</Button>}
      className="admin-page-container"
    >
      <ProTable<User>
        className="admin-table"
        actionRef={actionRef}
        columns={columns}
        rowKey="id"
        search={{ labelWidth: 64, defaultCollapsed: false, span: 6 }}
        toolBarRender={() => [<Button key="add" type="primary" icon={<PlusOutlined />} onClick={openAdd}>添加用户</Button>]}
        options={{ density: true, fullScreen: true, reload: true, setting: true }}
        scroll={{ x: 1780 }}
        pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], showSizeChanger: true }}
        request={async (params) => {
          const result = await adminApi.getUserList({
            page: params.current || 1,
            page_size: params.pageSize || 20,
            id: params.id,
            username: params.username,
            qq: params.qq,
            email: params.email,
            sex: params.sex,
            status: params.status,
          })
          const data = pageData(result.data)
          return { data: data.list || [], total: Number(data.total || 0), success: result.code === 200 }
        }}
      />

      <Modal
        title={adding ? '添加用户' : `编辑用户 #${editing?.id || ''}`}
        width={820}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void submit()}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="nick_name" label="昵称" rules={[{ max: 32, message: '昵称不能超过 32 个字符' }]}>
                <Input maxLength={32} placeholder="请输入用户昵称（选填）" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="username" label="账号" rules={adding ? [{ required: true, message: '请输入账号' }, { max: 32, message: '账号不能超过 32 个字符' }] : undefined}>
                <Input disabled={!adding} maxLength={32} placeholder={adding ? '请输入账号' : '账号不可修改'} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="password" label={adding ? '密码' : '重置密码'} rules={adding ? [{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少 6 位' }] : [{ min: 6, message: '密码至少 6 位' }]} extra={adding ? '密码至少 6 位' : '留空则不修改用户密码'}>
                <Input.Password autoComplete="new-password" placeholder={adding ? '请输入密码' : '留空则不修改'} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="sex" label="性别">
                <Select allowClear placeholder="请选择性别" options={[{ value: 1, label: '男' }, { value: 2, label: '女' }]} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="qq" label="QQ" rules={[{ max: 10, message: 'QQ 不能超过 10 位' }]}>
                <Input maxLength={10} placeholder="请输入 QQ（选填）" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="email" label="邮箱" rules={adding ? [{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入有效的邮箱地址' }] : [{ type: 'email', message: '请输入有效的邮箱地址' }]}>
                <Input placeholder={adding ? '请输入邮箱' : '请输入邮箱（选填）'} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="phone" label="电话" rules={[{ max: 64, message: '电话不能超过 64 个字符' }]}>
                <Input maxLength={64} placeholder="请输入电话号码（选填）" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="money" label="余额" rules={[{ required: adding, message: '请输入余额' }]}>
                <InputNumber min={0} precision={2} step={0.01} addonAfter="元" style={{ width: '100%' }} placeholder="请输入余额" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="role_level" label="等级">
                <Select options={roleOptions} disabled={adding} placeholder="选择用户等级" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择账户状态' }]}>
                <Select options={[{ value: 1, label: '正常' }, { value: 2, label: '封禁' }]} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </PageContainer>
  )
}
