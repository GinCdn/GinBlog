import type { Article, Category } from '@/types'
import { formatChinaTime } from '@/utils/time'

/** 展平分类树，便于公开博客页面展示分类列表。 */
export function flattenCategories(items: Category[] = []): Category[] {
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    children: flattenCategories(Array.isArray(item.children) ? item.children : []),
  }))
}

/** 根据分类缩略名生成公开分类路径，缺少缩略名时保留原分类 ID 地址。 */
export function getCategoryPath(category?: Pick<Category, 'cid' | 'slug'>): string {
  const slug = category?.slug?.trim()
  if (slug) return `/category/${encodeURIComponent(slug)}`
  return category?.cid ? `/articles?category_id=${category.cid}` : '/articles'
}

/** 将 Markdown 内容转换为卡片摘要，避免列表页面显示源码标记。 */
export function getArticleExcerpt(article: Article, length = 150): string {
  const source = article.description?.trim() || article.content || ''
  const excerpt = source
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return excerpt.slice(0, length) || '这篇文章还没有填写摘要，点击查看完整内容。'
}

/** 统一公开博客页面的日期格式。 */
export function formatBlogDate(value?: string): string {
  if (!value) return '未记录时间'
  return formatChinaTime(value, '未记录时间').slice(0, 10)
}

/** 从兼容字段或 Markdown 正文中提取文章封面图片。 */
export function getArticleCover(article: Article): string | undefined {
  const candidate = article as Article & {
    cover?: string
    cover_image?: string
    coverImage?: string
    image?: string
    thumbnail?: string
  }
  const explicitCover = [article.coverImage, candidate.cover, candidate.cover_image, candidate.coverImage, candidate.image, candidate.thumbnail]
    .find((value) => typeof value === 'string' && value.trim())
  if (explicitCover) return explicitCover.trim()

  const markdownImage = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/.exec(article.content || '')
  if (markdownImage?.[1]) return markdownImage[1]

  const htmlImage = /<img[^>]+src=["']([^"']+)["']/i.exec(article.content || '')
  return htmlImage?.[1]
}

/** 将站点配置中的常见产品和技术英文替换为中文展示，避免公开页面出现中英文混排。 */
export function getChineseSiteText(value: string | undefined, fallback: string): string {
  const text = value?.trim() || fallback
  return text
    .replace(/Golang/gi, 'Go语言')
    .replace(/Markdown/gi, '文章排版')
}

/** 获取文章作者的可展示名称，兼容后端不同版本的昵称字段。 */
type ArticleAuthorProfile = {
  name: string
  qq?: string
}

/** 获取文章发布者的昵称和 QQ，兼容后端不同版本的字段命名。*/
function getArticleAuthorProfile(article: Article): ArticleAuthorProfile {
  type ArticleAuthorValue = NonNullable<Article['author']> & {
    nick_name?: string
    NickName?: string
    Username?: string
    QQ?: string
  }
  const articleValue = article as Article & { Author?: ArticleAuthorValue }
  const author = articleValue.author as ArticleAuthorValue | undefined || articleValue.Author
  const name = [author?.nickName, author?.nick_name, author?.NickName, author?.username, author?.Username]
    .find((value) => typeof value === 'string' && value.trim())
    ?.trim() || '站长'
  const qq = [author?.qq, author?.QQ]
    .find((value) => typeof value === 'string' && value.trim())
    ?.trim()
  return { name, qq }
}

/** 获取文章发布者的可显示昵称。*/
export function getArticleAuthor(article: Article): string {
  return getArticleAuthorProfile(article).name
}

/** 获取文章发布者绑定的 QQ 号码。*/
export function getArticleAuthorQQ(article: Article): string | undefined {
  return getArticleAuthorProfile(article).qq
}

/** 汇总文章标签名称，供标签云和卡片元信息使用。 */
export function getArticleTagNames(article: Article): string[] {
  return (article.tags || [])
    .map((tag) => tag.name?.trim())
    .filter((name): name is string => Boolean(name))
}
