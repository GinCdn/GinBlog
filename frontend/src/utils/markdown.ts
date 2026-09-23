import type { ReactNode } from 'react'

export interface MarkdownHeading {
  title: string
  level: number
  id: string
}

/** 清理 Markdown 标题中的装饰语法，得到目录和正文一致的标题文本。 */
export function normalizeHeadingText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/\s+#+\s*$/, '')
    .trim()
}

/** 为文章标题生成稳定锚点，并对重复标题追加序号。 */
export function createHeadingIdFactory() {
  const counts = new Map<string, number>()
  return (title: string): string => {
    const base = normalizeHeadingText(title)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .trim()
      .replace(/\s+/g, '-') || 'section'
    const count = (counts.get(base) || 0) + 1
    counts.set(base, count)
    return count === 1 ? base : `${base}-${count}`
  }
}

/** 从 Markdown 正文中提取标题，忽略代码围栏内的伪标题。 */
export function extractMarkdownHeadings(content: string): MarkdownHeading[] {
  const createId = createHeadingIdFactory()
  let fenceChar = ''
  let fenceLength = 0
  return content.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trimStart()
    const fence = /^(\`{3,}|~{3,})/.exec(trimmed)
    if (fence) {
      const char = fence[1][0]
      if (!fenceChar) {
        fenceChar = char
        fenceLength = fence[1].length
      } else if (char === fenceChar && fence[1].length >= fenceLength && trimmed.slice(fence[1].length).trim() === '') {
        fenceChar = ''
        fenceLength = 0
      }
      return []
    }
    if (fenceChar) return []
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(trimmed)
    if (!match) return []
    const title = normalizeHeadingText(match[2])
    if (!title) return []
    return [{ title, level: match[1].length, id: createId(title) }]
  })
}

/** 将 React Markdown 标题节点转换为纯文本，供目录锚点生成使用。 */
export function getReactNodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(getReactNodeText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return getReactNodeText((node as { props?: { children?: ReactNode } }).props?.children)
  }
  return ''
}