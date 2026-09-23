import { useEffect, useState } from 'react'
import { Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Upload, message, type UploadProps } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, SettingOutlined, UploadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '@/api'
import type { App, AppCategory } from '@/types'
import { getToken } from '@/utils/auth'

const providerName = '支付宝实名信息'

export default function Apps() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<App[]>([])
  const [categories, setCategories] = useState<AppCategory[]>([])
  const [editing, setEditing] = useState<App | null>(null)
  const [form] = Form.useForm()

  const load = async () => {
    const [apps, cats] = await Promise.all([adminApi.getApps(), adminApi.getAppCategories()])
    setRows(apps.data || [])
    setCategories(cats.data || [])
  }

  useEffect(() => { void load() }, [])

  const logoUpload: UploadProps = {
    action: '/api/admin/upload',
    name: 'file',
    accept: 'image/png,image/jpeg,image/gif',
    showUploadList: false,
    headers: { Authorization: `Bearer ${getToken('admin') || ''}` },
    onChange: ({ file }) => {
      if (file.status === 'done') {
        const result = file.response as { code?: number; msg?: string; data?: string }
        if (result.code === 200 && result.data) {
          form.setFieldValue('logo', result.data)
          message.success('Logo 上传成功')
        } else {
          message.error(result.msg || 'Logo 上传失败')
        }
      }
      if (file.status === 'error') message.error('Logo 上传失败')
    },
  }

  const save = async (values: Partial<App>) => {
    const res = await adminApi.saveApp({ ...values, id: editing?.id, providerName })
    if (res.code !== 200) throw new Error(res.msg)
    message.success('应用保存成功')
    setEditing(null)
    await load()
  }

  const create = () => {
    setEditing({ id: 0, name: '', slug: '', providerName })
    form.resetFields()
    form.setFieldsValue({ providerName, status: true, requireRealName: false })
  }

  const remove = (row: App) => Modal.confirm({
    title: '删除应用',
    content: '应用存在套餐、接口或订单时不能删除，确定继续吗？',
    onOk: async () => {
      const res = await adminApi.deleteApp(row.id)
      if (res.code !== 200) throw new Error(res.msg)
      await load()
    },
  })

  return <div className="admin-page">
    <Card className="admin-panel admin-table" bordered={false} title="应用管理" extra={<Button type="primary" icon={<PlusOutlined />} onClick={create}>新增应用</Button>}>
      <Table rowKey="id" dataSource={rows} columns={[
        { title: '应用', render: (_, row) => <Space>{row.logo ? <img src={row.logo} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} /> : null}<span>{row.name}</span></Space> },
        { title: '服务商', render: () => providerName },
        { title: '套餐价格', render: (_, row) => row.plans?.length ? row.plans.map((plan) => `¥${Number(plan.price).toFixed(2)}`).join(' / ') : '-' },
        { title: '套餐额度', render: (_, row) => row.plans?.length ? row.plans.map((plan) => plan.quota ? `${plan.quota}${plan.quotaUnit || '次'}` : '不限').join(' / ') : '-' },
        { title: '购买实名', dataIndex: 'requireRealName', render: (v: boolean) => <Switch checked={v} disabled /> },
        { title: '状态', dataIndex: 'status', render: (v: boolean) => <Switch checked={v} disabled /> },
        { title: '操作', render: (_, row) => <Space>
          <Button type="link" icon={<SettingOutlined />} onClick={() => navigate(`/admin/apps/${row.id}`)}>套餐与接口</Button>
          <Button type="link" icon={<EditOutlined />} onClick={() => { setEditing(row); form.setFieldsValue(row) }}>编辑</Button>
          <Button danger type="link" icon={<DeleteOutlined />} onClick={() => remove(row)}>删除</Button>
        </Space> },
      ]} />
    </Card>
    <Modal title={editing?.id ? '编辑应用' : '新增应用'} open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => form.submit()} width={620} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={save}>
        <Form.Item name="name" label="应用名称" rules={[{ required: true, message: '请输入应用名称' }]}><Input /></Form.Item>
        <Form.Item name="slug" label="接口标识" rules={[{ required: true, message: '请输入接口标识' }]}><Input placeholder="例如 alipay-realname" /></Form.Item>
        <Form.Item name="categoryId" label="应用分类" rules={[{ required: true, message: '请选择应用分类' }]}><Select options={categories.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
        <Form.Item name="logo" label="应用 Logo"><Input addonAfter={<Upload {...logoUpload}><Button type="text" icon={<UploadOutlined />} /></Upload>} /></Form.Item>
        <Form.Item name="providerName" label="服务商"><Select options={[{ value: providerName, label: providerName }]} disabled /></Form.Item>
        <Form.Item name="description" label="应用说明"><Input.TextArea rows={4} /></Form.Item>
        <Form.Item name="requireRealName" label="购买前实名认证" valuePropName="checked" extra="开启后，用户需先完成实名认证才能创建该应用套餐订单。"><Switch /></Form.Item>
        <Form.Item name="status" label="启用" valuePropName="checked"><Switch /></Form.Item>
      </Form>
    </Modal>
  </div>
}
