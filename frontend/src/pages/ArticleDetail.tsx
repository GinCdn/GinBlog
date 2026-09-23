import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
  CommentOutlined,
  EyeOutlined,
  FolderOpenOutlined,
  HomeOutlined,
  LikeOutlined,
  MinusOutlined,
  PlusOutlined,
  ShareAltOutlined,
  StarOutlined,
  LockOutlined,
  ReadOutlined,
  TagOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Button, Empty, Form, Input, message, Modal, Popover, Radio, Skeleton, Space } from 'antd'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { publicApi, userApi } from '@/api'
import BlogArticleCover from '@/components/BlogArticleCover'
import BlogFooter from '@/components/BlogFooter'
import BlogHeader from '@/components/BlogHeader'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { useAppStore } from '@/store'
import { getToken } from '@/utils/auth'
import { maskArticleHiddenContent } from '@/utils/articleContent'
import { getQQAvatarUrl } from '@/utils/avatar'
import type { Article, Category, Comment, PageResponse } from '@/types'
import { formatBlogDate, getArticleAuthor, getArticleAuthorQQ, getArticleCover, getArticleExcerpt, getArticleTagNames, getCategoryPath, getChineseSiteText } from '@/utils/blog'
import { extractMarkdownHeadings } from '@/utils/markdown'

interface HeadingItem {
  title: string
  level: number
  id: string
}
interface ArticleCategoryItem { category: Category; depth: number; hasChildren: boolean }
interface CommentNode extends Comment { children: CommentNode[] }
type ApiRecord = Record<string, unknown>

const commentEmojis = [0x1f600, 0x1f604, 0x1f60a, 0x1f602, 0x1f60d, 0x1f618, 0x1f914, 0x1f60e, 0x1f44d, 0x1f44f, 0x1f389, 0x2764, 0x1f64f, 0x1f62d, 0x1f621].map((codePoint) => String.fromCodePoint(codePoint))

/** 兼容后端返回布尔值、数字或字符串形式的状态字段。 */
function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase())
  return false
}

/** 将分类树整理为文章侧栏可直接展示的分类列表。 */
function flattenArticleCategories(categories: Category[], expandedCategoryIds: number[], depth = 0): ArticleCategoryItem[] {
  return categories.flatMap((category) => {
    const children = category.children || []
    const item: ArticleCategoryItem = { category, depth, hasChildren: children.length > 0 }
    if (!item.hasChildren || !expandedCategoryIds.includes(category.cid)) return [item]
    return [item, ...flattenArticleCategories(children, expandedCategoryIds, depth + 1)]
  })
}

/** 提取 Markdown 二级和三级标题，供文章页右侧结构导航展示。 */
function getHeadings(content: string): HeadingItem[] {
  return extractMarkdownHeadings(maskArticleHiddenContent(content || '')).slice(0, 10)
}

/** 兼容后端直接列表和分页包装两种文章详情响应。 */
function extractArticle(data: unknown): Article | undefined {
  const source = (data || {}) as ApiRecord
  const list = Array.isArray(data) ? data : Array.isArray(source.list) ? source.list : ((source.data || {}) as ApiRecord).list
  if (!Array.isArray(list) || !list[0]) return undefined
  const value = list[0] as ApiRecord
  const read = <T,>(...keys: string[]): T | undefined => {
    for (const key of keys) {
      const item = value[key]
      if (item !== undefined && item !== null) return item as T
    }
    return undefined
  }
  const booleanValue = toBoolean
  return {
    ...value,
    id: Number(read('id', 'ID') || 0),
    title: String(read('title', 'Title') || ''),
    content: String(read('content', 'Content') || ''),
    description: String(read('description', 'Description') || ''),
    categoryId: Number(read('categoryId', 'category_id', 'CategoryID') || 0),
    accessType: String(read('accessType', 'access_type', 'AccessType') || 'public'),
    price: Number(read('price', 'Price') || 0),
    roleDiscount: booleanValue(read('roleDiscount', 'role_discount', 'RoleDiscount')),
    isUnlocked: booleanValue(read('isUnlocked', 'is_unlocked', 'IsUnlocked')),
    payablePrice: Number(read('payablePrice', 'payable_price', 'PayablePrice') || 0),
    discountRate: Number(read('discountRate', 'discount_rate', 'DiscountRate') || 100),
    hasPaidContent: booleanValue(read('hasPaidContent', 'has_paid_content', 'HasPaidContent')),
    hasCommentContent: booleanValue(read('hasCommentContent', 'has_comment_content', 'HasCommentContent')),
    paidContentUnlocked: booleanValue(read('paidContentUnlocked', 'paid_content_unlocked', 'PaidContentUnlocked')),
    commentContentUnlocked: booleanValue(read('commentContentUnlocked', 'comment_content_unlocked', 'CommentContentUnlocked')),
    likeCount: Number(read('likeCount', 'like_count', 'LikeCount') || 0),
    liked: booleanValue(read('liked', 'Liked')) || false,
    favoriteCount: Number(read('favoriteCount', 'favorite_count', 'FavoriteCount') || 0),
    favorited: booleanValue(read('favorited', 'Favorited')) || false,
    previous: read('previous', 'Previous'),
    next: read('next', 'Next'),
    unlockReason: String(read('unlockReason', 'unlock_reason', 'UnlockReason') || ''),
  } as Article
}

/** 在后端未附加局部访问状态时，从已返回正文兼容识别付费隐藏区块。 */
function hasPaidHiddenBlock(content: string): boolean {
  return /(^|\n)\s*:::ginblog-hidden\s+paid\s*\r?\n/i.test(content)
    || /\[ginblog-hidden\s*:\s*paid\s*\]/i.test(content)
}

/** 合并文章访问状态接口，兼容下划线、驼峰和历史首字母大写字段。 */
function mergeArticleAccess(article: Article, value: unknown): Article {
  const source = (value || {}) as ApiRecord
  const read = <T,>(...keys: string[]): T | undefined => {
    for (const key of keys) {
      const item = source[key]
      if (item !== undefined && item !== null) return item as T
    }
    return undefined
  }
  const booleanValue = (item: unknown): boolean | undefined => {
    if (item === undefined || item === null) return undefined
    if (typeof item === 'boolean') return item
    if (typeof item === 'number') return item !== 0
    if (typeof item === 'string') return ['true', '1', 'yes', 'on'].includes(item.trim().toLowerCase())
    return undefined
  }
  const result: Article = { ...article }
  const accessType = read<string>('accessType', 'access_type', 'AccessType')
  const price = read<number>('price', 'Price')
  const payablePrice = read<number>('payablePrice', 'payable_price', 'PayablePrice')
  const discountRate = read<number>('discountRate', 'discount_rate', 'DiscountRate')
  const unlockReason = read<string>('unlockReason', 'unlock_reason', 'UnlockReason')
  if (accessType !== undefined) result.accessType = accessType
  if (price !== undefined) result.price = Number(price)
  if (payablePrice !== undefined) result.payablePrice = Number(payablePrice)
  if (discountRate !== undefined) result.discountRate = Number(discountRate)
  if (unlockReason !== undefined) result.unlockReason = unlockReason
  const fields: Array<[keyof Article, string[]]> = [
    ['roleDiscount', ['roleDiscount', 'role_discount', 'RoleDiscount']],
    ['isUnlocked', ['isUnlocked', 'is_unlocked', 'IsUnlocked']],
    ['hasProtectedContent', ['hasProtectedContent', 'has_protected_content', 'HasProtectedContent']],
    ['hasPaidContent', ['hasPaidContent', 'has_paid_content', 'HasPaidContent']],
    ['hasCommentContent', ['hasCommentContent', 'has_comment_content', 'HasCommentContent']],
    ['paidContentUnlocked', ['paidContentUnlocked', 'paid_content_unlocked', 'PaidContentUnlocked']],
    ['commentContentUnlocked', ['commentContentUnlocked', 'comment_content_unlocked', 'CommentContentUnlocked']],
  ]
  fields.forEach(([key, keys]) => {
    const value = booleanValue(read(...keys))
    if (value !== undefined) result[key] = value as never
  })
  return result
}

/** 统一读取评论接口返回的列表，兼容历史分页字段。 */
function extractComments(data: unknown): Comment[] {
  const source = (data || {}) as ApiRecord
  const nested = (source.data || {}) as ApiRecord
  const list = Array.isArray(data) ? data : Array.isArray(source.list) ? source.list : nested.list
  if (!Array.isArray(list)) return []
  return list.map((item) => {
    const value = (item || {}) as ApiRecord
    return {
      id: Number(value.id ?? value.ID ?? 0),
      articleId: Number(value.articleId ?? value.article_id ?? value.ArticleID ?? 0),
      content: String(value.content ?? value.Content ?? ''),
      userId: Number(value.userId ?? value.user_id ?? value.UserID ?? 0) || undefined,
      nickName: String(value.nickName ?? value.nick_name ?? value.NickName ?? '访客'),
      email: String(value.email ?? value.Email ?? ''),
      qq: String(value.qq ?? value.QQ ?? ''),
      parentId: Number(value.parentId ?? value.parent_id ?? value.ParentID ?? 0),
      isAuthor: toBoolean(value.isAuthor ?? value.is_author ?? value.IsAuthor),
      status: Number(value.status ?? value.Status ?? 1),
      createTime: String(value.createTime ?? value.create_time ?? value.CreateTime ?? ''),
      likeCount: Number(value.likeCount ?? value.like_count ?? value.LikeCount ?? 0),
       liked: toBoolean(value.liked ?? value.Liked),
    }
  }).filter((item) => item.content)
}

/** 将扁平评论列表整理为按父评论嵌套的评论树，孤立回复保留在顶层避免内容丢失。 */
function buildCommentTree(comments: Comment[]): CommentNode[] {
  const nodes = comments.map((comment) => ({ ...comment, children: [] }))
  const nodeMap = new Map<number, CommentNode>(nodes.map((node) => [node.id, node]))
  const roots: CommentNode[] = []
  nodes.forEach((node) => {
    const parent = node.parentId ? nodeMap.get(node.parentId) : undefined
    if (parent && parent.id !== node.id) parent.children.push(node)
    else roots.push(node)
  })
  return roots
}

export default function ArticleDetail() {
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const siteConfig = useAppStore((state) => state.siteConfig)
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [article, setArticle] = useState<Article>()
  const [relatedArticles, setRelatedArticles] = useState<Article[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<number[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [publicCommentTotal, setPublicCommentTotal] = useState(0)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false)
  const [purchasePayWay, setPurchasePayWay] = useState<'balance' | 'alipay' | 'wxpay'>('balance')
  const [commenting, setCommenting] = useState(false)
  const [replyTargetId, setReplyTargetId] = useState<number | null>(null)
  const [loggedIn, setLoggedIn] = useState(() => Boolean(getToken('user')))
  const [favoriteLoading, setFavoriteLoading] = useState(false)

  const articleId = Number(params.id)
  const loadComments = useCallback(async (id: number) => {
    setCommentsLoading(true)
    try {
      // 公开接口只返回已审核评论，保证未审核内容不会泄露给其他访客。
      const publicResult = await publicApi.getComments({ article_id: id, page: 1, page_size: 20 })
      const publicData = (publicResult.data || {}) as ApiRecord
      const publishedComments = extractComments(publicResult.data)
      const publishedTotal = Number(publicData.total ?? ((publicData.data || {}) as ApiRecord).total ?? publishedComments.length) || 0
      setPublicCommentTotal(publishedTotal)

      // 已登录用户额外读取自己的评论，以便看到刚提交且仍在审核中的评论。
      if (getToken('user')) {
        try {
          const userResult = await userApi.getComments({ article_id: id, page: 1, page_size: 20 })
          const merged = new Map<number, Comment>()
          publishedComments.forEach((comment) => merged.set(comment.id, comment))
          extractComments(userResult.data).forEach((comment) => merged.set(comment.id, comment))
          setComments(Array.from(merged.values()).sort((left, right) => (right.createTime || '').localeCompare(left.createTime || '')))
        } catch {
          setComments(publishedComments)
        }
      } else {
        setComments(publishedComments)
      }
    } catch {
      setComments([])
      setPublicCommentTotal(0)
    } finally {
      setCommentsLoading(false)
    }
  }, [])

  const loadArticle = useCallback(async () => {
    if (!Number.isFinite(articleId) || articleId <= 0) return
    setLoading(true)
    setArticle(undefined)
    try {
      const result = await publicApi.getArticleDetail(articleId)
      const current = extractArticle(result.data)
      if (!current) {
        setArticle(undefined)
        setRelatedArticles([])
        return
      }
      // 文章详情接口负责正文，访问状态接口负责价格、折扣和解锁状态。
      // 两个接口分工兼容旧后端，也避免详情接口未附带访问字段时不显示购买面板。
      let merged = current
      try {
        const accessResult = await publicApi.getArticleAccess(current.id)
        merged = mergeArticleAccess(current, accessResult.data)
      } catch {
        // 访问状态接口失败时保留详情接口数据，公开文章仍可正常阅读。
      }
      setArticle(merged)
      const accessType = merged.accessType || 'public'
      if (accessType !== 'hidden' && (accessType === 'comment' || merged.isUnlocked)) await loadComments(merged.id)
      try {
        const relatedResult = await publicApi.getArticles({ page: 1, page_size: 20, category_id: merged.categoryId })
        setRelatedArticles((relatedResult.data?.list || []).filter((item) => item.id !== merged.id).slice(0, 3))
      } catch {
        setRelatedArticles([])
      }
    } catch {
      setArticle(undefined)
      setRelatedArticles([])
    } finally {
      setLoading(false)
    }
  }, [articleId, loadComments])

  useEffect(() => { void loadArticle() }, [loadArticle])

  useEffect(() => {
    const paymentStatus = searchParams.get('payment')
    if (!paymentStatus) return

    if (paymentStatus === 'success') {
      message.success('\u6587\u7ae0\u5df2\u89e3\u9501\uff0c\u6b63\u5728\u5237\u65b0\u6b63\u6587')
      void loadArticle()
    } else if (paymentStatus === 'failed') {
      message.error(searchParams.get('message') || '\u652f\u4ed8\u672a\u5b8c\u6210\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5')
    }

    // 回调参数只消费一次，避免刷新页面时重复提示。
    setSearchParams({}, { replace: true })
  }, [loadArticle, searchParams, setSearchParams])
  useEffect(() => {
    let active = true
    void publicApi.getCategoryTree()
      .then((result) => {
        if (active) setCategories(Array.isArray(result.data) ? result.data : [])
      })
      .catch(() => {
        if (active) setCategories([])
      })
    return () => { active = false }
  }, [])
  useEffect(() => { setLoggedIn(Boolean(getToken('user'))) }, [params.id])

  useEffect(() => {
    if (!article) return
    const title = `${article.title} - ${getChineseSiteText(siteConfig?.title, 'GinBlog博客系统')}`
    const description = article.description?.trim() || getArticleExcerpt(article, 170)
    const keywords = article.keywords?.trim() || siteConfig?.keywords?.trim() || ''
    const cover = getArticleCover(article)
    const coverUrl = cover ? new URL(cover, window.location.origin).href : ''
    document.title = title
    const values: Array<[string, string, string]> = [
      ['name', 'description', description],
      ['name', 'keywords', keywords],
      ['property', 'og:title', title],
      ['property', 'og:description', description],
      ['property', 'og:type', 'article'],
      ['property', 'og:url', window.location.href],
    ]
    if (coverUrl) values.push(['property', 'og:image', coverUrl])
    const elements = values.filter(([, , content]) => content).map(([attribute, key, content]) => {
      let element = document.head.querySelector(`meta[data-ginblog-seo="article"][${attribute}="${key}"]`) as HTMLMetaElement | null
      if (!element) {
        element = document.createElement('meta')
        element.setAttribute('data-ginblog-seo', 'article')
        element.setAttribute(attribute, key)
        document.head.appendChild(element)
      }
      element.content = content
      return element
    })
    return () => { elements.forEach((element) => element.remove()) }
  }, [article, siteConfig?.keywords, siteConfig?.title])

  const headings = useMemo(() => getHeadings(article?.content || ''), [article?.content])
  const commentTree = useMemo(() => buildCommentTree(comments), [comments])
  const replyTarget = useMemo(() => (replyTargetId ? comments.find((comment) => comment.id === replyTargetId) : undefined), [comments, replyTargetId])
  const articleCategories = useMemo(() => flattenArticleCategories(categories, expandedCategoryIds), [categories, expandedCategoryIds])
  const cover = article ? getArticleCover(article) : undefined
  const tags = article ? getArticleTagNames(article) : []
  const description = article?.description?.trim() || (article ? getArticleExcerpt(article, 170) : '')
  const accessType = article?.accessType || 'public'
  const isUnlocked = Boolean(article && (accessType === 'public' || article.isUnlocked))
  const hasPartialPaidContent = Boolean((article?.hasPaidContent || hasPaidHiddenBlock(article?.content || '')) && !article?.paidContentUnlocked)
  const hasPartialCommentContent = Boolean(article?.hasCommentContent && !article?.commentContentUnlocked)
  const payablePrice = Number(article?.payablePrice || article?.price || 0)
  const discountRate = Number(article?.discountRate || 100)

  const openPurchase = () => {
    if (!loggedIn) {
      navigate('/user/login')
      return
    }
    setPurchasePayWay('balance')
    setPurchaseModalOpen(true)
  }

  const purchase = async () => {
    if (!loggedIn) {
      navigate('/user/login')
      return
    }
    // 预先打开空白页可减少浏览器对异步支付跳转的拦截。
    const paymentWindow = purchasePayWay === 'balance' ? null : window.open('', '_blank')
    if (paymentWindow) paymentWindow.opener = null
    setPurchasing(true)
    try {
      const result = await userApi.purchaseArticle(articleId, purchasePayWay)
      const response = (result.data || {}) as ApiRecord
      if (purchasePayWay === 'balance') {
        setPurchaseModalOpen(false)
      message.success('\u652f\u4ed8\u9875\u9762\u5df2\u5728\u65b0\u7a97\u53e3\u6253\u5f00\uff0c\u652f\u4ed8\u6210\u529f\u540e\u5c06\u81ea\u52a8\u8fd4\u56de\u5e76\u89e3\u9501\u6587\u7ae0\u3002')
        await loadArticle()
        return
      }
      const payInfo = (response.pay_info || {}) as ApiRecord
      const payUrl = String(payInfo.payurl || payInfo.url || '')
      if (!/^https?:\/\//.test(payUrl)) {
        paymentWindow?.close()
        throw new Error('支付链接创建失败')
      }
      setPurchaseModalOpen(false)
      if (paymentWindow) {
        paymentWindow.location.href = payUrl
      } else {
        window.open(payUrl, '_blank', 'noopener,noreferrer')
      }
      message.success('支付页面已在新窗口打开，完成支付后请返回并刷新文章页面。')
    } catch (error) {
      paymentWindow?.close()
      if (error instanceof Error && error.message === '支付链接创建失败') message.error(error.message)
      // 请求拦截器会展示服务端业务错误。
    } finally {
      setPurchasing(false)
    }
  }

  const toggleArticleLike = async () => {
    if (!loggedIn) {
      navigate('/user/login')
      return
    }
    try {
      const result = await publicApi.likeArticle(articleId)
      const data = result.data as ApiRecord
      setArticle((current) => current
        ? { ...current, liked: toBoolean(data?.liked), likeCount: Number(data?.like_count ?? data?.likeCount ?? data?.LikeCount ?? 0) }
        : current)
    } catch {
      // 请求封装已统一提示错误。
    }
  }

  const toggleArticleFavorite = async () => {
    if (!loggedIn) {
      navigate('/user/login')
      return
    }
    setFavoriteLoading(true)
    try {
      const result = await publicApi.favoriteArticle(articleId)
      const data = result.data as ApiRecord
      setArticle((current) => current
        ? { ...current, favorited: toBoolean(data?.favorited), favoriteCount: Number(data?.favorite_count ?? data?.favoriteCount ?? data?.FavoriteCount ?? 0) }
        : current)
    } catch {
      // 请求封装已统一提示错误。
    } finally {
      setFavoriteLoading(false)
    }
  }

  const shareArticle = async () => {
    if (!article) return
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: article.title, text: article.description || article.title, url })
        return
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const input = document.createElement('textarea')
        input.value = url
        input.setAttribute('readonly', 'true')
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.appendChild(input)
        input.select()
        const copied = document.execCommand('copy')
        input.remove()
        if (!copied) throw new Error('copy failed')
      }
      message.success('文章链接已复制')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
       message.error('分享失败，请稍后重试')
    }
  }

  const toggleCommentLike = async (commentId: number) => {
    if (!loggedIn) {
      navigate('/user/login')
      return
    }
    try {
      const result = await publicApi.likeComment(commentId)
      const data = result.data as ApiRecord
      setComments((items) => items.map((item) => (
        item.id === commentId
          ? { ...item, liked: toBoolean(data?.liked), likeCount: Number(data?.like_count ?? data?.likeCount ?? data?.LikeCount ?? 0) }
          : item
      )))
    } catch {
      // 请求封装已统一提示错误。
    }
  }
  const submitComment = async (values: { content: string; nick_name?: string; email?: string }) => {
    if (!loggedIn && (!values.nick_name?.trim() || !values.email?.trim())) {
      message.warning('游客评论需要填写昵称和邮箱')
      return
    }
    setCommenting(true)
    try {
      const commentApi = loggedIn ? userApi : publicApi
      await commentApi.createComment({
        article_id: articleId,
        parent_id: replyTargetId || 0,
        content: String(values.content || '').trim(),
        nick_name: values.nick_name,
        email: values.email,
      })
      message.success(accessType === 'comment' ? '评论提交成功，文章已解锁' : (replyTargetId ? '回复提交成功' : '评论提交成功'))
      form.resetFields()
      setReplyTargetId(null)
      setLoggedIn(Boolean(getToken('user')))
      await loadArticle()
    } catch {
    } finally {
      setCommenting(false)
    }
  }

  const renderAccessPanel = () => {
    if (accessType === 'public') {
      if (hasPartialPaidContent) {
        return (
          <section className="joe-post-access-card">
            <div className="joe-post-access-icon"><LockOutlined /></div>
            <div className="joe-post-access-body">
              <h3>部分内容付费</h3>
              <p>本文公开部分可以直接阅读，购买后可查看正文中的付费内容{article?.roleDiscount ? '，当前价格支持用户等级折扣' : ''}。</p>
              <div className="joe-post-price">
               <span>原价 ￥{Number(article?.price || 0).toFixed(2)}</span>
                {article?.roleDiscount && discountRate < 100 ? (
                  <strong>当前价格 ￥{payablePrice.toFixed(2)}（{discountRate}%折扣）</strong>
                ) : (
                  <strong>￥{payablePrice.toFixed(2)}</strong>
                )}
              </div>
              <Button type="primary" loading={purchasing} onClick={openPurchase}>
                {loggedIn ? '购买付费内容' : '登录后购买'}
              </Button>
            </div>
          </section>
        )
      }
      if (hasPartialCommentContent) {
        return (
          <section className="joe-post-access-card">
            <div className="joe-post-access-icon"><CommentOutlined /></div>
            <div className="joe-post-access-body">
              <h3>部分内容评论后可见</h3>
              <p>本文公开部分可以直接阅读，发表评论后可查看正文中的评论隐藏内容。</p>
            </div>
          </section>
        )
      }
      return null
    }

    if (isUnlocked) return null

    if (accessType === 'paid') {
      return (
        <section className="joe-post-access-card">
          <div className="joe-post-access-icon"><LockOutlined /></div>
          <div className="joe-post-access-body">
            <h3>付费文章</h3>
            <p>购买后即可阅读完整内容{article?.roleDiscount ? '，当前价格支持用户等级折扣' : ''}</p>
            <div className="joe-post-price">
               <span>原价 ￥{Number(article?.price || 0).toFixed(2)}</span>
              {article?.roleDiscount && discountRate < 100 ? (
                <strong>当前价格 ￥{payablePrice.toFixed(2)}（{discountRate}%折扣）</strong>
              ) : (
                <strong>￥{payablePrice.toFixed(2)}</strong>
              )}
            </div>
            <Button type="primary" loading={purchasing} onClick={openPurchase}>
              {loggedIn ? '立即购买' : '登录后购买'}
            </Button>
          </div>
        </section>
      )
    }

    if (accessType === 'comment') {
      return (
        <section className="joe-post-access-card">
          <div className="joe-post-access-icon"><CommentOutlined /></div>
          <div className="joe-post-access-body">
            <h3>评论后阅读</h3>
            <p>发表评论后即可阅读本文完整内容</p>
          </div>
        </section>
      )
    }

    return (
      <section className="joe-post-access-card">
        <div className="joe-post-access-icon"><LockOutlined /></div>
        <div className="joe-post-access-body">
          <h3>内容暂不可见</h3>
          <p>{article?.unlockReason || '作者暂未开放本文内容'}</p>
        </div>
      </section>
    )
  }

  const renderCommentSection = () => {
    if (accessType !== 'comment' && !isUnlocked) return null

    const renderComment = (comment: CommentNode) => {
      const avatarUrl = getQQAvatarUrl(comment.qq)
      const displayName = comment.nickName || '访客'
      return (
        <div className="joe-comment-item" key={comment.id}>
          <div className="joe-comment-avatar">
            {avatarUrl ? <img src={avatarUrl} alt={`${displayName}的QQ头像`} /> : <UserOutlined />}
          </div>
          <div className="joe-comment-main">
            <div className="joe-comment-meta">
              <strong>{displayName}</strong>
              {comment.isAuthor && <span>作者</span>}
              {comment.status === 0 && <span className="joe-comment-status is-pending">审核中</span>}
              {comment.status === 2 && <span className="joe-comment-status is-rejected">未通过</span>}
              {comment.status === 3 && <span className="joe-comment-status is-rejected">已屏蔽</span>}
              <time>{comment.createTime || ''}</time>
            </div>
            <p>{comment.content}</p>
            <div className="joe-comment-actions">
              <button
                type="button"
                className={comment.liked ? 'joe-comment-like-button is-liked' : 'joe-comment-like-button'}
                onClick={() => void toggleCommentLike(comment.id)}
              >
                <LikeOutlined /> {comment.likeCount || 0}
              </button>
              <button
                type="button"
                className="joe-comment-reply-button"
                onClick={() => {
                  setReplyTargetId(comment.id)
                  form.resetFields(['content'])
                }}
              >
                回复
              </button>
            </div>
            {comment.children.length > 0 && <div className="joe-comment-replies">{comment.children.map(renderComment)}</div>}
          </div>
        </div>
      )
    }

    return (
      <section className="joe-post-comments">
        <div className="joe-section-heading">
          <div>
            <span className="joe-section-kicker">文章交流</span>
            <h2>评论区</h2>
          </div>
          <span>{publicCommentTotal} 条</span>
        </div>
        <div className="joe-comment-list">
          {commentsLoading ? (
            <Skeleton active paragraph={{ rows: 3 }} />
          ) : commentTree.length > 0 ? (
            commentTree.map(renderComment)
          ) : (
            <p className="joe-comment-empty">暂无评论，欢迎留下您的看法。</p>
          )}
        </div>
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => void submitComment(values)}
          className="joe-comment-form"
        >
          {replyTarget && (
            <div className="joe-comment-replying">
               <span>正在回复：{replyTarget.nickName || '访客'}</span>
              <button type="button" onClick={() => { setReplyTargetId(null); form.resetFields(['content']) }}>取消回复</button>
            </div>
          )}
          <Form.Item
            name="content"
            label={replyTarget ? '回复内容' : '评论内容'}
            rules={[
              { required: true, message: '请输入评论内容' },
              { max: 128, message: '评论内容不能超过128个字符' },
            ]}
          >
            <Input.TextArea rows={4} maxLength={128} placeholder={replyTarget ? '请输入回复内容' : '请输入评论内容'} />
          </Form.Item>
          <Popover
            trigger="click"
            placement="topLeft"
            classNames={{ root: 'joe-comment-emoji-popover' }}
            content={(
              <div className="joe-comment-emoji-picker" role="listbox" aria-label="评论表情">
                {commentEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="joe-comment-emoji"
                    aria-label={`插入表情${emoji}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      const current = String(form.getFieldValue('content') || '')
                      form.setFieldsValue({ content: `${current}${emoji}` })
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          >
            <Button type="text">表情</Button>
          </Popover>
          {!loggedIn && (
            <div className="joe-comment-guest-fields">
              <Form.Item name="nick_name" label="昵称" rules={[{ required: true, message: '请输入昵称' }]}>
                <Input placeholder="请输入昵称" />
              </Form.Item>
              <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
                <Input placeholder="请输入邮箱" />
              </Form.Item>
            </div>
          )}
          <Button type="primary" htmlType="submit" loading={commenting}>{replyTarget ? '提交回复' : '提交评论'}</Button>
        </Form>
      </section>
    )
  }

  return (
    <div className="joe-blog-page joe-post-page">
      <BlogHeader active="articles" />
      <main className="joe-blog-container">
        <Skeleton loading={loading} active paragraph={{ rows: 12 }}>
          {article ? (
            <>
              <section className="joe-post-hero">
                {cover && <img className="joe-post-hero-image" src={cover} alt={`${article.title}的封面图`} />}
                <div className="joe-post-hero-overlay" />
                <div className="joe-post-hero-content">
                  <div className="joe-post-breadcrumb">
                    <button type="button" onClick={() => navigate('/')}><HomeOutlined /> 首页</button>
                    <span>/</span>
                    <button type="button" onClick={() => navigate('/articles')}>文章</button>
                    {article.category && <><span>/</span><span>{article.category.name}</span></>}
                  </div>
                  <span className="joe-post-kicker">
                    {accessType === 'paid' ? '付费阅读' : accessType === 'comment' ? '评论阅读' : accessType === 'hidden' ? '隐藏文章' : '公开文章'}
                  </span>
                  <h1>{article.title}</h1>
                  <p>{description}</p>
                  <div className="joe-post-meta">
                    <span className="joe-post-author-meta">
                      {getArticleAuthorQQ(article) ? (
                        <img src={getQQAvatarUrl(getArticleAuthorQQ(article))} alt={`${getArticleAuthor(article)}的 QQ 头像`} />
                      ) : (
                        <UserOutlined />
                      )}
                      {getArticleAuthor(article)}
                    </span>
                    <span><CalendarOutlined /> {formatBlogDate(article.createTime)}</span>
                    <span><EyeOutlined /> {article.viewCount || 0} 次阅读</span>
                    <span><CommentOutlined /> {publicCommentTotal} 条评论</span>
                  </div>
                </div>
              </section>
              <div className="joe-post-layout">
                <article className="joe-post-article">
                  <div className="joe-post-article-label">
                    <ReadOutlined />
                    <span>正文</span>
                    {article.category && (
                      <button type="button" onClick={() => navigate(getCategoryPath(article.category || { cid: article.categoryId }))}>
                        <FolderOpenOutlined /> {article.category.name}
                      </button>
                    )}
                  </div>
                  {renderAccessPanel()}
                  {isUnlocked && (
                    <div className="joe-post-content">
                      <MarkdownRenderer content={article.content || ''} />
                    </div>
                  )}
                  {accessType === 'comment' && !isUnlocked && (
                    <div className="joe-post-comment-unlock">
                      {'发表评论后即可阅读本文'}
                    </div>
                  )}
                  <div className="joe-post-article-actions" aria-label="文章操作">
                    <Button
                      type={article.liked ? 'primary' : 'default'}
                      icon={<LikeOutlined />}
                      aria-label={article.liked ? '取消点赞' : '点赞文章'}
                      title={article.liked ? '取消点赞' : '点赞文章'}
                      onClick={() => void toggleArticleLike()}
                      aria-pressed={article.liked}
                    >
                      {article.likeCount || 0}
                    </Button>
                    <Button
                      type={article.favorited ? 'primary' : 'default'}
                      icon={<StarOutlined />}
                      loading={favoriteLoading}
                      aria-label={article.favorited ? '取消收藏' : '收藏文章'}
                      title={article.favorited ? '取消收藏' : '收藏文章'}
                      onClick={() => void toggleArticleFavorite()}
                      aria-pressed={article.favorited}
                    >
                      {article.favoriteCount || 0}
                    </Button>
                    <Button icon={<ShareAltOutlined />} aria-label="分享文章" title="分享文章" onClick={() => void shareArticle()} />
                  </div>
                  {tags.length > 0 && (
                    <div className="joe-post-tags">
                      <TagOutlined /><span>标签</span>
                      {tags.map((tag) => (
                        <button key={tag} type="button" onClick={() => navigate(`/articles?title=${encodeURIComponent(tag)}`)}>#{tag}</button>
                      ))}
                    </div>
                  )}
                  {isUnlocked && (
                    <section className="joe-post-copyright">
                      <strong>版权声明</strong>
                      <p>本文由 {getArticleAuthor(article)} 原创发布，未经许可请勿转载。</p>
                      <div><span>本文链接</span><code>{window.location.href}</code></div>
                    </section>
                  )}
                  {renderCommentSection()}
                  <div className="joe-post-actions">
                    <Button
                      icon={<ArrowLeftOutlined />}
                      disabled={!article.previous}
                      onClick={() => article.previous && navigate(`/articles/${article.previous.id}`)}
                    >
                      <span>上一篇</span>
                      {article.previous && <strong>{article.previous.title}</strong>}
                    </Button>
                    <Button
                      icon={<ArrowRightOutlined />}
                      disabled={!article.next}
                      onClick={() => article.next && navigate(`/articles/${article.next.id}`)}
                    >
                      <span>下一篇</span>
                      {article.next && <strong>{article.next.title}</strong>}
                    </Button>
                  </div>
                  {relatedArticles.length > 0 && (
                    <section className="joe-post-related">
                      <div className="joe-section-heading">
                        <div><span className="joe-section-kicker">继续阅读</span><h2>相关文章</h2></div>
                      </div>
                      <div className="joe-post-related-grid">
                        {relatedArticles.map((item, index) => (
                          <button type="button" className="joe-post-related-card" key={item.id} onClick={() => navigate(`/articles/${item.id}`)}>
                            <BlogArticleCover article={item} index={index + 3} />
                            <strong>{item.title}</strong>
                            <span>{item.viewCount || 0} 次阅读</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </article>
                <aside className="joe-post-aside">
                  <section className="joe-post-aside-card joe-post-toc">
                    <div className="joe-sidebar-title"><ReadOutlined /><span>文章目录</span></div>
                    {headings.length > 0 ? (
                      <ol>
                        {headings.map((heading, index) => (
                          <li className={`level-${heading.level}`} key={`${heading.id}-${index}`}>
                            <button
                              type="button"
                              onClick={() => {
                                document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                              }}
                            >
                              {heading.title}
                            </button>
                          </li>
                        ))}
                      </ol>
                    ) : <p>暂无目录</p>}
                  </section>
                  <section className="joe-post-aside-card joe-post-note-card">
                    <div className="joe-sidebar-title"><FolderOpenOutlined /><span>文章分类</span></div>
                    {articleCategories.length > 0 ? (
                      <div className="joe-post-category-list">
                        {articleCategories.map(({ category, depth, hasChildren }) => {
                          const expanded = expandedCategoryIds.includes(category.cid)
                          return (
                            <div
                              className={`joe-post-category-row ${category.cid === article.categoryId ? 'is-active' : ''}`}
                              key={category.cid}
                              style={depth > 0 ? { paddingLeft: `${depth * 12}px` } : undefined}
                            >
                              <button className="joe-post-category-link" type="button" onClick={() => navigate(getCategoryPath(category))}>
                                <span>{category.name}</span>
                              </button>
                              {hasChildren ? (
                                <button
                                  className="joe-post-category-expand"
                                  type="button"
                                  aria-label={`${expanded ? '收起' : '展开'}${category.name}子分类`}
                                  aria-expanded={expanded}
                                  onClick={() => setExpandedCategoryIds((ids) => (
                                    ids.includes(category.cid)
                                      ? ids.filter((id) => id !== category.cid)
                                      : [...ids, category.cid]
                                  ))}
                                >
                                  {expanded ? <MinusOutlined className="joe-post-category-toggle" /> : <PlusOutlined className="joe-post-category-toggle" />}
                                </button>
                              ) : typeof category.count === 'number' && <em>{category.count}</em>}
                            </div>
                          )
                        })}
                      </div>
                    ) : <p>暂无可浏览的文章分类。</p>}
                  </section>
                </aside>
              </div>
            </>
          ) : !loading ? (
            <div className="joe-post-empty">
              <Empty description="文章不存在" />
              <Button type="primary" onClick={() => navigate('/articles')}>返回文章列表</Button>
            </div>
          ) : null}
        </Skeleton>
      </main>
      <Modal
        title="解锁文章"
        open={purchaseModalOpen}
        confirmLoading={purchasing}
        okText={purchasePayWay === 'balance' ? '确认余额支付' : '前往支付'}
        cancelText="取消"
        onCancel={() => { if (!purchasing) setPurchaseModalOpen(false) }}
        onOk={() => void purchase()}
      >
        <p>请选择解锁方式。余额支付会立即完成解锁，在线支付将在支付成功后自动解锁。</p>
        <Radio.Group value={purchasePayWay} onChange={(event) => setPurchasePayWay(event.target.value)}>
          <Space direction="vertical">
            <Radio value="balance">余额支付</Radio>
            <Radio value="alipay">支付宝</Radio>
            <Radio value="wxpay">微信支付</Radio>
          </Space>
        </Radio.Group>
      </Modal>
      <BlogFooter />
    </div>
  )
}


