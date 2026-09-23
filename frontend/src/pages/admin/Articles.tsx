import { useEffect, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import type { TextAreaRef } from 'antd/es/input/TextArea'
import { Button, Card, Col, Form, Input, InputNumber, message, Modal, Popconfirm, Row, Select, Space, Switch, Table, Tooltip, Upload } from 'antd'
import { AlignCenterOutlined, AlignLeftOutlined, AlignRightOutlined, ArrowLeftOutlined, BoldOutlined, CodeOutlined, DeleteOutlined, EditOutlined, FieldStringOutlined, ItalicOutlined, LinkOutlined, MenuOutlined, MinusOutlined, OrderedListOutlined, PictureOutlined, PlusOutlined, CommentOutlined, EyeInvisibleOutlined, SaveOutlined, StrikethroughOutlined, RedoOutlined, UndoOutlined, UnorderedListOutlined } from '@ant-design/icons'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { adminApi, publicApi } from '@/api'
import type { Article, Category, PageResponse } from '@/types'
import { buildHiddenBlock, hasArticleHiddenType } from '@/utils/articleContent'

interface ArticleFormValues { id?: number; title: string; description: string; coverImage?: string; keywords?: string; categoryId: number; isPublished: boolean; customTags?: string; content: string; accessType: 'public' | 'paid' | 'comment' | 'hidden'; price?: number; roleDiscount?: boolean }
type ArticleStatusFilter = 'all' | 'published' | 'draft'
type ApiRecord = Record<string, unknown>

/** 兼容后端历史响应中的驼峰字段、下划线字段及嵌套分页结构。 */
function getApiValue<T>(record: ApiRecord | undefined, ...keys: string[]): T | undefined {
  for (const key of keys) {
    const value = record?.[key]
    if (value !== undefined && value !== null) return value as T
  }
  return undefined
}

/** 将接口中的布尔字段统一为真正的布尔值，兼容布尔、数字和字符串格式。 */
function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase())
  return false
}

/** 将接口返回的标签统一为文章编辑器使用的标签结构。 */
function normalizeTags(value: unknown): Article['tags'] {
  if (!Array.isArray(value)) return undefined
  return value.map((item) => {
    if (typeof item === 'string') return { id: 0, name: item }
    const tag = (item || {}) as ApiRecord
    return {
      id: Number(getApiValue(tag, 'id', 'ID', 'tag_id') || 0),
      name: String(getApiValue(tag, 'name', 'Name') || ''),
    }
  }).filter((tag) => tag.name)
}

/** 将文章列表项的字段和关联数据统一为前端模型，避免列表和编辑页丢失分类、标签。 */
function normalizeArticle(value: unknown): Article {
  const source = (value || {}) as ApiRecord
  const categoryValue = getApiValue<ApiRecord>(source, 'category', 'Category')
  const categoryId = Number(getApiValue<number>(source, 'categoryId', 'category_id', 'CategoryID') || categoryValue?.cid || 0)
  const category = categoryValue && typeof categoryValue === 'object'
    ? {
        cid: Number(getApiValue<number>(categoryValue, 'cid', 'CID') || categoryId),
        name: String(getApiValue(categoryValue, 'name', 'Name') || ''),
        slug: getApiValue<string>(categoryValue, 'slug', 'Slug'),
        parentId: getApiValue<number>(categoryValue, 'parentId', 'parent_id', 'ParentID'),
        description: getApiValue<string>(categoryValue, 'description', 'Description'),
      }
    : undefined
  return {
    id: Number(getApiValue<number>(source, 'id', 'ID') || 0),
    title: String(getApiValue(source, 'title', 'Title') || ''),
    content: String(getApiValue(source, 'content', 'Content') || ''),
    description: String(getApiValue(source, 'description', 'Description') || ''),
    coverImage: String(getApiValue(source, 'coverImage', 'cover_image', 'CoverImage', 'cover', 'image') || ''),
    keywords: String(getApiValue(source, 'keywords', 'Keywords') || ''),
    categoryId,
    category,
    authorId: getApiValue<number>(source, 'authorId', 'author_id', 'AuthorID'),
    author: getApiValue(source, 'author', 'Author') as Article['author'],
    viewCount: Number(getApiValue<number>(source, 'viewCount', 'view_count', 'ViewCount') || 0),
    commentCount: Number(getApiValue<number>(source, 'commentCount', 'comment_count', 'CommentCount') || 0),
    isPublished: normalizeBoolean(getApiValue(source, 'isPublished', 'is_published', 'IsPublished')),
    createTime: getApiValue<string>(source, 'createTime', 'create_time', 'CreateTime'),
    updateTime: getApiValue<string>(source, 'updateTime', 'update_time', 'UpdateTime'),
    tags: normalizeTags(getApiValue(source, 'tags', 'Tags', 'tag_list', 'tagList')),
    accessType: (String(getApiValue(source, 'accessType', 'access_type', 'AccessType') || 'public') as ArticleFormValues['accessType']),
    price: Number(getApiValue<number>(source, 'price', 'Price') || 0),
    roleDiscount: normalizeBoolean(getApiValue(source, 'roleDiscount', 'role_discount', 'RoleDiscount')),
    isUnlocked: Boolean(getApiValue<boolean>(source, 'isUnlocked', 'is_unlocked', 'IsUnlocked')),
    payablePrice: Number(getApiValue<number>(source, 'payablePrice', 'payable_price', 'PayablePrice') || 0),
    discountRate: Number(getApiValue<number>(source, 'discountRate', 'discount_rate', 'DiscountRate') || 100),
    unlockReason: String(getApiValue(source, 'unlockReason', 'unlock_reason', 'UnlockReason') || ''),
  }
}

/** 从接口响应中提取分类数组，兼容直接数组和历史分页包装。 */
function extractCategories(value: unknown): Category[] {
  if (Array.isArray(value)) return value as Category[]
  const data = (value || {}) as ApiRecord
  const list = getApiValue<unknown[]>(data, 'list', 'items', 'categories', 'data')
  return Array.isArray(list) ? list as Category[] : []
}

/** 从接口响应中提取文章列表和分页信息，兼容直接列表和历史嵌套结构。 */
function extractArticlePage(value: unknown): { articles: Article[]; page: PageResponse<Article> } {
  const data = (value || {}) as ApiRecord
  const nested = (getApiValue<ApiRecord>(data, 'data') || {}) as ApiRecord
  const source = Array.isArray(value) ? {} : (Array.isArray(data.list) ? data : nested)
  const list = Array.isArray(value) ? value : getApiValue<unknown[]>(source, 'list', 'items', 'articles')
  const pagination = getApiValue<ApiRecord>(source, 'pagination')
  const page = {
    list: (list || []).map(normalizeArticle),
    total: Number(getApiValue<number>(source, 'total') || getApiValue<number>(pagination, 'total') || 0),
    page: Number(getApiValue<number>(source, 'page') || getApiValue<number>(pagination, 'page') || 0),
    page_size: Number(getApiValue<number>(source, 'page_size', 'pageSize') || getApiValue<number>(pagination, 'page_size', 'pageSize') || 0),
    pagination: pagination as PageResponse<Article>['pagination'],
  }
  return { articles: page.list || [], page }
}

/** Markdown 编辑工具栏，向当前光标位置插入常用格式。 */
function MarkdownToolbar({ onInsert, onRememberSelection, onUndo, onRedo, canUndo, canRedo }: { onInsert: (before: string, after?: string, placeholder?: string) => void; onRememberSelection: () => void; onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean }) {
  const actions: Array<{ title: string; icon: ReactNode; before?: string; after?: string; placeholder?: string }> = [
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
}
/** 管理员文章管理，提供文章筛选、Markdown编辑、实时预览和文件上传。 */
export default function Articles() {
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
  const [statusFilter, setStatusFilter] = useState<ArticleStatusFilter>('all')
  const [titleKeyword, setTitleKeyword] = useState('')
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 })
  const [imageUploadOpen, setImageUploadOpen] = useState(false)
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [imageWidth, setImageWidth] = useState<number | undefined>()
  const [imageHeight, setImageHeight] = useState<number | undefined>()

  const loadRows = async (page = pagination.page, pageSize = pagination.pageSize, filter = statusFilter, keyword = titleKeyword) => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page, page_size: pageSize }
      if (filter !== 'all') params.is_published = filter === 'published'
      if (keyword.trim()) params.title = keyword.trim()
      const result = await adminApi.getAdminArticles(params)
      const { articles, page: responseData } = extractArticlePage(result.data)
      setRows(articles)
      const pageData = responseData.pagination
      setPagination((state) => ({
        ...state,
        page: pageData?.page || responseData.page || page,
        pageSize: pageData?.page_size || responseData.page_size || pageSize,
        total: pageData?.total ?? responseData.total ?? 0,
      }))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void publicApi.getCategoryTree()
      .catch(() => adminApi.getAdminCategoryTree())
      .then((result) => {
        const flatten = (items: Category[] = []): Category[] => items.flatMap((item) => [item, ...flatten(item.children || [])])
        setCategories(flatten(extractCategories(result.data)))
      })
      .catch(() => {
        message.error('分类加载失败，请检查网络或后端分类接口')
        setCategories([])
      })
    void loadRows(1, pagination.pageSize)
  }, [])

  const openCreate = () => {
    form.resetFields()
    form.setFieldsValue({ isPublished: true, content: '', coverImage: '', keywords: '', accessType: 'public', price: 0, roleDiscount: false })
    resetContentHistory('')
    contentSelectionRef.current = { start: 0, end: 0 }
    setModalOpen(true)
  }

  const openEdit = async (article: Article) => {
    let editingArticle = article
    try {
      const result = await adminApi.getAdminArticles({ id: article.id, page: 1, page_size: 20 })
      const detail = extractArticlePage(result.data).articles.find((item) => item.id === article.id)
      if (detail) {
        editingArticle = {
          ...article,
          ...detail,
          category: detail.category || article.category,
          tags: detail.tags || article.tags,
        }
      }
    } catch {
      // 详情请求失败时继续使用列表数据，避免编辑入口因网络波动不可用。
    }
    form.setFieldsValue({
      id: editingArticle.id,
      title: editingArticle.title,
      description: editingArticle.description,
      coverImage: editingArticle.coverImage || '',
      keywords: editingArticle.keywords || '',
      categoryId: editingArticle.categoryId,
      isPublished: editingArticle.isPublished ?? false,
      accessType: (editingArticle.accessType || 'public') as ArticleFormValues['accessType'],
      price: editingArticle.price || 0,
      roleDiscount: editingArticle.roleDiscount ?? false,
      customTags: editingArticle.tags?.map((tag) => tag.name).join(','),
      content: editingArticle.content,
    })
    resetContentHistory(editingArticle.content)
    const contentLength = editingArticle.content.length
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


  const save = async (publishedOverride?: boolean) => {
    const values = (await form.validateFields()) as ArticleFormValues
    const payload = {
      id: values.id,
      title: values.title.trim(),
      description: values.description.trim(),
      cover_image: values.coverImage?.trim() || '',
      keywords: values.keywords?.trim() || '',
      category_id: values.categoryId,
      is_published: publishedOverride ?? values.isPublished ?? false,
      access_type: values.accessType,
      // 价格和折扣按表单原值提交，是否生效由后端依据访问方式和正文隐藏区块统一校验。
      // 避免前端识别旧文章隐藏标记失败时，保存操作把已有配置重置为零。
      price: values.price ?? 0,
      role_discount: Boolean(values.roleDiscount),
      custom_tags: values.customTags?.split(',').map((item) => item.trim()).filter(Boolean),
      content: values.content,
    }
    setSaving(true)
    try {
      if (values.id) await adminApi.updateAdminArticle(payload)
      else await adminApi.createAdminArticle(payload)
      message.success(payload.is_published ? '文章发布成功' : '草稿保存成功')
      setModalOpen(false)
      void loadRows()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: number) => {
    await adminApi.deleteAdminArticle(id)
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

  /** 在当前光标位置插入 Markdown 或安全 HTML 格式，并优先包装选中文本。 */
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

  /** 将选中文本包装为局部隐藏区块，没有选中文本时插入可直接替换的示例内容。 */
  const insertHiddenContent = (type: 'paid' | 'comment') => {
    const source = String(form.getFieldValue('content') || '')
    const { start, end } = getContentSelection(source)
    const selected = source.slice(start, end)
    const block = buildHiddenBlock(type, selected)
    const nextContent = source.slice(0, start) + block + source.slice(end)
    form.setFieldValue('content', nextContent)
    restoreContentSelection(start + block.length)
  }

  /** 上传完成后按上传前记录的选区插入图片或文件链接。 */
  const uploadFile = async (file: File, width?: number, height?: number) => {
    const uploadSelection = getContentSelection(String(form.getFieldValue('content') || ''))
    const formData = new FormData()
    formData.append('file', file)
    try {
      const result = await adminApi.upload(formData)
      const url = String(result.data || '')
      if (!url) throw new Error('服务端未返回文件链接')

      const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg)$/i.test(file.name)
      const sizeTitle = isImage && (width || height) ? ` "尺寸:${width || ''}x${height || ''}"` : ''
      const markdown = isImage ? `![${file.name}](${url}${sizeTitle})` : `[${file.name}](${url})`
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
  const uploadCoverImage = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    try {
      const result = await adminApi.upload(formData)
      const url = String(result.data || '')
      if (!url) throw new Error('服务端未返回文件链接')
      form.setFieldValue('coverImage', url)
      message.success('封面图上传成功，已自动填入地址')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '封面图上传失败，请稍后重试')
    }
  }

  const prepareUpload = (file: File, image = false) => {
    rememberContentSelection()
    if (image) {
      setPendingImage(file)
      setImageWidth(undefined)
      setImageHeight(undefined)
      setImageUploadOpen(true)
      return
    }
    void uploadFile(file)
  }

  const confirmImageUpload = async () => {
    if (!pendingImage) return
    setImageUploadOpen(false)
    const file = pendingImage
    setPendingImage(null)
    await uploadFile(file, imageWidth, imageHeight)
  }

  const changeStatusFilter = (filter: ArticleStatusFilter) => {
    setStatusFilter(filter)
    void loadRows(1, pagination.pageSize, filter, titleKeyword)
  }

  return (
    <div className="admin-page">
      <Card className="admin-panel" title="文章管理" extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建文章</Button>}>
        <div className="article-manage-toolbar">
          <Space wrap>
            <Button type={statusFilter === 'all' ? 'primary' : 'text'} onClick={() => changeStatusFilter('all')}>全部文章</Button>
            <Button type={statusFilter === 'published' ? 'primary' : 'text'} onClick={() => changeStatusFilter('published')}>已发布</Button>
            <Button type={statusFilter === 'draft' ? 'primary' : 'text'} onClick={() => changeStatusFilter('draft')}>草稿</Button>
          </Space>
          <Input.Search allowClear value={titleKeyword} onChange={(event) => setTitleKeyword(event.target.value)} onSearch={(value) => void loadRows(1, pagination.pageSize, statusFilter, value)} placeholder="按标题搜索文章" style={{ width: 260 }} />
        </div>
        <Table rowKey="id" loading={loading} dataSource={rows} tableLayout="fixed" scroll={{ x: 1160 }}
          pagination={{ current: pagination.page, pageSize: pagination.pageSize, total: pagination.total, onChange: (page, pageSize) => void loadRows(page, pageSize) }}
          columns={[
            { title: '标题', dataIndex: 'title', width: 330, ellipsis: true },
            { title: '分类', width: 140, ellipsis: true, render: (_: unknown, record: Article) => record.category?.name || categories.find((item) => item.cid === record.categoryId)?.name || '未分类' },
            { title: '状态', dataIndex: 'isPublished', width: 100, render: (value: boolean) => value ? '已发布' : '草稿' },
            { title: '阅读量', dataIndex: 'viewCount', width: 90, render: (value?: number) => value ?? 0 },
            { title: '评论量', dataIndex: 'commentCount', width: 90, render: (value?: number) => value ?? 0 },
             { title: '访问方式', width: 120, render: (_: unknown, record: Article) => record.accessType === 'paid' ? `付费 ${Number(record.price || 0).toFixed(2)} 元` : record.accessType === 'comment' ? '评论后阅读' : record.accessType === 'hidden' ? '完全隐藏' : '公开阅读' },
            { title: '创建时间', dataIndex: 'createTime', width: 180 },
            { title: '操作', width: 140, render: (_: unknown, record: Article) => (
              <Space><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button><Popconfirm title="确定删除这篇文章吗？" onConfirm={() => void remove(record.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space>
            ) },
          ]}
        />
      </Card>

      <Modal title="文章编辑器" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width="calc(100vw - 32px)" className="article-editor-modal" style={{ maxWidth: 1600, top: 16 }} destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={{ isPublished: true }} onFinish={() => void save()}>
          <Form.Item hidden name="id"><Input /></Form.Item>
          <Form.Item name="title" rules={[{ required: true, message: '请输入标题' }]} style={{ marginBottom: 16 }}>
            <Input size="large" placeholder="输入文章标题" />
          </Form.Item>
          <Row gutter={20} align="top" className="article-editor-grid">
            <Col flex="1 1 0" style={{ minWidth: 0 }}>
              <Card size="small" title="内容" className="article-editor-content-card">
                <Form.Item label="描述" name="description" rules={[{ required: true, message: '请输入描述' }]}><Input.TextArea rows={3} placeholder="填写文章摘要，便于首页和搜索结果展示" /></Form.Item>
                <div className="article-editor-body-grid">
                  <div className="article-editor-markdown-pane">
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
                    <MarkdownToolbar onInsert={insertMarkdown} onRememberSelection={rememberContentSelection} onUndo={undoContent} onRedo={redoContent} canUndo={contentHistoryIndexRef.current > 0} canRedo={contentHistoryIndexRef.current < contentHistoryRef.current.length - 1} />
                    <Form.Item name="content" rules={[{ required: true, message: '请输入内容' }]}>
                      <Input.TextArea className="article-markdown-input" ref={contentRef} rows={22} onSelect={rememberContentSelection} onClick={rememberContentSelection} onKeyUp={rememberContentSelection} onBlur={rememberContentSelection} onKeyDown={(event) => { const modifier = event.ctrlKey || event.metaKey; if (!modifier) return; const key = event.key.toLowerCase(); if (key === 'z') { const changed = event.shiftKey ? redoContent() : undoContent(); if (changed) event.preventDefault() } else if (key === 'y') { const changed = redoContent(); if (changed) event.preventDefault() } }} placeholder="支持 Markdown、直接书写安全 HTML、图片链接和代码高亮" />
                    </Form.Item>
                  </div>
                  <Card size="small" title="实时预览" className="article-editor-preview-card" aria-label="实时预览">
                    {values ? <MarkdownRenderer content={values} /> : <span className="article-preview-empty">输入 Markdown 后将在这里显示预览</span>}
                  </Card>
                </div>
              </Card>
            </Col>
            <Col flex="520px" style={{ minWidth: 0 }}>
              <Card size="small" title="发布设置" style={{ marginBottom: 16 }}>
                <Form.Item label="封面图地址" name="coverImage" extra="用于首页卡片、文章头图和社交分享，没有填写时使用正文首图。">
                  <Input placeholder="填写图片地址，或点击下方上传封面图" />
                </Form.Item>
                <Upload accept="image/*" showUploadList={false} beforeUpload={(file) => { void uploadCoverImage(file); return false }}>
                  <Button icon={<PictureOutlined />}>上传并设为封面</Button>
                </Upload>
                <Form.Item label="SEO关键词" name="keywords" extra="多个关键词使用英文逗号分隔，用于文章页搜索引擎关键词。">
                  <Input placeholder="例如：Go语言, Gin, 博客系统" />
                </Form.Item>
                <Form.Item label="分类" name="categoryId" rules={[{ required: true, message: '请选择分类' }]}>
                  <Select options={categories.map((item) => ({ value: item.cid, label: item.name }))} placeholder="请选择分类" />
                </Form.Item>
                <Form.Item
                  label="标签"
                  name="customTags"
                  getValueProps={(value?: string) => ({ value: value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [] })}
                  getValueFromEvent={(values: string[]) => values.join(',')}
                >
                  <Select mode="tags" tokenSeparators={[',', '，']} maxTagCount="responsive" placeholder="输入标签后按回车，可添加多个标签" />
                </Form.Item>
                <Form.Item label="访问方式" name="accessType" extra="可设置整篇访问方式，也可在正文中插入付费隐藏或评论后隐藏内容。">
                  <Select options={[{ value: 'public', label: '免费公开' }, { value: 'paid', label: '付费浏览' }, { value: 'comment', label: '评论后浏览' }, { value: 'hidden', label: '完全隐藏' }]} />
                </Form.Item>
                <Form.Item noStyle shouldUpdate={(previous, current) => previous.accessType !== current.accessType || previous.content !== current.content}>
                  {({ getFieldValue }) => {
                    const content = String(getFieldValue('content') || '')
                    const hasPaidContent = getFieldValue('accessType') === 'paid' || hasArticleHiddenType(content, 'paid')
                    return hasPaidContent ? (
                      <Card size="small" className="article-access-settings" title="付费阅读设置">
                        <Form.Item label="文章价格" name="price" rules={[{ required: true, message: '请输入文章价格' }, { type: 'number', min: 0.01, message: '价格必须大于0' }]}><InputNumber min={0.01} precision={2} addonAfter="元" style={{ width: 180 }} /></Form.Item>
                        <Form.Item label="用户等级折扣" name="roleDiscount" valuePropName="checked" extra="开启后按用户成功充值金额匹配等级折扣"><Switch checkedChildren="开启" unCheckedChildren="关闭" /></Form.Item>
                        <div className="article-role-rebate-help">推广返佣比例由推广人的用户等级配置自动决定，按实际支付金额计算，无需在文章中单独设置。</div>
                      </Card>
                    ) : null
                  }}
                </Form.Item>
                <Form.Item label="发布状态" name="isPublished" valuePropName="checked" extra="关闭后保存为草稿，不会在博客前台展示"><Switch checkedChildren="已发布" unCheckedChildren="草稿" /></Form.Item>
                <Upload accept="image/*" showUploadList={false} beforeUpload={(file) => { prepareUpload(file, true); return false }}>
                  <Button icon={<PictureOutlined />} onMouseDown={(event) => { event.preventDefault(); rememberContentSelection() }}>上传图片并设置尺寸</Button>
                </Upload>
              </Card>
            </Col>
          </Row>
          <div className="article-editor-actions">
            <Button icon={<ArrowLeftOutlined />} onClick={() => setModalOpen(false)}>取消</Button>
            <Space>
              <Button loading={saving} onClick={() => void save(false)}>保存草稿</Button>
              <Button loading={saving} type="primary" icon={<SaveOutlined />} onClick={() => void save(true)}>发布文章</Button>
            </Space>
          </div>
        </Form>
      </Modal>

      <Modal title="设置图片显示尺寸" open={imageUploadOpen} onCancel={() => { setImageUploadOpen(false); setPendingImage(null) }} onOk={() => void confirmImageUpload()} okText="上传并插入" cancelText="取消" destroyOnHidden>
        <p className="article-upload-hint">可填写图片在文章中的显示尺寸，留空表示按原始尺寸自适应显示。</p>
        <Row gutter={16}>
          <Col xs={24} sm={12}><InputNumber value={imageWidth} onChange={(value) => setImageWidth(value ?? undefined)} min={1} max={2400} addonAfter="像素" placeholder="宽度" style={{ width: '100%' }} /></Col>
          <Col xs={24} sm={12}><InputNumber value={imageHeight} onChange={(value) => setImageHeight(value ?? undefined)} min={1} max={2400} addonAfter="像素" placeholder="高度" style={{ width: '100%' }} /></Col>
        </Row>
      </Modal>
    </div>
  )
}





