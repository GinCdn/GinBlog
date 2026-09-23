import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  AppstoreOutlined,
  BellOutlined,
  DownOutlined,
  MinusOutlined,
  PlusOutlined,
  EditOutlined,
  HomeOutlined,
  LoginOutlined,
  MoonOutlined,
  ReadOutlined,
  SearchOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Button } from 'antd'
import { useNavigate } from 'react-router-dom'
import { publicApi } from '@/api'
import { useAppStore } from '@/store'
import type { Category } from '@/types'
import { getUsername, isAuthenticated } from '@/utils/auth'
import { getCategoryPath, getChineseSiteText } from '@/utils/blog'

interface BlogHeaderProps {
  active?: 'home' | 'articles'
  onSearch?: (keyword: string) => void
  searchValue?: string
}

/** 公开博客顶部导航，统一复用 Joe 风格的导航、搜索和用户入口。 */
export default function BlogHeader({ active = 'home', onSearch, searchValue = '' }: BlogHeaderProps) {
  const navigate = useNavigate()
  const siteConfig = useAppStore((state) => state.siteConfig)
  const [keyword, setKeyword] = useState(searchValue)
  const [nightMode, setNightMode] = useState(() => localStorage.getItem('ginblog-joe-night') === '1')
  const [otherMenuOpen, setOtherMenuOpen] = useState(false)
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false)
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<number[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryLoading, setCategoryLoading] = useState(false)
  const navigationRef = useRef<HTMLElement>(null)
  const loggedIn = isAuthenticated('user')
  const username = getUsername('user') || '用户'
  const systemName = getChineseSiteText(siteConfig?.title, 'GinBlog博客系统')
  const logo = siteConfig?.logo?.trim()

  useEffect(() => {
    setKeyword(searchValue)
  }, [searchValue])

  useEffect(() => {
    document.body.classList.toggle('joe-night', nightMode)
    localStorage.setItem('ginblog-joe-night', nightMode ? '1' : '0')
    return () => document.body.classList.remove('joe-night')
  }, [nightMode])

  useEffect(() => {
    if (!categoryMenuOpen && !otherMenuOpen) return

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (navigationRef.current && !navigationRef.current.contains(event.target as Node)) {
        setCategoryMenuOpen(false)
        setOtherMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleDocumentMouseDown)
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown)
  }, [categoryMenuOpen, otherMenuOpen])

  const loadCategories = async () => {
    if (categories.length > 0 || categoryLoading) return
    setCategoryLoading(true)
    try {
      const result = await publicApi.getCategoryTree()
      setCategories(result.data || [])
    } finally {
      setCategoryLoading(false)
    }
  }

  const toggleCategoryMenu = () => {
    const nextOpen = !categoryMenuOpen
    setCategoryMenuOpen(nextOpen)
    if (nextOpen) {
      setOtherMenuOpen(false)
      void loadCategories()
    }
  }

  const navigateToCategory = (category?: Category) => {
    setCategoryMenuOpen(false)
    navigate(category ? getCategoryPath(category) : '/articles')
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = keyword.trim()
    if (onSearch) {
      onSearch(value)
      return
    }
    navigate(value ? `/articles?title=${encodeURIComponent(value)}` : '/articles')
  }

  const openUserCenter = () => navigate(loggedIn ? '/user/console' : '/user/login')
  const publishArticle = () => navigate(loggedIn ? '/user/articles' : '/user/login')

  return (
    <header className="joe-blog-header">
      <div className="joe-blog-header-inner">
        <button className="joe-blog-brand" type="button" onClick={() => navigate('/')} aria-label={`${systemName}首页`}>
          {logo ? <img src={logo} alt={`${systemName}标志`} /> : <span className="joe-blog-logo"><ReadOutlined /></span>}
          <span className="joe-blog-brand-name">{systemName}</span>
        </button>

        <nav ref={navigationRef} className="joe-blog-nav" aria-label="博客导航">
          <button className={active === 'home' ? 'is-active' : ''} type="button" onClick={() => navigate('/')}>
            <HomeOutlined />
            <span>首页</span>
          </button>
          <div className="joe-blog-dropdown-wrap joe-blog-category-wrap">
            <button
              className={active === 'articles' || categoryMenuOpen ? 'is-active' : ''}
              type="button"
              onClick={toggleCategoryMenu}
              aria-expanded={categoryMenuOpen}
              aria-haspopup="menu"
            >
              <AppstoreOutlined />
              <span>文章分类</span>
              <DownOutlined className={`joe-blog-nav-arrow ${categoryMenuOpen ? 'is-open' : ''}`} />
            </button>
            {categoryMenuOpen && (
              <div className="joe-blog-dropdown joe-blog-category-dropdown" role="menu">
                <button type="button" role="menuitem" onClick={() => navigateToCategory()}>全部文章</button>
                {categoryLoading ? (
                  <div className="joe-blog-dropdown-status">正在加载分类</div>
                ) : categories.length > 0 ? (
                  categories.flatMap((category) => {
                    const renderCategory = (item: Category, depth = 0): ReactNode[] => {
                      const children = item.children || []
                      const expanded = expandedCategoryIds.includes(item.cid)
                      const entry = (
                        <div
                          key={item.cid}
                          className={`joe-blog-category-row depth-${Math.min(depth, 4)}`}
                          style={{ paddingLeft: `${12 + depth * 16}px` }}
                          role="none"
                        >
                          <button className="joe-blog-category-link" type="button" role="menuitem" onClick={() => navigateToCategory(item)}>
                            <span>{item.name}</span>
                          </button>
                          {children.length > 0 && (
                            <button
                              className="joe-blog-category-expand"
                              type="button"
                              aria-label={`${expanded ? '收起' : '展开'}${item.name}子分类`}
                              aria-expanded={expanded}
                              onClick={() => setExpandedCategoryIds((ids) => ids.includes(item.cid) ? ids.filter((id) => id !== item.cid) : [...ids, item.cid])}
                            >
                              {expanded ? <MinusOutlined className="joe-blog-category-toggle" /> : <PlusOutlined className="joe-blog-category-toggle" />}
                            </button>
                          )}
                        </div>
                      )
                      return expanded ? [entry, ...children.flatMap((child) => renderCategory(child, depth + 1))] : [entry]
                    }
                    return renderCategory(category)
                  })
                ) : (
                  <div className="joe-blog-dropdown-status">暂无文章分类</div>
                )}
              </div>
            )}
          </div>
          <div className="joe-blog-dropdown-wrap joe-blog-other-wrap">
            <button
              className={otherMenuOpen ? 'is-active' : ''}
              type="button"
              onClick={() => {
                setOtherMenuOpen((value) => !value)
                setCategoryMenuOpen(false)
              }}
              aria-expanded={otherMenuOpen}
              aria-haspopup="menu"
            >
              <BellOutlined />
              <span>其他页面</span>
              <DownOutlined className={`joe-blog-nav-arrow ${otherMenuOpen ? 'is-open' : ''}`} />
            </button>
            {otherMenuOpen && (
              <div className="joe-blog-dropdown" role="menu">
                <button type="button" role="menuitem" onClick={() => navigate('/articles')}>文章归档</button>
                <button type="button" role="menuitem" onClick={openUserCenter}>用户中心</button>
              </div>
            )}
          </div>
        </nav>

        <form className="joe-blog-search" onSubmit={submitSearch} role="search">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索内容"
            aria-label="搜索文章"
          />
          <button type="submit" aria-label="提交搜索"><SearchOutlined /></button>
        </form>

        <div className="joe-blog-actions">
          <button
            className="joe-blog-icon-button"
            type="button"
            title={nightMode ? '切换日间模式' : '切换夜间模式'}
            aria-label={nightMode ? '切换日间模式' : '切换夜间模式'}
            onClick={() => setNightMode((value) => !value)}
          >
            {nightMode ? <SunOutlined /> : <MoonOutlined />}
          </button>
          <button className="joe-blog-user-button" type="button" onClick={openUserCenter} title={loggedIn ? username : '登录'}>
            {loggedIn ? <span className="joe-blog-user-avatar">{username.slice(0, 1).toUpperCase()}</span> : <UserOutlined />}
          </button>
          <Button className="joe-publish-button" type="primary" icon={loggedIn ? <EditOutlined /> : <LoginOutlined />} onClick={publishArticle} aria-label={loggedIn ? "发布文章" : "登录"}>
            {loggedIn ? '发布' : '登录'}
          </Button>
        </div>
      </div>
    </header>
  )
}


