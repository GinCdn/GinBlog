/**
 * 构建期 SEO 产物生成脚本
 *
 * 产出（写入前端构建目录，随后随 dist 一起部署到后端 web/）：
 *   1. <outDir>/assets/sitemap.xml —— 站点地图，可直接提交到百度 / Google 搜索资源平台
 *   2. <outDir>/robots.txt          —— 抓取规则（需前置 Nginx 直接命中该静态文件才生效）
 *
 * 站点地址解析优先级（详见 scripts/seo-lib.mjs）：
 *   --site-url 参数 > VITE_SITE_URL / SEO_SITE_URL 环境变量 > .env 文件 > 站点配置接口自动识别
 *   「未能确定站点地址时不会生成站点地图」—— 宁可不生成，也不把别的站点域名写进产物。
 *
 * 用法：
 *   node scripts/gen-seo.mjs                                     # 读 .env，缺失时自动识别
 *   node scripts/gen-seo.mjs --site-url=https://blog.example.com
 *   node scripts/gen-seo.mjs --out=dist --api-base=http://127.0.0.1:8080
 */
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildRobots, buildSitemap, loadArticles, loadCategories, resolveSeoConfig } from './seo-lib.mjs'

const projectRoot = path.resolve(import.meta.dirname, '..')

/** 解析命令行参数，同时兼容位置参数写法：gen-seo.mjs [输出目录] [接口地址]。 */
function parseArgs(argv) {
  const options = { positional: [] }
  argv.forEach((arg) => {
    const matched = /^--([a-z-]+)(?:=(.*))?$/.exec(arg)
    if (!matched) {
      options.positional.push(arg)
      return
    }
    const key = matched[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase())
    options[key] = matched[2] === undefined ? 'true' : matched[2]
  })
  return options
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const outDir = path.resolve(args.out || args.positional[0] || path.join(projectRoot, 'dist'))

  if (!existsSync(outDir)) {
    console.warn(`[gen-seo] 输出目录不存在，已跳过：${outDir}`)
    return
  }

  const config = await resolveSeoConfig({
    root: projectRoot,
    siteUrl: args.siteUrl,
    apiBase: args.apiBase || args.positional[1],
  })

  console.log('[gen-seo] 站点信息')
  console.log(`  · 站点地址：${config.siteUrl || '（未配置）'}${config.siteUrl ? ` [来源：${config.siteUrlSource}]` : ''}`)
  console.log(`  · 站点名称：${config.siteName}`)
  console.log(`  · 接口地址：${config.apiBase}`)
  config.warnings.forEach((warning) => console.warn(`  ! ${warning}`))

  // 公开接口可能因站点重启、前置网关异常等原因暂时不可达。
  // 此时依次尝试候选地址（配置地址 -> 本机后端），避免整张站点地图退化成只剩首页两条。
  const apiCandidates = [...new Set([config.apiBase, 'http://127.0.0.1:8080'].filter(Boolean))]
  let articles = []
  let categories = []
  let apiError = null
  for (const base of apiCandidates) {
    try {
      ;[articles, categories] = await Promise.all([loadArticles(base), loadCategories(base)])
      if (base !== config.apiBase) console.log(`[gen-seo] 配置的接口地址不可用，已改用：${base}`)
      console.log(`[gen-seo] 已获取文章 ${articles.length} 篇、分类 ${categories.length} 个`)
      apiError = null
      break
    } catch (error) {
      apiError = error
    }
  }
  if (apiError) {
    console.warn(`[gen-seo] 公开接口不可达，站点地图将只含首页与归档页（${apiError?.message || apiError}）`)
    console.warn('[gen-seo] 若在服务器上构建，可在 .env 中设置 VITE_API_BASE=http://127.0.0.1:后端端口')
  }

  await mkdir(path.join(outDir, 'assets'), { recursive: true })

  if (config.siteUrl) {
    const sitemapPath = path.join(outDir, 'assets', 'sitemap.xml')
    const sitemap = buildSitemap(config.siteUrl, articles, categories)
    await writeFile(sitemapPath, sitemap, 'utf8')
    const count = (sitemap.match(/<loc>/g) || []).length
    console.log(`[gen-seo] 已生成 ${sitemapPath}（${count} 条）`)
  } else {
    console.warn('[gen-seo] 跳过站点地图：无法确定站点地址。')
    console.warn('[gen-seo] 解决办法：在项目根目录 .env 中设置 VITE_SITE_URL=https://你的域名 后重新构建；')
    console.warn('[gen-seo] 或直接执行 node scripts/gen-seo.mjs --site-url=https://你的域名')
  }

  const robotsPath = path.join(outDir, 'robots.txt')
  await writeFile(robotsPath, buildRobots(config.siteUrl), 'utf8')
  console.log(`[gen-seo] 已生成 ${robotsPath}`)
}

main().catch((error) => {
  // 站点地图与抓取规则属于增强产物，生成失败不应阻断构建。
  console.warn(`[gen-seo] 生成失败，已跳过：${error?.message || error}`)
})
