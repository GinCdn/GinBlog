import { useEffect, useState } from 'react'
import { Button, Card, Form, Input, InputNumber, Modal, Space, Switch, Table, message } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { adminApi } from '@/api'
import type { AppCategory } from '@/types'

export default function AppCategories() {
  const [rows, setRows] = useState<AppCategory[]>([])
  const [editing, setEditing] = useState<AppCategory | null>(null)
  const [form] = Form.useForm()
  const load = async () => { const res = await adminApi.getAppCategories(); setRows(res.data || []) }
  useEffect(() => { void load() }, [])
  const save = async (values: Partial<AppCategory>) => { const res = await adminApi.saveAppCategory({ ...values, id: editing?.id }); if (res.code !== 200) throw new Error(res.msg); message.success('应用分类保存成功'); setEditing(null); await load() }
  const create = () => { setEditing({ id: 0, name: '', slug: '' }); form.resetFields(); form.setFieldsValue({ sort: 0, status: true }) }
  return <div className="admin-page"><Card className="admin-panel admin-table" bordered={false} title="应用分类" extra={<Button type="primary" icon={<PlusOutlined />} onClick={create}>新增分类</Button>}><Table rowKey="id" dataSource={rows} columns={[{ title: '分类名称', dataIndex: 'name' }, { title: '排序', dataIndex: 'sort' }, { title: '状态', dataIndex: 'status', render: (v: boolean) => <Switch checked={v} disabled /> }, { title: '操作', render: (_, row) => <Space><Button type="link" icon={<EditOutlined />} onClick={() => { setEditing(row); form.setFieldsValue(row) }}>编辑</Button><Button danger type="link" icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: '删除应用分类', content: '分类下存在应用时不能删除，确定继续吗？', onOk: async () => { const res = await adminApi.deleteAppCategory(row.id); if (res.code !== 200) throw new Error(res.msg); await load() } })}>删除</Button></Space> }]} /></Card><Modal title={editing?.id ? '编辑应用分类' : '新增应用分类'} open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => form.submit()} destroyOnHidden><Form form={form} layout="vertical" onFinish={save}><Form.Item name="name" label="分类名称" rules={[{ required: true, message: '请输入分类名称' }]}><Input /></Form.Item><Form.Item name="description" label="分类说明"><Input.TextArea rows={3} /></Form.Item><Form.Item name="sort" label="排序"><InputNumber min={0} precision={0} /></Form.Item><Form.Item name="status" label="启用" valuePropName="checked"><Switch /></Form.Item></Form></Modal></div>
}
