import type { Article } from '@/types'
import { getArticleCover } from '@/utils/blog'

interface BlogArticleCoverProps {
  article: Article
  index?: number
  className?: string
}

const fallbackColors = [
  'linear-gradient(135deg, #25b8e8 0%, #315cf4 100%)',
  'linear-gradient(135deg, #7259ef 0%, #2e8bf6 100%)',
  'linear-gradient(135deg, #1db5a7 0%, #1580d7 100%)',
  'linear-gradient(135deg, #ff9d62 0%, #ec5d89 100%)',
  'linear-gradient(135deg, #2c78e8 0%, #5e43ce 100%)',
  'linear-gradient(135deg, #25a98c 0%, #2276c9 100%)',
]

/** 文章封面组件，优先展示正文首图，没有图片时使用主题渐变兜底。 */
export default function BlogArticleCover({ article, index = 0, className = '' }: BlogArticleCoverProps) {
  const cover = getArticleCover(article)
  return (
    <div className={`joe-article-cover ${className}`.trim()} style={cover ? undefined : { background: fallbackColors[index % fallbackColors.length] }}>
      {cover ? (
        <img src={cover} alt={`${article.title}封面`} loading="lazy" />
      ) : (
        <div className="joe-article-cover-fallback">
          <span>{article.category?.name || 'GinBlog博客系统'}</span>
          <strong>{String(index + 1).padStart(2, '0')}</strong>
        </div>
      )}
      <span className="joe-article-cover-shine" aria-hidden="true" />
    </div>
  )
}