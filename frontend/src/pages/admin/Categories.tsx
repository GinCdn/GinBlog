import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Form, Input, message, Modal, Popconfirm, Select, Space, Table } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { adminApi, publicApi } from '@/api'
import type { Category } from '@/types'

interface CategoryFormValues {
  cid?: number
  name: string
  slug: string
  parentId?: number
  description?: string
}

/** 将分类树展开为表格使用的扁平列表。 */
function flattenCategories(items: Category[] | null | undefined = []): Category[] {
  return (items || []).flatMap((item) => [item, ...flattenCategories(item.children)])
}

/** 收集指定分类的所有下级分类，防止编辑时形成循环父子关系。 */
function collectDescendantIds(category: Category): number[] {
  return (category.children || []).flatMap((item) => [item.cid, ...collectDescendantIds(item)])
}

/** 管理员分类管理页面，使用已有分类接口完成新增、编辑和删除。 */
export default function Categories() {
  const [form] = Form.useForm<CategoryFormValues>()
  const [rows, setRows] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)

  const loadCategories = async () => {
    setLoading(true)
    try {
      const result = await publicApi.getCategoryTree().catch(() => adminApi.getAdminCategoryTree())
      setRows(flattenCategories(result.data || []))
    } catch {
      message.error('\u5206\u7c7b\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u7ba1\u7406\u5458\u8d26\u53f7')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCategories()
  }, [])

  const parentNameMap = useMemo(() => new Map(rows.map((item) => [item.cid, item.name])), [rows])
  const unavailableParentIds = useMemo(() => {
    if (!editing) return new Set<number>()
    return new Set([editing.cid, ...collectDescendantIds(editing)])
  }, [editing])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (category: Category) => {
    setEditing(category)
    form.setFieldsValue({
      cid: category.cid,
      name: category.name,
      slug: category.slug,
      parentId: category.parentId || undefined,
      description: category.description,
    })
    setModalOpen(true)
  }

  const save = async () => {
    const values = await form.validateFields()
    const payload = {
      cid: values.cid,
      name: values.name.trim(),
      slug: values.slug.trim(),
      parent_id: values.parentId || 0,
      description: values.description?.trim() || '',
    }
    setSaving(true)
    try {
      if (values.cid) {
        await adminApi.updateAdminCategory(payload)
      } else {
        await adminApi.createAdminCategory(payload)
      }
      message.success('分类保存成功')
      setModalOpen(false)
      await loadCategories()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (cid: number) => {
    await adminApi.deleteAdminCategory(cid)
    message.success('分类删除成功')
    await loadCategories()
  }

  return (
    <div className="admin-page">
      <Card className="admin-panel" title="分类管理" extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建分类</Button>}>
        <Table<Category>
          rowKey="cid"
          loading={loading}
          dataSource={rows}
          pagination={false}
          tableLayout="fixed"
          scroll={{ x: 900 }}
          columns={[
            { title: '分类名称', dataIndex: 'name', width: 180, ellipsis: true },
            { title: '缩略名', dataIndex: 'slug', width: 180, ellipsis: true },
            { title: '上级分类', dataIndex: 'parentId', width: 160, render: (parentId?: number) => parentId ? parentNameMap.get(parentId) || `分类 ${parentId}` : '顶级分类' },
            { title: '分类描述', dataIndex: 'description', width: 240, ellipsis: true, render: (value?: string) => value || '-' },
            {
              title: '操作', width: 140, render: (_: unknown, record) => (
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
                  <Popconfirm title="确定删除此分类吗？" description="存在子分类或文章时无法删除。" onConfirm={() => void remove(record.cid)}>
                    <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal title={editing ? '编辑分类' : '新建分类'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => void save()} confirmLoading={saving} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item hidden name="cid"><Input /></Form.Item>
          <Form.Item label="分类名称" name="name" rules={[{ required: true, message: '请输入分类名称' }]}>
            <Input maxLength={32} placeholder="例如：技术分享" />
          </Form.Item>
          <Form.Item label="缩略名" name="slug" rules={[{ required: true, message: '请输入缩略名' }]} extra="用于分类链接标识，保存后请保持唯一。">
            <Input maxLength={32} placeholder="例如：tech" />
          </Form.Item>
          <Form.Item label="上级分类" name="parentId" extra="不选择则创建为顶级分类。">
            <Select allowClear placeholder="请选择上级分类" options={rows.filter((item) => !unavailableParentIds.has(item.cid)).map((item) => ({ value: item.cid, label: item.name }))} />
          </Form.Item>
          <Form.Item label="分类描述" name="description">
            <Input.TextArea rows={3} maxLength={255} placeholder="可选，用于补充分类说明" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}