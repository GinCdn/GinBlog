import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Empty, Spin } from 'antd'
import { CheckCircleOutlined, CommentOutlined, FileTextOutlined, FolderOpenOutlined, TagsOutlined, TeamOutlined } from '@ant-design/icons'
import { adminApi } from '@/api'
import type { Article, Category, Comment, Tag as ArticleTag, User } from '@/types'
import echarts from '@/utils/echarts'
import type { EChartsType } from 'echarts/core'

interface ProvinceAccess { province: string; access_count: number }
interface DailyStat { date: string; count: number }
interface DashboardStats {
  users: User[]
  articles: Article[]
  comments: Comment[]
  categories: Category[]
  tags: ArticleTag[]
  provinces: ProvinceAccess[]
  totalUsers: number
  totalArticles: number
  totalComments: number
  pendingComments: number
  pendingArticles: number
  totalTags: number
  totalCategories: number
  userRegistration: DailyStat[]
  articlePublication: DailyStat[]
  commentCreation: DailyStat[]
}

function unwrapData<T>(value: unknown): T {
  const source = value as { data?: unknown }
  return (source && source.data !== undefined ? source.data : value) as T
}

function getList<T>(value: unknown): { list: T[]; total: number } {
  const data = unwrapData<unknown>(value)
  if (Array.isArray(data)) return { list: data as T[], total: data.length }
  const page = data as { list?: T[]; total?: number; pagination?: { total?: number } }
  const list = Array.isArray(page?.list) ? page.list : []
  return { list, total: Number(page?.total ?? page?.pagination?.total ?? list.length) }
}

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDate(value?: string): string | undefined {
  if (!value) return undefined
  return String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0]
}

function currentMonthRange(): Date[] {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return Array.from({ length: lastDay }, (_, index) => new Date(first.getFullYear(), first.getMonth(), index + 1))
}

function countByDate<T>(items: T[], getter: (item: T) => string | undefined, dates: Date[]) {
  return dates.map((date) => {
    const key = formatDate(date)
    return items.filter((item) => getDate(getter(item)) === key).length
  })
}

function countCategories(categories: Category[]): number {
  return categories.reduce((total, category) => total + 1 + countCategories(category.children || []), 0)
}

function chartLabels(dates: Date[]) {
  return dates.map((date) => `${date.getMonth() + 1}/${date.getDate()}`)
}

function createLineChart(element: HTMLDivElement, labels: string[], data: number[], color: string, emptyText: string): EChartsType {
  const chart = echarts.init(element)
  const hasData = data.some((value) => value > 0)
  chart.setOption({
    animationDuration: 400,
    grid: { left: 48, right: 18, top: 28, bottom: 34 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: labels, boundaryGap: false, axisLine: { lineStyle: { color: '#d9d9d9' } }, axisLabel: { color: '#777', interval: labels.length > 15 ? 3 : 0 } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#f0f0f0' } }, axisLabel: { color: '#777' } },
    series: [{ type: 'line', smooth: true, symbol: 'circle', symbolSize: 6, data, lineStyle: { color, width: 3 }, itemStyle: { color }, areaStyle: { color: color + '22' } }],
    graphic: hasData ? undefined : { type: 'text', left: 'center', top: '48%', style: { text: emptyText, fill: '#999', fontSize: 14 } },
  })
  return chart
}

// 管理员控制台首页，展示数据库聚合后的总量、审核数量和当月趋势。
export default function Console() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats>({ users: [], articles: [], comments: [], categories: [], tags: [], provinces: [], totalUsers: 0, totalArticles: 0, totalComments: 0, pendingComments: 0, pendingArticles: 0, totalTags: 0, totalCategories: 0, userRegistration: [], articlePublication: [], commentCreation: [] })
  const chartRefs = useRef<Array<HTMLDivElement | null>>([])
  const charts = useRef<EChartsType[]>([])

  const loadData = async () => {
    setLoading(true)
    const results = await Promise.allSettled([adminApi.getDashboardStat(), adminApi.getUserStat(), adminApi.getUserList({ page: 1, page_size: 100 }), adminApi.getAdminArticles({ page: 1, page_size: 100 }), adminApi.getAdminComments({ page: 1, page_size: 100 }), adminApi.getAdminCategoryTree(), adminApi.getTagList({ page: 1, page_size: 100 }), adminApi.getProvinceAccess({ page: 1, page_size: 100 })])
    const read = <T,>(index: number, fallback: T) => results[index].status === 'fulfilled' ? results[index].value : fallback
    const dashboard = unwrapData<Record<string, unknown>>(read(0, { data: {} })) || {}
    const userStat = unwrapData<{ total?: number }>(read(1, { data: {} })) || {}
    const usersResult = getList<User>(read(2, { data: {} }))
    const articlesResult = getList<Article>(read(3, { data: {} }))
    const commentsResult = getList<Comment>(read(4, { data: {} }))
    const users = usersResult.list
    const articles = articlesResult.list
    const comments = commentsResult.list
    const categories = unwrapData<Category[]>(read(5, { data: [] })) || []
    const tagsResult = getList<ArticleTag>(read(6, { data: {} }))
    const provinces = getList<ProvinceAccess>(read(7, { data: {} })).list
    const getNumber = (snake: string, camel: string, fallback: number) => Number(dashboard[snake] ?? dashboard[camel] ?? fallback)
    const getDaily = (snake: string, camel: string) => {
      const value = dashboard[snake] ?? dashboard[camel]
      return Array.isArray(value) ? value as DailyStat[] : []
    }
    setStats({
      users,
      articles,
      comments,
      categories,
      tags: tagsResult.list,
      provinces: provinces.filter((item) => item.province !== '未知地区'),
      totalUsers: getNumber('total_users', 'totalUsers', Number(userStat.total ?? usersResult.total)),
      totalArticles: getNumber('total_articles', 'totalArticles', articlesResult.total),
      totalComments: getNumber('total_comments', 'totalComments', commentsResult.total),
      pendingComments: getNumber('pending_comments', 'pendingComments', comments.filter((item) => Number(item.status) === 0).length),
      pendingArticles: getNumber('pending_articles', 'pendingArticles', articles.filter((item) => item.isPublished === false).length),
      totalTags: getNumber('total_tags', 'totalTags', tagsResult.total),
      totalCategories: getNumber('total_categories', 'totalCategories', countCategories(categories)),
      userRegistration: getDaily('user_registration', 'userRegistration'),
      articlePublication: getDaily('article_publication', 'articlePublication'),
      commentCreation: getDaily('comment_creation', 'commentCreation'),
    })
    setLoading(false)
  }

  useEffect(() => { void loadData() }, [])

  const dates = useMemo(() => currentMonthRange(), [])
  const labels = useMemo(() => chartLabels(dates), [dates])
  const pendingComments = stats.pendingComments
  const pendingArticles = stats.pendingArticles
  const provinceRanking = [...stats.provinces].sort((a, b) => b.access_count - a.access_count).slice(0, 10)

  useEffect(() => {
    if (loading) return
    let disposed = false
    const render = async () => {
      const [{ default: mapEcharts }] = await Promise.all([import('@/utils/echartsMap'), import('@/assets/china-map.js')])
      if (disposed) return
      charts.current.forEach((chart) => chart.dispose())
      charts.current = []
      const toChartData = (items: DailyStat[]) => {
        const values = new Map(items.map((item) => [getDate(item.date), Number(item.count) || 0]))
        return dates.map((date) => values.get(formatDate(date)) || 0)
      }
      const userData = stats.userRegistration.length ? toChartData(stats.userRegistration) : countByDate(stats.users, (item) => item.createTime || item.create_time, dates)
      const articleData = stats.articlePublication.length ? toChartData(stats.articlePublication) : countByDate(stats.articles, (item) => item.createTime, dates)
      const commentData = stats.commentCreation.length ? toChartData(stats.commentCreation) : countByDate(stats.comments, (item) => item.createTime, dates)
      ;[[userData, '#40d4b0', '本月暂无用户注册'], [articleData, '#55a5ea', '本月暂无文章发布'], [commentData, '#f591a2', '本月暂无评论']].forEach(([data, color, emptyText], index) => {
        const element = chartRefs.current[index]
        if (element) charts.current.push(createLineChart(element, labels, data as number[], color as string, emptyText as string))
      })
      const mapElement = chartRefs.current[4]
      if (mapElement) {
        const mapChart = mapEcharts.init(mapElement)
        const max = Math.max(...stats.provinces.map((item) => item.access_count), 1)
        mapChart.setOption({ tooltip: { trigger: 'item', formatter: '{b}: {c}次访问' }, visualMap: { min: 0, max, left: 12, bottom: 8, text: ['高访问量', '低访问量'], inRange: { color: ['#f2f2f2', '#2395ff'] } }, series: [{ name: '访问量', type: 'map', map: 'china', data: stats.provinces.map((item) => ({ name: item.province, value: item.access_count })), label: { show: true, color: '#555', fontSize: 10 }, itemStyle: { areaColor: '#f2f2f2', borderColor: '#ddd' }, emphasis: { label: { show: true, color: '#fff' }, itemStyle: { areaColor: '#facf20' } } }] })
        charts.current.push(mapChart)
      }
      const resize = () => charts.current.forEach((chart) => chart.resize())
      window.addEventListener('resize', resize)
      requestAnimationFrame(resize)
      return () => window.removeEventListener('resize', resize)
    }
    let cleanup: (() => void) | undefined
    void render().then((value) => { cleanup = value })
    return () => { disposed = true; cleanup?.(); charts.current.forEach((chart) => chart.dispose()); charts.current = [] }
  }, [loading, stats, dates, labels])

  const cards = [{ title: '总用户数', value: stats.totalUsers, icon: <TeamOutlined />, color: '#40d4b0', path: '/admin/user' }, { title: '总文章数', value: stats.totalArticles, icon: <FileTextOutlined />, color: '#55a5ea', path: '/admin/articles' }, { title: '总评论数', value: stats.totalComments, icon: <CommentOutlined />, color: '#9dafff', path: '/admin/comments' }, { title: '待审核评论', value: pendingComments, icon: <CheckCircleOutlined />, color: '#f591a2', path: '/admin/comments' }, { title: '待审核文章', value: pendingArticles, icon: <FileTextOutlined />, color: '#feaa4f', path: '/admin/articles' }, { title: '总标签数', value: stats.totalTags, icon: <TagsOutlined />, color: '#9bc539', path: '/admin/articles' }, { title: '总分类数', value: stats.totalCategories, icon: <FolderOpenOutlined />, color: '#7b68ee', path: '/admin/categories' }]

  return <div className="admin-console-dashboard">{loading ? <div className="admin-console-loading"><Spin size="large" /></div> : <><div className="admin-console-shortcuts">{cards.map((card) => <button type="button" className="admin-console-shortcut" style={{ backgroundColor: card.color }} key={card.title} onClick={() => navigate(card.path)}><span className="admin-console-shortcut-number">{card.value}</span><span className="admin-console-shortcut-title">{card.title}</span><span className="admin-console-shortcut-icon">{card.icon}</span></button>)}</div><div className="admin-console-chart-grid"><Card title="本月用户注册统计"><div ref={(element) => { chartRefs.current[0] = element }} className="admin-console-chart" /></Card><Card title="本月文章发布统计"><div ref={(element) => { chartRefs.current[1] = element }} className="admin-console-chart" /></Card><Card title="本月评论统计"><div ref={(element) => { chartRefs.current[2] = element }} className="admin-console-chart" /></Card></div><div className="admin-console-bottom-grid"><Card title="用户地区分布"><div className="admin-console-region"><div ref={(element) => { chartRefs.current[4] = element }} className="admin-console-map" /><div className="admin-console-ranking"><div className="admin-console-ranking-head"><span>排名</span><span>地区</span><span>访问量</span></div>{provinceRanking.length ? provinceRanking.map((item, index) => <div className="admin-console-ranking-row" key={item.province}><span>{index + 1}</span><span>{item.province}</span><span>{item.access_count}</span></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />}</div></div></Card></div></>}</div>
}
