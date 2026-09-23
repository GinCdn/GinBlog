import { useMemo, useState } from 'react'
import {
  ClockCircleOutlined,
  FireOutlined,
  FolderOpenOutlined,
  NotificationOutlined,
  MinusOutlined,
  PlusOutlined,
  TagOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store'
import type { Article, Category } from '@/types'
import { getArticleTagNames, getCategoryPath, getChineseSiteText } from '@/utils/blog'

interface SidebarCategoryItem {
  category: Category
  depth: number
  hasChildren: boolean
}

/** 按展开状态扁平化分类树，生成侧栏渲染所需的一维列表。 */
function flattenCategories(categories: Category[], expandedIds: number[], depth = 0): SidebarCategoryItem[] {
  return categories.flatMap((category) => {
    const children = category.children || []
    const item: SidebarCategoryItem = { category, depth, hasChildren: children.length > 0 }
    if (!item.hasChildren || !expandedIds.includes(category.cid)) return [item]
    return [item, ...flattenCategories(children, expandedIds, depth + 1)]
  })
}

interface BlogSidebarProps {
  articles?: Article[]
  categories?: Category[]
  articleCount?: number
  activeCategory?: number
  onCategorySelect?: (categoryId?: number) => void
  className?: string
  loading?: boolean
}

/** Joe 风格公开博客侧栏，集中展示作者、统计、公告、热门文章、分类和标签。 */
export default function BlogSidebar({
  articles = [],
  categories = [],
  articleCount,
  activeCategory,
  onCategorySelect,
  className = '',
  loading = false,
}: BlogSidebarProps) {
  const navigate = useNavigate()
  const siteConfig = useAppStore((state) => state.siteConfig)
  const systemName = getChineseSiteText(siteConfig?.title, 'GinBlog博客系统')
  const description = getChineseSiteText(siteConfig?.description || siteConfig?.sub_title, '记录技术实践，分享真实经验。')
  const logo = siteConfig?.logo?.trim()
  const sortedArticles = useMemo(() => [...articles].sort((left, right) => (right.viewCount || 0) - (left.viewCount || 0)).slice(0, 5), [articles])
  const tags = useMemo(() => {
    const names = new Set<string>()
    articles.forEach((article) => getArticleTagNames(article).forEach((name) => names.add(name)))
    categories.forEach((category) => category.name && names.add(category.name))
    return Array.from(names).slice(0, 12)
  }, [articles, categories])
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<number[]>([])
  const categoryItems = useMemo(() => flattenCategories(categories, expandedCategoryIds), [categories, expandedCategoryIds])
  const currentDay = new Date().getDate()
  const monthProgress = Math.min(100, Math.round((currentDay / 31) * 100))

  const selectCategory = (category?: Category) => {
    if (onCategorySelect) {
      onCategorySelect(category?.cid)
      return
    }
    navigate(category ? getCategoryPath(category) : '/articles')
  }

  return (
    <aside className={`joe-blog-sidebar ${className}`.trim()}>
      {loading ? (
        <div className="joe-sidebar-loading" aria-label="首页侧栏内容加载中">
          <div className="joe-sidebar-loading-card joe-sidebar-loading-author" />
          <div className="joe-sidebar-loading-card" />
          <div className="joe-sidebar-loading-card" />
          <div className="joe-sidebar-loading-card" />
          <div className="joe-sidebar-loading-card" />
        </div>
      ) : (
        <>
      <section className="joe-sidebar-card joe-sidebar-author-card">
        <div className="joe-sidebar-author-cover" />
        <div className="joe-sidebar-author-content">
          <div className="joe-sidebar-avatar">
            {logo ? <img src={logo} alt={`${systemName}头像`} /> : <UserOutlined />}
          </div>
          <strong>{systemName}</strong>
          <p>{description}</p>
          <div className="joe-sidebar-stats">
            <div><strong>{articleCount ?? articles.length}</strong><span>文章数</span></div>
            <div><strong>{articles.reduce((total, article) => total + (article.commentCount || 0), 0)}</strong><span>评论数</span></div>
          </div>
        </div>
      </section>

      <section className="joe-sidebar-card joe-sidebar-lines-card">
        <div className="joe-sidebar-title"><NotificationOutlined /><span>站点公告</span></div>
        <p className="joe-sidebar-notice">
          {siteConfig?.admin_kf_qq?.trim() ? `欢迎交流技术问题，联系 QQ：${siteConfig.admin_kf_qq.trim()}` : '欢迎来到GinBlog博客系统，愿每一次记录都能沉淀为新的收获。'}
        </p>
      </section>

      <section className="joe-sidebar-card joe-sidebar-lines-card">
        <div className="joe-sidebar-title"><ClockCircleOutlined /><span>人生倒计时</span></div>
        <div className="joe-sidebar-progress-item"><div><span>本月已经过去</span><em>{monthProgress}%</em></div><i><b style={{ width: `${monthProgress}%` }} /></i></div>
        <div className="joe-sidebar-progress-item"><div><span>今天已经过去</span><em>{Math.min(100, new Date().getHours() * 100 / 24).toFixed(0)}%</em></div><i><b className="is-orange" style={{ width: `${Math.min(100, new Date().getHours() * 100 / 24)}%` }} /></i></div>
      </section>

      <section className="joe-sidebar-card joe-sidebar-lines-card">
        <div className="joe-sidebar-title"><FireOutlined /><span>热门文章</span></div>
        <div className="joe-sidebar-hot-list">
          {sortedArticles.length > 0 ? sortedArticles.map((article, index) => (
            <button key={article.id} type="button" onClick={() => navigate(`/articles/${article.id}`)}>
              <span className="joe-sidebar-hot-index">{String(index + 1).padStart(2, '0')}</span>
              <span><strong>{article.title}</strong><em>{article.viewCount || 0} 次阅读</em></span>
            </button>
          )) : <p className="joe-sidebar-empty">暂无热门文章</p>}
        </div>
      </section>

      <section className="joe-sidebar-card joe-sidebar-lines-card">
        <div className="joe-sidebar-title"><FolderOpenOutlined /><span>文章分类</span></div>
        <div className="joe-sidebar-category-list">
          <button className={activeCategory === undefined ? 'is-active' : ''} type="button" onClick={() => selectCategory()}>
            <span>全部文章</span><em>{articleCount ?? articles.length}</em>
          </button>
          {categoryItems.map(({ category, depth, hasChildren }) => {
            const expanded = expandedCategoryIds.includes(category.cid)
            return (
              <div
                className={`joe-sidebar-category-row ${activeCategory === category.cid ? 'is-active' : ''}`}
                key={category.cid}
                style={depth > 0 ? { paddingLeft: `${depth * 14}px` } : undefined}
              >
                <button className="joe-sidebar-category-link" type="button" onClick={() => selectCategory(category)}>
                  <span>{category.name}</span>
                </button>
                {hasChildren ? (
                  <button
                    className="joe-sidebar-category-expand"
                    type="button"
                    aria-label={`${expanded ? '收起' : '展开'}${category.name}子分类`}
                    aria-expanded={expanded}
                    onClick={() => setExpandedCategoryIds((ids) => ids.includes(category.cid) ? ids.filter((id) => id !== category.cid) : [...ids, category.cid])}
                  >
                    {expanded ? <MinusOutlined className="joe-sidebar-category-toggle" /> : <PlusOutlined className="joe-sidebar-category-toggle" />}
                  </button>
                ) : (typeof category.count === 'number' ? <em>{category.count}</em> : null)}
              </div>
            )
          })}
        </div>
      </section>

      <section className="joe-sidebar-card joe-sidebar-lines-card">
        <div className="joe-sidebar-title"><TagOutlined /><span>标签云</span></div>
        <div className="joe-sidebar-tags">
          {tags.length > 0 ? tags.map((tag) => <button key={tag} type="button" onClick={() => navigate(`/articles?title=${encodeURIComponent(tag)}`)}>{tag}</button>) : <span>暂无标签</span>}
        </div>
      </section>

        </>
      )}
    </aside>
  )
}
