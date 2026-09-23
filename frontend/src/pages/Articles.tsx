import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppstoreOutlined, ArrowRightOutlined, CalendarOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons'
import { Empty, Pagination, Skeleton } from 'antd'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { publicApi } from '@/api'
import BlogArticleCover from '@/components/BlogArticleCover'
import BlogFooter from '@/components/BlogFooter'
import BlogHeader from '@/components/BlogHeader'
import BlogSidebar from '@/components/BlogSidebar'
import type { Article, Category, PageResponse } from '@/types'
import { flattenCategories, formatBlogDate, getArticleExcerpt, getArticleTagNames, getCategoryPath } from '@/utils/blog'

/** 公开文章归档页，保留分类筛选和标题搜索并改为 Joe 风格列表布局。 */
// 递归查找指定分类。
function findCategoryById(items: Category[], categoryId?: number): Category | undefined {
  if (!categoryId) return undefined
  for (const item of items) {
    if (item.cid === categoryId) return item
    const found = findCategoryById(item.children || [], categoryId)
    if (found) return found
  }
  return undefined
}

// 按分类缩略名递归查找分类。
function findCategoryBySlug(items: Category[], slug: string): Category | undefined {
  for (const item of items) {
    if (item.slug?.trim() === slug) return item
    const found = findCategoryBySlug(item.children || [], slug)
    if (found) return found
  }
  return undefined
}

// 生成带层级缩进的分类筛选项。
function renderCategoryOptions(items: Category[], depth = 0): ReactNode[] {
  return items.flatMap((category) => [
    <option key={category.cid} value={category.cid}>
      {`${depth > 0 ? `${'\u3000'.repeat(depth)}\u2514 ` : ''}${category.name}`}
    </option>,
    ...renderCategoryOptions(category.children || [], depth + 1),
  ])
}

export default function Articles() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { slug } = useParams()
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [data, setData] = useState<PageResponse<Article>>({})
  const [page, setPage] = useState(1)
  const [categoryId, setCategoryId] = useState<number | undefined>(() => {
    const value = Number(searchParams.get('category_id'))
    return Number.isFinite(value) && value > 0 ? value : undefined
  })
  const [title, setTitle] = useState(() => searchParams.get('title') || '')
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const categorySlug = slug?.trim() || ''
  const pageSize = 20

  const loadArticles = async (nextPage = page, nextTitle = title, nextCategoryId = categoryId) => {
    setLoading(true)
    try {
      const result = await publicApi.getArticles({ page: nextPage, page_size: pageSize, category_id: nextCategoryId, title: nextTitle.trim() || undefined })
      setData(result.data || {})
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void publicApi.getCategoryTree()
      .then((result) => { if (active) setCategories(flattenCategories(result.data || [])) })
      .catch(() => { if (active) setCategories([]) })
      .finally(() => { if (active) setCategoriesLoaded(true) })
    return () => { active = false }
  }, [])

  const routeCategory = useMemo(() => categorySlug ? findCategoryBySlug(categories, categorySlug) : undefined, [categories, categorySlug])
  const selectedCategory = useMemo(() => categorySlug ? routeCategory : findCategoryById(categories, categoryId), [categories, categoryId, categorySlug, routeCategory])
  const effectiveCategoryId = selectedCategory?.cid ?? (categorySlug ? undefined : categoryId)

  useEffect(() => {
    if (categorySlug && !categoriesLoaded) return
    if (categorySlug && !routeCategory) {
      setData({ list: [], total: 0 })
      return
    }
    void loadArticles(page, title, effectiveCategoryId)
  }, [categoriesLoaded, categoryId, categorySlug, effectiveCategoryId, page, routeCategory])
  const total = data.total ?? data.pagination?.total ?? 0

  const handleSearch = (keyword: string) => {
    setTitle(keyword)
    setPage(1)
    const nextParams: Record<string, string> = {}
    if (keyword.trim()) nextParams.title = keyword.trim()
    if (!categorySlug && effectiveCategoryId) nextParams.category_id = String(effectiveCategoryId)
    setSearchParams(nextParams)
    void loadArticles(1, keyword, effectiveCategoryId)
  }

  const handleCategoryChange = (value: string) => {
    const nextCategoryId = value ? Number(value) : undefined
    const nextCategory = findCategoryById(categories, nextCategoryId)
    const keyword = title.trim()
    setPage(1)
    setCategoryId(nextCategoryId)
    if (!nextCategory) {
      navigate(keyword ? `/articles?title=${encodeURIComponent(keyword)}` : '/articles')
      return
    }
    const nextPath = getCategoryPath(nextCategory)
    navigate(keyword ? `${nextPath}?title=${encodeURIComponent(keyword)}` : nextPath)
  }

  return (
    <div className="joe-blog-page joe-archive-page">
      <BlogHeader active="articles" onSearch={handleSearch} searchValue={title} />
      <main className="joe-blog-container">
        <div className="joe-archive-layout">
          <div className="joe-archive-main">
            <section className="joe-archive-banner">
              <div><span className="joe-archive-banner-kicker">文章归档</span><h1>{selectedCategory ? selectedCategory.name : '文章归档'}</h1><p>{selectedCategory?.description || '按时间整理每一篇公开文章，持续记录开发、架构与项目实践。'}</p></div>
              <div className="joe-archive-banner-count"><strong>{total}</strong><span>篇文章</span></div>
            </section>

            <section className="joe-archive-toolbar">
              <div className="joe-archive-toolbar-title"><AppstoreOutlined /><span>筛选文章</span></div>
              <label className="joe-archive-select">
                <span>分类</span>
                <select value={effectiveCategoryId ? String(effectiveCategoryId) : ''} onChange={(event) => handleCategoryChange(event.target.value)} aria-label="文章分类">
                  <option value="">全部分类</option>
                  {renderCategoryOptions(categories)}
                </select>
              </label>
              <form className="joe-archive-search" onSubmit={(event) => { event.preventDefault(); handleSearch(title) }}>
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="搜索文章标题" aria-label="搜索文章标题" />
                <button type="submit" aria-label="搜索"><SearchOutlined /></button>
              </form>
            </section>

            <Skeleton loading={loading} active paragraph={{ rows: 9 }}>
              {(data.list?.length || 0) > 0 ? (
                <div className="joe-archive-list">
                  {data.list?.map((article, index) => (
                    <article className="joe-archive-item" key={article.id} onClick={() => navigate(`/articles/${article.id}`)} role="link" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/articles/${article.id}`) }}>
                      <BlogArticleCover article={article} index={index} className="joe-archive-cover" />
                      <div className="joe-archive-item-content">
                        <div className="joe-archive-item-meta"><span className="joe-latest-category">{article.category?.name || '未分类'}</span><span><CalendarOutlined /> {formatBlogDate(article.createTime)}</span><span><EyeOutlined /> {article.viewCount || 0}</span></div>
                        <h2>{article.title}</h2>
                        <p>{getArticleExcerpt(article, 180)}</p>
                        <div className="joe-card-tags">{getArticleTagNames(article).slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
                      </div>
                      <ArrowRightOutlined className="joe-archive-arrow" />
                    </article>
                  ))}
                </div>
              ) : !loading ? <div className="joe-archive-empty"><Empty description="没有找到匹配的文章" /></div> : null}
            </Skeleton>

            {total > pageSize && <div className="joe-archive-pagination"><Pagination current={page} pageSize={pageSize} total={total} onChange={setPage} showSizeChanger={false} /></div>}
          </div>
          <BlogSidebar articles={data.list || []} categories={categories} articleCount={total} activeCategory={effectiveCategoryId} onCategorySelect={(value) => handleCategoryChange(value ? String(value) : '')} />
        </div>
      </main>
      <BlogFooter />
    </div>
  )
}