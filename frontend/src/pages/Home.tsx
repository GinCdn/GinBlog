import { useEffect, useMemo, useState } from 'react'
import {
  AppstoreOutlined,
  ArrowRightOutlined,
  BookOutlined,
  CalendarOutlined,
  CodeOutlined,
  EyeOutlined,
  FireOutlined,
  LeftOutlined,
  PictureOutlined,
  ReadOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { Empty, Skeleton } from 'antd'
import { useNavigate } from 'react-router-dom'
import { publicApi } from '@/api'
import BlogArticleCover from '@/components/BlogArticleCover'
import BlogFooter from '@/components/BlogFooter'
import BlogHeader from '@/components/BlogHeader'
import BlogSidebar from '@/components/BlogSidebar'
import { useAppStore } from '@/store'
import type { Article, Category, CarouselConfig } from '@/types'
import { flattenCategories, formatBlogDate, getArticleExcerpt, getArticleTagNames, getChineseSiteText } from '@/utils/blog'

/** 公开博客首页，采用博客主视觉、卡片内容区和综合侧栏。 */
export default function Home() {
  const navigate = useNavigate()
  const siteConfig = useAppStore((state) => state.siteConfig)
  const [articles, setArticles] = useState<Article[]>([])
  const [carousels, setCarousels] = useState<CarouselConfig[]>([])
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [activeCategory, setActiveCategory] = useState<number>()
  const [articleTotal, setArticleTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const systemName = getChineseSiteText(siteConfig?.title, 'GinBlog博客系统')
  const subtitle = getChineseSiteText(siteConfig?.sub_title, '记录技术实践，分享真实经验')
  const description = getChineseSiteText(siteConfig?.description, '一个专注于开发、架构与真实项目经验的个人博客。')
  const favicon = siteConfig?.favicon?.trim()

  useEffect(() => {
    document.title = `${systemName} - ${subtitle}`
    let icon = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null
    if (!icon) {
      icon = document.createElement('link')
      icon.rel = 'icon'
      document.head.appendChild(icon)
    }
    icon.href = favicon || '/favicon.ico'
  }, [favicon, subtitle, systemName])

  useEffect(() => {
    let active = true
    const loadBlogData = async () => {
      setLoading(true)
      const [articleResult, categoryResult, carouselResult] = await Promise.allSettled([
        publicApi.getArticles({ page: 1, page_size: 20, category_id: activeCategory }),
        publicApi.getCategoryTree(),
        publicApi.getCarousels(),
      ])
      if (!active) return

      if (articleResult.status === 'fulfilled') {
        const pageData = articleResult.value.data
        const list = pageData?.list || []
        setArticles(list)
        setArticleTotal(pageData?.total ?? pageData?.pagination?.total ?? list.length)
      } else {
        setArticles([])
        setArticleTotal(0)
      }
      if (categoryResult.status === 'fulfilled') setCategories(flattenCategories(categoryResult.value.data || []))
      else setCategories([])
      if (carouselResult.status === 'fulfilled') setCarousels((carouselResult.value.data || []).filter((item) => item.image?.trim() && item.status !== false))
      else setCarousels([])
      setLoading(false)
    }
    void loadBlogData()
    return () => { active = false }
  }, [activeCategory])

  useEffect(() => {
    setCarouselIndex(0)
    if (carousels.length < 2) return
    const timer = window.setInterval(() => setCarouselIndex((index) => (index + 1) % carousels.length), 3000)
    return () => window.clearInterval(timer)
  }, [carousels])

  const switchCarousel = (offset: number) => {
    if (carousels.length < 2) return
    setCarouselIndex((index) => (index + offset + carousels.length) % carousels.length)
  }

  const featuredArticle = articles[0]
  const hotArticles = useMemo(() => [...articles].sort((left, right) => (right.viewCount || 0) - (left.viewCount || 0)).slice(0, 6), [articles])
  const latestArticles = useMemo(() => articles.slice(0, 8), [articles])

  return (
    <div className="joe-blog-page joe-home-page">
      <BlogHeader active="home" />
      <main className="joe-blog-container">
        <div className="joe-home-layout">
          <div className="joe-home-main">
            <section className={`joe-home-hero ${loading ? 'is-loading' : carousels.length > 0 ? 'has-carousel' : ''}`}>
              {loading && <div className="joe-home-hero-loading" aria-label="首页内容加载中" />}
              {!loading && carousels.length > 0 && (
                <button
                  type="button"
                  className="joe-home-carousel-slide"
                  style={{ backgroundImage: `url("${carousels[carouselIndex].image}")` }}
                  aria-label={`查看第${carouselIndex + 1}张轮播图`}
                  onClick={() => {
                    const link = carousels[carouselIndex].link?.trim()
                    if (!link) return
                    if (link.startsWith('/')) navigate(link)
                    else if (/^https?:\/\//i.test(link)) window.open(link, '_blank', 'noopener,noreferrer')
                  }}
                />
              )}
              {!loading && carousels.length === 0 && (
                <>
              <div className="joe-home-hero-overlay" aria-hidden="true" />
              <div className="joe-home-hero-grid" aria-hidden="true" />
              <div className="joe-home-hero-orbit joe-home-hero-orbit-one" aria-hidden="true" />
              <div className="joe-home-hero-orbit joe-home-hero-orbit-two" aria-hidden="true" />
              <div className="joe-home-hero-copy">
                <span className="joe-home-hero-kicker">GinBlog博客系统 · 技术笔记</span>
                <h1>{systemName}</h1>
                <p>{subtitle}</p>
                <div className="joe-home-hero-actions">
                  <button type="button" onClick={() => featuredArticle ? navigate(`/articles/${featuredArticle.id}`) : navigate('/articles')}>
                    {featuredArticle ? '阅读精选' : '浏览文章'} <ArrowRightOutlined />
                  </button>
                  <span><ReadOutlined /> 开始一段持续记录</span>
                </div>
              </div>
              <div className="joe-home-hero-featured">
                <small>{carousels.length > 0 ? `轮播图 ${carouselIndex + 1} / ${carousels.length}` : '本期精选'}</small>
                <strong>{featuredArticle?.title || '把复杂问题写清楚，把实践经验留下来'}</strong>
                <span>{featuredArticle ? getArticleExcerpt(featuredArticle, 78) : description}</span>
              </div>
              </>
              )}
              {!loading && carousels.length > 1 && (
                <div className="joe-home-carousel-controls" aria-label="轮播图左右切换">
                  <button type="button" className="joe-home-carousel-control is-prev" aria-label="上一张轮播图" title="上一张" onClick={() => switchCarousel(-1)}><LeftOutlined /></button>
                  <button type="button" className="joe-home-carousel-control is-next" aria-label="下一张轮播图" title="下一张" onClick={() => switchCarousel(1)}><RightOutlined /></button>
                </div>
              )}
              {!loading && carousels.length > 0 && (
                <div className="joe-home-hero-dots" aria-label="轮播图切换">
                  {carousels.map((carousel, index) => <button key={carousel.id} type="button" className={index === carouselIndex ? 'is-active' : ''} aria-label={`切换到第${index + 1}张`} onClick={() => setCarouselIndex(index)} />)}
                </div>
              )}
            </section>

            <section className="joe-home-section">
              <div className="joe-section-heading">
                <div><span className="joe-section-kicker"><FireOutlined /> 内容精选</span><h2>热门文章</h2></div>
                <button type="button" onClick={() => navigate('/articles')}>查看全部 <ArrowRightOutlined /></button>
              </div>
              <Skeleton loading={loading} active paragraph={{ rows: 5 }}>
                {hotArticles.length > 0 ? (
                  <div className="joe-hot-grid">
                    {hotArticles.map((article, index) => (
                      <article className="joe-hot-card" key={article.id} onClick={() => navigate(`/articles/${article.id}`)} role="link" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/articles/${article.id}`) }}>
                        <div className="joe-hot-card-cover-wrap"><BlogArticleCover article={article} index={index} className="joe-hot-card-cover" /><span className="joe-hot-card-rank">{(article.viewCount || 0).toLocaleString()} 阅读</span></div>
                        <div className="joe-hot-card-body">
                          <div className="joe-card-tags">{article.category && <span>{article.category.name}</span>}{getArticleTagNames(article).slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}</div>
                          <h3>{article.title}</h3>
                          <div className="joe-card-meta"><span>{formatBlogDate(article.createTime)}</span><span><EyeOutlined /> {article.viewCount || 0}</span><span><span className="joe-card-meta-dot" /> {article.commentCount || 0}</span></div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : !loading ? <Empty description="暂无公开文章" /> : null}
              </Skeleton>
            </section>

            <section className="joe-home-section joe-latest-section">
              <div className="joe-section-heading">
                <div><span className="joe-section-kicker"><CalendarOutlined /> 最新动态</span><h2>最新发布</h2></div>
                <button type="button" onClick={() => navigate('/articles')}>文章归档 <ArrowRightOutlined /></button>
              </div>
              <Skeleton loading={loading} active paragraph={{ rows: 7 }}>
                {latestArticles.length > 0 ? (
                  <div className="joe-latest-list">
                    {latestArticles.map((article, index) => (
                      <article className="joe-latest-item" key={article.id} onClick={() => navigate(`/articles/${article.id}`)} role="link" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/articles/${article.id}`) }}>
                        <BlogArticleCover article={article} index={index + 2} className="joe-latest-thumb" />
                        <div className="joe-latest-content"><div className="joe-latest-meta"><span className="joe-latest-category">{article.category?.name || '未分类'}</span><span>{formatBlogDate(article.createTime)}</span><span><EyeOutlined /> {article.viewCount || 0}</span></div><h3>{article.title}</h3><p>{getArticleExcerpt(article, 120)}</p></div>
                        <ArrowRightOutlined className="joe-latest-arrow" />
                      </article>
                    ))}
                  </div>
                ) : !loading ? <Empty description="暂无最新文章" /> : null}
              </Skeleton>
            </section>
          </div>
          <BlogSidebar loading={loading} articles={articles} categories={categories} articleCount={articleTotal} activeCategory={activeCategory} onCategorySelect={setActiveCategory} />
        </div>
      </main>
      <BlogFooter />
    </div>
  )
}
