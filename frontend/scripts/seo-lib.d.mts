/** scripts/seo-lib.mjs 的类型声明，供 vite.config.ts 引用时获得类型提示。 */

export interface SeoCategory {
  slug: string
  name: string
}

export interface SeoArticle {
  id: number
  title?: string
  createTime?: string
  updateTime?: string
  isPublished?: boolean
}

export interface ResolvedSeoConfig {
  root: string
  /** 站点根地址；未配置且无法自动识别时为空串。 */
  siteUrl: string
  /** 站点地址来源说明，便于排查。 */
  siteUrlSource: string
  /** 构建期抓取接口使用的地址。 */
  apiBase: string
  siteName: string
  siteTitle: string
  siteSubtitle: string
  siteDescription: string
  siteKeywords: string
  siteEmail: string
  siteLogo: string
  baiduVerification: string
  remote: Record<string, unknown> | null
  warnings: string[]
}

export interface ResolveSeoOptions {
  root?: string
  siteUrl?: string
  apiBase?: string
  siteName?: string
}

export declare const DEFAULTS: Record<string, string>
export declare function normalizeSiteUrl(value: string): string
export declare function fetchSiteConfig(apiBase: string): Promise<Record<string, unknown> | null>
export declare function loadArticles(apiBase: string): Promise<SeoArticle[]>
export declare function loadCategories(apiBase: string): Promise<SeoCategory[]>
export declare function toAbsolute(siteUrl: string, pathname: string): string
export declare function buildSitemap(siteUrl: string, articles: SeoArticle[], categories: SeoCategory[]): string
export declare function buildRobots(siteUrl: string): string
export declare function buildNoscriptNav(siteUrl: string, categories: SeoCategory[]): string
export declare function escapeHtml(value: unknown): string
export declare function resolveSeoConfig(options?: ResolveSeoOptions): Promise<ResolvedSeoConfig>
