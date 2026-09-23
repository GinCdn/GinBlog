import { CommentOutlined, LockOutlined } from '@ant-design/icons'
import { lazy, Suspense, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { maskArticleHiddenContent } from '@/utils/articleContent'
import { createHeadingIdFactory, getReactNodeText } from '@/utils/markdown'

/** 代码高亮组件按需加载，普通文章无需下载 Prism 语言包。 */
const CodeHighlighter = lazy(() => import('@/components/CodeHighlighter'))

interface MarkdownRendererProps { content: string }
type AccessPlaceholderType = 'paid' | 'comment'

const accessPlaceholderPattern = /\[\[ginblog-access:(paid|comment)\]\]/gi
const articleAlignmentClasses = ['article-align-left', 'article-align-center', 'article-align-right', 'article-align-justify']

/** 原始 HTML 先转换为语法树，再按白名单净化，避免历史内容绕过前端 XSS 防护。 */
const articleHtmlSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'div', 'span'],
  attributes: {
    ...defaultSchema.attributes,
    code: [['className', /^language-[\w-]+$/]],
    div: [['className', ...articleAlignmentClasses]],
    p: [['className', ...articleAlignmentClasses]],
    span: [['className', ...articleAlignmentClasses]],
  },
}

/** 从图片标题中读取文章编辑器写入的显示宽高。 */
function parseImageSize(title?: string) {
  const match = /尺寸\s*:\s*(\d+)?(?:\s*x\s*(\d+)?)?/i.exec(title || '')
  if (!match) return undefined
  return {
    width: match[1] ? `${match[1]}px` : undefined,
    height: match[2] ? `${match[2]}px` : undefined,
  }
}

/** 将常见的图片等号尺寸写法转换为标准 Markdown 图片标题，兼容历史文章。 */
function normalizeImageSizeSyntax(content: string) {
  return content.replace(/!\[([^\]]*)\]\(([^)\s]+)\s*=\s*(\d+)(?:x(\d+))?\)/gi, (_all, alt, src, width, height) => {
    return `![${alt}](${src} "尺寸:${width}x${height || ''}")`
  })
}

/** 仅允许站内路径和 HTTP(S) 地址，防止 Markdown 链接或图片执行脚本协议。 */
function isSafeMarkdownUrl(value?: string) {
  const url = (value || '').trim()
  if (!url) return false
  if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../') || url.startsWith('#')) return true
  try {
    const parsed = new URL(url, window.location.origin)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/** 渲染单个 Markdown 文本片段，并安全支持正文内直接书写的 HTML。 */
function MarkdownSegment({
  content,
  createHeadingId,
}: {
  content: string
  createHeadingId: (title: string) => string
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, articleHtmlSchema]]}
      components={{
        pre({ children }) {
          return <>{children}</>
        },
        code(props) {
          const { className, children } = props
          const match = /language-([\w-]+)/.exec(className || '')
          const rawText = children == null ? '' : String(children)
          const text = rawText.replace(/\n$/, '')
          const isBlockCode = Boolean(match) || rawText.includes('\n')
          if (!isBlockCode) return <code className={className}>{text}</code>
          // 仅在文章包含代码块时请求高亮组件，普通文章无需下载 Prism 语言包。
          return (
            <Suspense fallback={<pre className="ginblog-code-fallback"><code>{text}</code></pre>}>
              <CodeHighlighter language={match?.[1] || 'text'} showLineNumbers>{text}</CodeHighlighter>
            </Suspense>
          )
        },
        h1({ children, ...props }) {
          return <h1 {...props} id={createHeadingId(getReactNodeText(children as ReactNode))}>{children}</h1>
        },
        h2({ children, ...props }) {
          return <h2 {...props} id={createHeadingId(getReactNodeText(children as ReactNode))}>{children}</h2>
        },
        h3({ children, ...props }) {
          return <h3 {...props} id={createHeadingId(getReactNodeText(children as ReactNode))}>{children}</h3>
        },
        h4({ children, ...props }) {
          return <h4 {...props} id={createHeadingId(getReactNodeText(children as ReactNode))}>{children}</h4>
        },
        h5({ children, ...props }) {
          return <h5 {...props} id={createHeadingId(getReactNodeText(children as ReactNode))}>{children}</h5>
        },
        h6({ children, ...props }) {
          return <h6 {...props} id={createHeadingId(getReactNodeText(children as ReactNode))}>{children}</h6>
        },
        a({ href, children, ...props }) {
          if (!isSafeMarkdownUrl(href)) return <span {...props}>{children}</span>
          return <a {...props} href={href} target="_blank" rel="noreferrer noopener">{children}</a>
        },
        img({ src, alt, title, ...props }) {
          if (!isSafeMarkdownUrl(src)) return <span className="markdown-image-blocked">图片地址不可用</span>
          const size = parseImageSize(title)
          return <img {...props} src={src} alt={alt || ''} title={title || undefined} loading="lazy" style={size} />
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

/** 渲染局部付费或评论可见内容的安全占位卡片。 */
function AccessPlaceholder({ type }: { type: AccessPlaceholderType }) {
  const isPaid = type === 'paid'
  return (
    <section className="ginblog-content-lock" aria-label={isPaid ? '付费内容未解锁' : '评论可见内容未解锁'}>
      <div className="ginblog-content-lock-icon">{isPaid ? <LockOutlined /> : <CommentOutlined />}</div>
      <div>
        <strong>{isPaid ? '此处为付费内容' : '此处内容需评论后查看'}</strong>
        <p>{isPaid ? '解锁文章后即可继续阅读此部分内容。' : '发表一条评论后即可继续阅读此部分内容。'}</p>
      </div>
    </section>
  )
}

/** 清理旧版编辑器在局部隐藏区块前遗留的空值文本。 */
function removeHiddenContentArtifacts(content: string) {
  return content
    .replace(/(^|\n)\s*undefined\s*(?=\r?\n\s*\[\[ginblog-access:(?:paid|comment)\]\])/gi, '$1')
    .replace(/(^|\n)[ \t]*```[^\r\n]*\r?\n(?:[ \t]*\r?\n)*[ \t]*(?=\[\[ginblog-access:(?:paid|comment)\]\])/gim, '$1')
}

/** 将正文拆分为 Markdown 片段和独立访问占位卡片，避免占位标记被代码块吞没。 */
function renderMarkdownWithAccessPlaceholders(content: string) {
  const createHeadingId = createHeadingIdFactory()
  const parts = content.split(accessPlaceholderPattern)
  return parts.map((part, index) => {
    if (index % 2 === 1) return <AccessPlaceholder key={`access-${index}`} type={part.toLowerCase() as AccessPlaceholderType} />
    if (!part) return null
    return <MarkdownSegment key={`markdown-${index}`} content={part} createHeadingId={createHeadingId} />
  })
}

/** 统一渲染 Markdown，支持安全 HTML、GFM 表格、图片尺寸、代码高亮和局部访问提示。 */
export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const normalizedContent = normalizeImageSizeSyntax(removeHiddenContentArtifacts(maskArticleHiddenContent(content || '')))
  return <div className="markdown-body">{renderMarkdownWithAccessPlaceholders(normalizedContent)}</div>
}