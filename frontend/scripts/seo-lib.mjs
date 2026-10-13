/**
 * SEO 公共库 —— 站点信息解析 + 公开接口抓取 + 产物片段构建。
 *
 * 为什么单独抽一层：
 *   这套前端会随 GinBlog 分发到不同域名的站点部署，任何写死的域名在别人那里都会变成错误链接，
 *   比"没有 SEO 产物"更糟。因此站点地址、名称、简介一律通过「显式配置 -> 接口自动识别 -> 通用兜底」
 *   三级解析得到，由 scripts/gen-seo.mjs（构建后生成 sitemap/robots）与 vite.config.ts
 *   （构建中注入 index.html）共用，保证两处拿到的站点信息完全一致。
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/** 按优先级从高到低读取，先命中的文件先用。 */
const ENV_FILES = ['.env.local', '.env.production.local', '.env.production', '.env']

/** 兜底文案：既没配置、接口也不可达时使用，保证产物仍是一张合法页面。 */
export const DEFAULTS = {
  siteName: 'GinBlog',
  siteTitle: 'GinBlog 博客系统',
  siteSubtitle: '基于 Golang + Gin 开发的轻量高性能博客系统',
  siteDescription: '基于 Golang + Gin 开发的轻量高性能博客系统，支持文章、分类、评论与内容付费。',
  siteKeywords: 'Golang,Gin,GinBlog,博客系统,轻量博客,技术分享',
  siteEmail: '',
  siteLogo: '',
  baiduVerification: '',
}

const REQUEST_TIMEOUT = 15000
/** 每页数量后端仅支持 10、20、50、100，取上限以减少请求次数。 */
const PAGE_SIZE = 100

/** 逐行解析 .env 文件，不引入额外依赖；已存在的键不被后面的文件覆盖。 */
function readEnvFiles(root) {
  const values = {}
  for (const name of ENV_FILES) {
    const file = path.join(root, name)
    if (!existsSync(file)) continue
    let content = ''
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const index = line.indexOf('=')
      if (index <= 0) continue
      const key = line.slice(0, index).trim()
      if (key in values) continue
      let value = line.slice(index + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      values[key] = value
    }
  }
  return values
}

/** 站点地址归一：补协议、去末尾斜杠。空值保持为空，表示"未配置"。 */
export function normalizeSiteUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`
  return `https://${trimmed}`
}

/** 从任意绝对地址中取出 origin，失败返回空串。 */
function originOf(value) {
  try {
    return new URL(String(value || '')).origin
  } catch {
    return ''
  }
}

async function fetchJson(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

/** 读取站点配置接口，拿到站点名称、简介、Logo 等真实信息。 */
export async function fetchSiteConfig(apiBase) {
  const payload = await fetchJson(`${apiBase}/api/GetSiteConfigInfo`)
  const data = payload?.data
  return data && typeof data === 'object' ? data : null
}

/** 拉取全部公开文章。 */
export async function loadArticles(apiBase) {
  const articles = []
  for (let page = 1; page <= 20; page += 1) {
    const payload = await fetchJson(`${apiBase}/api/article/list?page=${page}&page_size=${PAGE_SIZE}`)
    const data = payload?.data || {}
    const list = Array.isArray(data.list) ? data.list : []
    list.forEach((item) => {
      if (item && item.isPublished === false) return
      if (item && Number(item.id) > 0) articles.push(item)
    })
    const total = Number(data.total) || articles.length
    if (list.length < PAGE_SIZE || articles.length >= total) break
  }
  return articles
}

/** 递归收集分类，仅保留带 slug 的分类（无 slug 的分类页地址不稳定，不纳入站点地图）。 */
function collectCategories(nodes, result = []) {
  if (!Array.isArray(nodes)) return result
  nodes.forEach((node) => {
    if (!node) return
    if (typeof node.slug === 'string' && node.slug.trim()) {
      result.push({ slug: node.slug.trim(), name: String(node.name || '').trim() })
    }
    collectCategories(node.children, result)
  })
  return result
}

export async function loadCategories(apiBase) {
  const payload = await fetchJson(`${apiBase}/api/GetCategoryChildrenInfo`)
  return collectCategories(payload?.data)
}

/** 后端时间为北京时间，转成站点地图要求的 ISO 8601。 */
function toIso(value) {
  if (!value) return undefined
  const matched = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(value).trim())
  const date = matched
    ? new Date(`${matched[1]}-${matched[2]}-${matched[3]}T${matched[4]}:${matched[5]}:${matched[6]}+08:00`)
    : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function escapeXml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' }[char]))
}

/**
 * 拼接站内绝对地址。
 * 站点地址未配置时退化为相对路径 —— 相对链接在 HTML 里依然可用，
 * 关键原则是「绝不把别的站点域名写进产物」。
 */
export function toAbsolute(siteUrl, pathname) {
  const suffix = pathname.startsWith('/') ? pathname : `/${pathname}`
  return siteUrl ? `${siteUrl}${suffix}` : suffix
}

export function buildSitemap(siteUrl, articles, categories) {
  const entries = [
    { loc: `${siteUrl}/`, changefreq: 'daily', priority: '1.0', lastmod: articles[0] ? toIso(articles[0].updateTime || articles[0].createTime) : undefined },
    { loc: `${siteUrl}/articles`, changefreq: 'daily', priority: '0.9', lastmod: articles[0] ? toIso(articles[0].updateTime || articles[0].createTime) : undefined },
  ]
  categories.forEach((category) => {
    entries.push({ loc: `${siteUrl}/category/${encodeURIComponent(category.slug)}`, changefreq: 'weekly', priority: '0.7' })
  })
  articles.forEach((article) => {
    entries.push({
      loc: `${siteUrl}/articles/${article.id}`,
      changefreq: 'weekly',
      priority: '0.8',
      lastmod: toIso(article.updateTime || article.createTime),
    })
  })

  const body = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(entry.loc)}</loc>`]
      if (entry.lastmod) parts.push(`    <lastmod>${entry.lastmod}</lastmod>`)
      if (entry.changefreq) parts.push(`    <changefreq>${entry.changefreq}</changefreq>`)
      if (entry.priority) parts.push(`    <priority>${entry.priority}</priority>`)
      return `  <url>\n${parts.join('\n')}\n  </url>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

/**
 * 生成 robots.txt。
 * Sitemap 指令必须是绝对地址，站点地址未配置时直接省略该行，而不是填一个猜测的域名。
 */
export function buildRobots(siteUrl) {
  const lines = [
    '# 抓取规则',
    '# 注意：GinBlog 服务端对所有非 /api/ 的 GET 请求都会回退到 web/index.html，',
    '# 因此本文件需要由前置 Nginx 直接命中 web/robots.txt 才会生效。',
    '',
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /admin/',
    'Disallow: /user/',
    'Disallow: /doc/',
  ]
  if (siteUrl) {
    lines.push('', `Sitemap: ${siteUrl}/assets/sitemap.xml`)
  } else {
    lines.push('', '# 未检测到站点地址，Sitemap 行已省略。', '# 请设置 VITE_SITE_URL 后重新构建以生成完整配置。')
  }
  return `${lines.join('\n')}\n`
}

/** 生成 noscript 栏目入口，优先使用站点真实分类，接口不可达时退化为通用入口。 */
export function buildNoscriptNav(siteUrl, categories) {
  const items = [{ path: '/', name: '首页' }, { path: '/articles', name: '文章归档' }]
  ;(categories || []).forEach((category) => {
    if (!category || !category.slug) return
    items.push({ path: `/category/${encodeURIComponent(category.slug)}`, name: category.name || category.slug })
  })
  items.push({ path: '/assets/sitemap.xml', name: '站点地图' })
  return items
    .map((item) => `      <li><a href="${toAbsolute(siteUrl, item.path)}">${escapeHtml(item.name)}</a></li>`)
    .join('\n')
}

/** HTML 文本转义，防止分类名里的特殊字符破坏标签结构。 */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}

/**
 * 解析最终生效的站点信息。
 *
 * 优先级（先命中先用）：
 *   1. 调用方显式传入（命令行参数）
 *   2. 环境变量 / .env 文件中的 VITE_* 配置
 *   3. 站点配置接口返回的真实站点信息（名称、简介、关键词、Logo、邮箱、ICP）
 *   4. 内置通用兜底文案
 */
export async function resolveSeoConfig(options = {}) {
  const root = options.root || process.cwd()
  const fileEnv = readEnvFiles(root)
  const get = (key) => {
    const fromProcess = process.env[key]
    if (fromProcess !== undefined && fromProcess !== '') return fromProcess
    const fromFile = fileEnv[key]
    if (fromFile !== undefined && fromFile !== '') return fromFile
    return ''
  }

  let siteUrl = normalizeSiteUrl(options.siteUrl || get('VITE_SITE_URL') || get('SEO_SITE_URL'))
  let siteUrlSource = siteUrl ? '配置文件' : ''

  // 接口地址：显式配置 > 站点地址 > 本机后端默认端口（单机部署下构建时后端通常在本机运行）。
  let apiBase = normalizeSiteUrl(get('VITE_API_BASE') || get('SEO_API_BASE'))
  if (!apiBase) apiBase = siteUrl || 'http://127.0.0.1:8080'

  const warnings = []
  let remote = null
  try {
    remote = await fetchSiteConfig(apiBase)
  } catch (error) {
    warnings.push(`站点配置接口不可达（${apiBase}）：${error.message}`)
  }

  // 站点配置接口没有域名字段，但 Logo / 图标存的是绝对地址，可据此反推站点 origin。
  if (!siteUrl && remote) {
    const detected = originOf(remote.logo) || originOf(remote.favicon)
    if (detected) {
      siteUrl = detected
      siteUrlSource = '自动识别（取自站点 Logo 绝对地址）'
    }
  }
  if (!siteUrl) {
    warnings.push('未能确定站点地址，站点地图不会生成，绝对链接将退化为相对路径。请在 .env 中设置 VITE_SITE_URL。')
  }

  const siteName = options.siteName || get('VITE_SITE_NAME') || (remote && (remote.title || remote.name)) || DEFAULTS.siteName
  const siteSubtitle = get('VITE_SITE_SUBTITLE') || (remote && remote.sub_title) || DEFAULTS.siteSubtitle
  const siteTitle = get('VITE_SITE_TITLE') || `${siteName} - ${siteSubtitle}`
  const siteDescription = get('VITE_SITE_DESCRIPTION') || (remote && remote.description) || DEFAULTS.siteDescription
  const siteKeywords = get('VITE_SITE_KEYWORDS') || (remote && remote.keywords) || DEFAULTS.siteKeywords
  const siteEmail = get('VITE_SITE_EMAIL') || (remote && remote.admin_email) || DEFAULTS.siteEmail
  const siteLogo = get('VITE_SITE_LOGO') || (remote && (remote.favicon || remote.logo)) || DEFAULTS.siteLogo
  const baiduVerification = get('VITE_BAIDU_VERIFICATION') || DEFAULTS.baiduVerification

  return {
    root,
    siteUrl,
    siteUrlSource,
    apiBase,
    siteName,
    siteTitle,
    siteSubtitle,
    siteDescription,
    siteKeywords,
    siteEmail,
    siteLogo,
    baiduVerification,
    remote,
    warnings,
  }
}
