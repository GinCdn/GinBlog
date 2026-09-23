import { useEffect, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import type { TextAreaRef } from 'antd/es/input/TextArea'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Form, Input, InputNumber, message, Modal, Popconfirm, Select, Space, Switch, Table, Tooltip, Upload } from 'antd'
import { AlignCenterOutlined, AlignLeftOutlined, AlignRightOutlined, ArrowLeftOutlined, BoldOutlined, CodeOutlined, CommentOutlined, DeleteOutlined, EditOutlined, EyeInvisibleOutlined, FieldStringOutlined, ItalicOutlined, LinkOutlined, MenuOutlined, MinusOutlined, OrderedListOutlined, PictureOutlined, PlusOutlined, SaveOutlined, StrikethroughOutlined, RedoOutlined, UndoOutlined, UnorderedListOutlined, UploadOutlined } from '@ant-design/icons'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { userApi } from '@/api'
import type { Article, Category, PageResponse } from '@/types'
import { buildHiddenBlock, hasArticleHiddenType } from '@/utils/articleContent'

interface ArticleFormValues { id?: number; title: string; description: string; coverImage?: string; keywords?: string; categoryId: number; isPublished: boolean; customTags?: string; content: string; accessType: 'public' | 'paid' | 'comment' | 'hidden'; price?: number; roleDiscount?: boolean }

type MarkdownAction = { title: string; icon: ReactNode; before?: string; after?: string; placeholder?: string }

/** Markdown编辑工具栏，向正文输入框插入常用格式和局部隐藏区块。 */
function MarkdownToolbar({ onInsert, onRememberSelection, onUndo, onRedo, canUndo, canRedo }: { onInsert: (before: string, after?: string, placeholder?: string) => void; onRememberSelection: () => void; onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean }) {
  const actions: MarkdownAction[] = [
    { title: '粗体', icon: <BoldOutlined />, before: '**', after: '**', placeholder: '粗体文字' },
    { title: '斜体', icon: <ItalicOutlined />, before: '*', after: '*', placeholder: '斜体文字' },
    { title: '删除线', icon: <StrikethroughOutlined />, before: '~~', after: '~~', placeholder: '删除线文字' },
    { title: '二级标题', icon: <FieldStringOutlined />, before: '## ', placeholder: '标题' },
    { title: '引用', icon: <CommentOutlined />, before: '> ', placeholder: '引用内容' },
    { title: '代码', icon: <CodeOutlined />, before: '```\n', after: '\n```', placeholder: 'const example = true' },
    { title: 'HTML代码块', icon: <CodeOutlined />, before: '```html\n', after: '\n```', placeholder: '<div>HTML代码</div>' },
    { title: 'HTML块', icon: <CodeOutlined />, before: '\n<div>\n', after: '\n</div>\n', placeholder: 'HTML内容' },
    { title: '左对齐', icon: <AlignLeftOutlined />, before: '\n<div class="article-align-left">\n', after: '\n</div>\n', placeholder: '左对齐文字' },
    { title: '居中', icon: <AlignCenterOutlined />, before: '\n<div class="article-align-center">\n', after: '\n</div>\n', placeholder: '居中文字' },
    { title: '右对齐', icon: <AlignRightOutlined />, before: '\n<div class="article-align-right">\n', after: '\n</div>\n', placeholder: '右对齐文字' },
    { title: '两端对齐', icon: <MenuOutlined />, before: '\n<div class="article-align-justify">\n', after: '\n</div>\n', placeholder: '两端对齐文字' },
    { title: '无序列表', icon: <UnorderedListOutlined />, before: '- ', placeholder: '列表内容' },
    { title: '有序列表', icon: <OrderedListOutlined />, before: '1. ', placeholder: '列表内容' },
    { title: '链接', icon: <LinkOutlined />, before: '[', after: '](https://example.com)', placeholder: '链接文字' },
    { title: '图片', icon: <PictureOutlined />, before: '![', after: '](图片地址)', placeholder: '图片说明' },
    { title: '分隔线', icon: <MinusOutlined />, before: '\n---\n', placeholder: '' },
  ]

  const rememberSelectionWithoutFocus = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    onRememberSelection()
  }

  return (
    <div className="article-markdown-toolbar" role="toolbar" aria-label="Markdown工具栏">
      <Tooltip title="撤销">
        <Button type="text" size="small" icon={<UndoOutlined />} disabled={!canUndo} onClick={onUndo} />
      </Tooltip>
      <Tooltip title="重做">
        <Button type="text" size="small" icon={<RedoOutlined />} disabled={!canRedo} onClick={onRedo} />
      </Tooltip>
      {actions.map((action) => (
        <Tooltip title={action.title} key={action.title}>
          <Button type="text" size="small" icon={action.icon} onMouseDown={rememberSelectionWithoutFocus} onClick={() => onInsert(action.before || '', action.after, action.placeholder)} />
        </Tooltip>
      ))}
    </div>
  )
}/** 用户文章管理，提供Markdown编辑、局部隐藏、实时预览和文件上传。 */
export default function ArticleEdit() {
  const navigate = useNavigate()
  const [form] = Form.useForm<ArticleFormValues>()
  const contentRef = useRef<TextAreaRef | null>(null)
  /** 获取 Ant Design 文本域内部的原生元素，确保读取到真实的光标和选区。 */
  const getContentTextarea = () => contentRef.current?.resizableTextArea?.textArea ?? null
  const contentSelectionRef = useRef({ start: 0, end: 0 })
  const contentHistoryRef = useRef<string[]>([''])
  const contentHistoryIndexRef = useRef(0)
  const lastContentRef = useRef('')
  const historyInitializedRef = useRef(false)
  const historyActionRef = useRef(false)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [rows, setRows] = useState<Article[]>([])
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 })

  const loadRows = async (page = pagination.page, pageSize = pagination.pageSize) => {
    setLoading(true)
    try {
      const result = await userApi.getMyArticles({ page, page_size: pageSize })
      const responseData = result.data as PageResponse<Article> || {}
      setRows(responseData.list || [])
      setPagination((state) => ({ ...state, page, pageSize, total: responseData.total || 0 }))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void userApi.getUserCategoryTree().then((result) => {
      const flatten = (items: Category[] | null | undefined = []): Category[] => (items || []).flatMap((item) => [item, ...flatten(item.children)])
      setCategories(flatten(result.data))
    })
    void loadRows(1, pagination.pageSize)
  }, [])

  const openCreate = () => {
    form.resetFields()
    form.setFieldsValue({ isPublished: true, accessType: 'public', price: 0, roleDiscount: false, coverImage: '', keywords: '', content: '' })
    resetContentHistory('')
    contentSelectionRef.current = { start: 0, end: 0 }
    setModalOpen(true)
  }

  const openEdit = (article: Article) => {
    form.setFieldsValue({
      id: article.id,
      title: article.title,
      description: article.description,
      coverImage: article.coverImage || '',
      keywords: article.keywords || '',
      categoryId: article.categoryId,
      isPublished: article.isPublished ?? false,
      accessType: (article.accessType || 'public') as ArticleFormValues['accessType'],
      price: article.price || 0,
      roleDiscount: article.roleDiscount ?? false,
      customTags: article.tags?.map((tag) => tag.name).join(','),
      content: article.content,
    })
    resetContentHistory(article.content)
    const contentLength = article.content.length
    contentSelectionRef.current = { start: contentLength, end: contentLength }
    setModalOpen(true)
  }


  const values = Form.useWatch('content', form) || ''
  const hasPaidHiddenContent = hasArticleHiddenType(values, 'paid')
  const hasCommentHiddenContent = hasArticleHiddenType(values, 'comment')

  const resetContentHistory = (content: string) => {
    contentHistoryRef.current = [content]
    contentHistoryIndexRef.current = 0
    lastContentRef.current = content
    historyInitializedRef.current = true
    historyActionRef.current = false
    setHistoryVersion((version) => version + 1)
  }

  useEffect(() => {
    const content = String(values)
    if (!historyInitializedRef.current) {
      resetContentHistory(content)
      return
    }
    if (historyActionRef.current) {
      historyActionRef.current = false
      lastContentRef.current = content
      setHistoryVersion((version) => version + 1)
      return
    }
    if (content === lastContentRef.current) return
    const history = contentHistoryRef.current.slice(0, contentHistoryIndexRef.current + 1)
    if (history[history.length - 1] !== content) history.push(content)
    if (history.length > 100) history.shift()
    contentHistoryRef.current = history
    contentHistoryIndexRef.current = history.length - 1
    lastContentRef.current = content
    setHistoryVersion((version) => version + 1)
  }, [values])

  const undoContent = () => {
    if (contentHistoryIndexRef.current <= 0) return false
    contentHistoryIndexRef.current -= 1
    historyActionRef.current = true
    const content = contentHistoryRef.current[contentHistoryIndexRef.current]
    lastContentRef.current = content
    form.setFieldValue('content', content)
    setHistoryVersion((version) => version + 1)
    restoreContentSelection(Math.min(contentSelectionRef.current.start, content.length))
    return true
  }

  const redoContent = () => {
    if (contentHistoryIndexRef.current >= contentHistoryRef.current.length - 1) return false
    contentHistoryIndexRef.current += 1
    historyActionRef.current = true
    const content = contentHistoryRef.current[contentHistoryIndexRef.current]
    lastContentRef.current = content
    form.setFieldValue('content', content)
    setHistoryVersion((version) => version + 1)
    restoreContentSelection(Math.min(contentSelectionRef.current.start, content.length))
    return true
  }


  /** 保存文章时，局部付费内容沿用整篇付费文章的价格、等级折扣和返佣配置。 */
  const save = async () => {
    const formValues = (await form.validateFields()) as ArticleFormValues
    const paidContent = formValues.accessType === 'paid' || hasArticleHiddenType(formValues.content || '', 'paid')
    const payload = {
      id: formValues.id,
      title: formValues.title.trim(),
      description: formValues.description.trim(),
      cover_image: formValues.coverImage?.trim() || '',
      keywords: formValues.keywords?.trim() || '',
      category_id: formValues.categoryId,
      is_published: formValues.isPublished,
      access_type: formValues.accessType,
      price: paidContent ? formValues.price ?? 0 : 0,
      role_discount: paidContent && Boolean(formValues.roleDiscount),
      custom_tags: formValues.customTags?.split(',').map((item) => item.trim()).filter(Boolean),
      content: formValues.content,
    }
    setSaving(true)
    try {
      if (formValues.id) await userApi.updateArticle(payload)
      else await userApi.createArticle(payload)
      message.success('保存成功')
      setModalOpen(false)
      void loadRows()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: number) => {
    await userApi.deleteArticle(id)
    message.success('删除成功')
    void loadRows()
  }

  /** 记录正文最后一次有效光标或选区，供工具栏和异步上传完成后准确插入内容。 */
  const rememberContentSelection = () => {
    const textarea = getContentTextarea()
    if (!textarea) return
    contentSelectionRef.current = { start: textarea.selectionStart, end: textarea.selectionEnd }
  }

  /** 读取正文插入位置，输入框失焦后仍优先使用用户最后一次选择的位置。 */
  const getContentSelection = (source: string) => {
    const textarea = getContentTextarea()
    const activeSelection = textarea && document.activeElement === textarea
      ? { start: textarea.selectionStart, end: textarea.selectionEnd }
      : contentSelectionRef.current
    const start = Math.max(0, Math.min(activeSelection.start, source.length))
    const end = Math.max(start, Math.min(activeSelection.end, source.length))
    return { start, end }
  }

  /** 更新正文后恢复光标位置，方便连续插入内容。 */
  const restoreContentSelection = (start: number, end = start) => {
    contentSelectionRef.current = { start, end }
    requestAnimationFrame(() => {
      const textarea = getContentTextarea()
      textarea?.focus()
      textarea?.setSelectionRange(start, end)
    })
  }
  /** 在当前光标位置插入Markdown格式，并优先包装用户选中的文字。 */
  const insertMarkdown = (before: string, after = '', placeholder = '') => {
    const source = String(form.getFieldValue('content') || '')
    const { start, end } = getContentSelection(source)
    const selected = source.slice(start, end)
    const inserted = selected || placeholder
    const nextContent = source.slice(0, start) + before + inserted + after + source.slice(end)
    form.setFieldValue('content', nextContent)
    const isCodeBlock = before.startsWith('```') && after.endsWith('```')
    const contentStart = start + before.length
    const contentEnd = contentStart + inserted.length
    const position = start + before.length + inserted.length + after.length
    restoreContentSelection(isCodeBlock ? contentStart : position, isCodeBlock ? contentEnd : position)
  }
  /** 将选中文本包装为付费隐藏或评论隐藏区块，没有选择时插入示例内容。 */
  const insertHiddenContent = (type: 'paid' | 'comment') => {
    const source = String(form.getFieldValue('content') || '')
    const { start, end } = getContentSelection(source)
    const selected = source.slice(start, end)
    const block = buildHiddenBlock(type, selected)
    const nextContent = source.slice(0, start) + block + source.slice(end)
    form.setFieldValue('content', nextContent)
    restoreContentSelection(start + block.length)
  }
  const uploadFile = async (file: File) => {
    const uploadSelection = getContentSelection(String(form.getFieldValue('content') || ''))
    const formData = new FormData()
    formData.append('file', file)
    try {
      const result = await userApi.upload(formData)
      const url = String(result.data || '')
      if (!url) throw new Error('服务端未返回文件链接')

      const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg)$/i.test(file.name)
      const markdown = isImage ? `![${file.name}](${url})` : `[${file.name}](${url})`
      const source = String(form.getFieldValue('content') || '')
      const start = Math.max(0, Math.min(uploadSelection.start, source.length))
      const end = Math.max(start, Math.min(uploadSelection.end, source.length))
      const nextContent = source.slice(0, start) + markdown + source.slice(end)
      form.setFieldValue('content', nextContent)
      message.success(isImage ? '图片上传成功，已按光标位置插入图片' : '文件上传成功，已按光标位置插入链接')
      restoreContentSelection(start + markdown.length)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '文件上传失败，请稍后重试')
    }
  }
  return (
    <div>
      <Card title="我的文章" extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建文章</Button>}>
        <Table rowKey="id" loading={loading} dataSource={rows}
          pagination={{ current: pagination.page, pageSize: pagination.pageSize, total: pagination.total, onChange: loadRows }}
          columns={[
            { title: '标题', dataIndex: 'title', ellipsis: true },
            { title: '分类', dataIndex: ['category', 'name'], width: 120 },
            { title: '状态', dataIndex: 'isPublished', width: 100, render: (value: boolean) => value ? '已发布' : '待审核' },
            { title: '阅读量', dataIndex: 'viewCount', width: 90 },
            { title: '访问方式', width: 120, render: (_: unknown, record: Article) => record.accessType === 'paid' ? `付费 ${Number(record.price || 0).toFixed(2)} 元` : record.accessType === 'comment' ? '评论后阅读' : record.accessType === 'hidden' ? '完全隐藏' : '公开阅读' },
            { title: '创建时间', dataIndex: 'createTime', width: 170 },
            { title: '操作', width: 130, render: (_: unknown, record: Article) => (
              <Space><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button><Popconfirm title="确定删除这篇文章吗？" onConfirm={() => remove(record.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space>
            ) },
          ]}
        />
      </Card>

      <Modal title="文章编辑器" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width="calc(100vw - 32px)" className="article-editor-modal" style={{ maxWidth: 1600, top: 16 }} destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={{ isPublished: true }} onFinish={save}>
          <Form.Item hidden name="id"><Input /></Form.Item>
          <Form.Item name="title" rules={[{ required: true, message: '请输入标题' }]} style={{ marginBottom: 16 }}>
            <Input size="large" placeholder="输入文章标题" />
          </Form.Item>
          <div className="article-editor-body-grid">
            <Card size="small" title="内容" className="article-editor-content-card">
              <Form.Item label="描述" name="description" rules={[{ required: true, message: '请输入描述' }]}><Input.TextArea rows={3} placeholder="填写文章摘要，便于首页和搜索结果展示" /></Form.Item>
              <Form.Item label="封面图地址" name="coverImage" extra="用于首页卡片和文章头图，可填写上传后返回的图片地址。"><Input placeholder="请输入封面图地址" /></Form.Item>
              <Form.Item label="SEO关键词" name="keywords" extra="多个关键词使用英文逗号分隔。"><Input placeholder="例如：Go语言, Gin, 博客系统" /></Form.Item>
              <Form.Item label="访问方式" name="accessType" extra="可设置整篇访问方式，也可在正文中插入付费隐藏或评论后隐藏内容。">
                <Select options={[{ value: 'public', label: '免费公开' }, { value: 'paid', label: '付费浏览' }, { value: 'comment', label: '评论后浏览' }, { value: 'hidden', label: '完全隐藏' }]} />
              </Form.Item>
              <Form.Item noStyle shouldUpdate={(previous, current) => previous.accessType !== current.accessType || previous.content !== current.content}>
                {({ getFieldValue }) => {
                  const content = String(getFieldValue('content') || '')
                  const paidContent = getFieldValue('accessType') === 'paid' || hasArticleHiddenType(content, 'paid')
                  return paidContent ? (
                    <Card size="small" title="付费阅读设置" className="article-access-settings">
                      <Form.Item label="文章价格" name="price" rules={[{ required: true, message: '请输入文章价格' }, { type: 'number', min: 0.01, message: '价格必须大于0' }]}><InputNumber min={0.01} precision={2} addonAfter="元" style={{ width: 180 }} /></Form.Item>
                      <Form.Item label="用户等级折扣" name="roleDiscount" valuePropName="checked"><Switch checkedChildren="开启" unCheckedChildren="关闭" /></Form.Item>
                      <div className="article-role-rebate-help">推广返佣比例由推广人的用户等级配置自动决定，按实际支付金额计算，无需在文章中单独设置。</div>
                    </Card>
                  ) : null
                }}
              </Form.Item>
              <Form.Item label="分类" name="categoryId" rules={[{ required: true, message: '请选择分类' }]}>
                <Select options={categories.map((item) => ({ value: item.cid, label: item.name }))} placeholder="请选择分类" />
              </Form.Item>
              <Form.Item label="自定义标签" name="customTags"><Input placeholder="多个标签使用英文逗号分隔" /></Form.Item>
              <Form.Item label="发布状态" name="isPublished" valuePropName="checked" extra="普通用户提交后仍需管理员审核公开"><Switch checkedChildren="申请发布" unCheckedChildren="草稿" /></Form.Item>
                            <div className="article-hidden-content-panel">
                <div className="article-hidden-content-heading">
                  <EyeInvisibleOutlined />
                  <strong>正文局部隐藏</strong>
                </div>
                <div className="article-hidden-content-help">先在下方正文中选中文字，再点击对应按钮即可设置隐藏。未选中文字时会插入示例区块，替换示例文字后保存。</div>
                <Space wrap>
                  <Button size="small" icon={<EyeInvisibleOutlined />} onMouseDown={(event) => { event.preventDefault(); rememberContentSelection() }} onClick={() => insertHiddenContent('paid')}>插入付费隐藏</Button>
                  <Button size="small" icon={<EyeInvisibleOutlined />} onMouseDown={(event) => { event.preventDefault(); rememberContentSelection() }} onClick={() => insertHiddenContent('comment')}>插入评论后可见</Button>
                </Space>
                {(hasPaidHiddenContent || hasCommentHiddenContent) && (
                  <div className="article-hidden-content-status">
                    已设置：{[hasPaidHiddenContent ? '付费隐藏' : '', hasCommentHiddenContent ? '评论后可见' : ''].filter(Boolean).join('、')}
                  </div>
                )}
              </div>
              <Space wrap>
                <MarkdownToolbar onInsert={insertMarkdown} onRememberSelection={rememberContentSelection} onUndo={undoContent} onRedo={redoContent} canUndo={contentHistoryIndexRef.current > 0} canRedo={contentHistoryIndexRef.current < contentHistoryRef.current.length - 1} />
                <Upload accept="image/*" showUploadList={false} beforeUpload={(file) => { void uploadFile(file); return false }}>
                  <Button icon={<PictureOutlined />} onMouseDown={(event) => { event.preventDefault(); rememberContentSelection() }}>上传图片</Button>
                </Upload>
                <Upload showUploadList={false} beforeUpload={(file) => { void uploadFile(file); return false }}>
                  <Button icon={<UploadOutlined />} onMouseDown={(event) => { event.preventDefault(); rememberContentSelection() }}>上传文件</Button>
                </Upload>
              </Space>
              <Form.Item label="Markdown内容" name="content" rules={[{ required: true, message: '请输入内容' }]}>
                <Input.TextArea className="article-markdown-input" ref={contentRef} rows={22} onSelect={rememberContentSelection} onClick={rememberContentSelection} onKeyUp={rememberContentSelection} onBlur={rememberContentSelection} onKeyDown={(event) => { const modifier = event.ctrlKey || event.metaKey; if (!modifier) return; const key = event.key.toLowerCase(); if (key === 'z') { const changed = event.shiftKey ? redoContent() : undoContent(); if (changed) event.preventDefault() } else if (key === 'y') { const changed = redoContent(); if (changed) event.preventDefault() } }} placeholder="支持 Markdown、直接书写安全 HTML、图片链接、文件链接和局部隐藏" />
              </Form.Item>
            </Card>
            <Card size="small" title="实时预览" className="article-editor-preview-card" aria-label="实时预览">
              {values ? <MarkdownRenderer content={values} /> : <span className="article-preview-empty">输入Markdown后将在这里显示预览</span>}
            </Card>
          </div>
          <Space style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => setModalOpen(false)}>取消</Button>
            <Button loading={saving} type="primary" icon={<SaveOutlined />} htmlType="submit">保存</Button>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}

