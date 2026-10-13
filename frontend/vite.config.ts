import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { buildNoscriptNav, loadCategories, resolveSeoConfig, type ResolvedSeoConfig } from './scripts/seo-lib.mjs'

/** 将仅在后台图表页使用的 ECharts 运行时拆分，避免生成单个超大脚本。 */
function splitChartChunks(id: string): string | undefined {
  const moduleId = id.replaceAll('\\', '/')
  if (moduleId.includes('/node_modules/zrender/lib/core/')) return 'echarts-renderer-core'
  if (moduleId.includes('/node_modules/zrender/lib/canvas/')) return 'echarts-renderer-canvas'
  if (moduleId.includes('/node_modules/zrender/lib/graphic/')) return 'echarts-renderer-graphic'
  if (moduleId.includes('/node_modules/zrender/')) return 'echarts-renderer-runtime'
  if (moduleId.includes('/node_modules/echarts/lib/chart/')) return 'echarts-charts'
  if (moduleId.includes('/node_modules/echarts/lib/component/')) return 'echarts-components'
  if (moduleId.includes('/node_modules/echarts/lib/coord/')) return 'echarts-coordinate'
  if (moduleId.includes('/node_modules/echarts/lib/core/')) return 'echarts-core'
  if (moduleId.includes('/node_modules/echarts/')) return 'echarts-runtime'
  return undefined
}

/** 写入 HTML 属性的值需要转义，避免站点名称里的 & 或引号破坏标签结构。 */
function escapeAttribute(value: unknown): string {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] as string))
}

/**
 * 把 index.html 中的站点信息占位符替换为当前站点的真实内容。
 *
 * 这份源码会被部署到不同域名的站点，因此源码里不写死任何域名与站点名称：
 * 站点地址、名称、简介等统一由 scripts/seo-lib.mjs 按「.env 配置 -> 接口自动识别 -> 通用兜底」
 * 解析，再注入 HTML。开发服务器同样生效，避免调试时看到占位符。
 */
function seoHtmlPlugin(): Plugin {
  let cache: { at: number; config: ResolvedSeoConfig; nav: string } | null = null

  async function load() {
    // 开发服务器每次请求都会走这里，做 60 秒短缓存避免反复请求后端。
    if (cache && Date.now() - cache.at < 60_000) return cache
    const config = await resolveSeoConfig({ root: import.meta.dirname })
    const categories = await loadCategories(config.apiBase).catch(() => [])
    cache = { at: Date.now(), config, nav: buildNoscriptNav(config.siteUrl, categories) }
    return cache
  }

  return {
    name: 'ginblog-seo-html',
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        const { config, nav } = await load()
        config.warnings.forEach((warning) => console.warn(`[seo] ${warning}`))

        let result = html.replaceAll('__NOSCRIPT_NAV__', nav)
        const attributes: Record<string, string> = {
          __SITE_URL__: config.siteUrl,
          __SITE_NAME__: config.siteName,
          __SITE_TITLE__: config.siteTitle,
          __SITE_SUBTITLE__: config.siteSubtitle,
          __SITE_DESCRIPTION__: config.siteDescription,
          __SITE_KEYWORDS__: config.siteKeywords,
          __SITE_EMAIL__: config.siteEmail,
          __SITE_LOGO__: config.siteLogo,
          __BAIDU_VERIFICATION__: config.baiduVerification,
        }
        Object.entries(attributes).forEach(([token, value]) => {
          result = result.replaceAll(token, escapeAttribute(value))
        })
        return result
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), seoHtmlPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src')
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true
      }
    }
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks: splitChartChunks
      }
    }
  }
})
