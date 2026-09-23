export type ArticleHiddenType = 'paid' | 'comment'

/** 将选中的正文包装为 GinBlog 局部隐藏区块。 */
export function buildHiddenBlock(type: ArticleHiddenType, content = ''): string {
  const label = content || (type === 'paid' ? '这里填写付费内容' : '这里填写评论后可见内容')
  return `\n:::ginblog-hidden ${type}\n${label}\n:::\n`
}

/**
 * 将历史文章中尚未由服务端裁剪的局部隐藏区块转换为访问占位标记。
 * 标记由 MarkdownRenderer 拆分为独立卡片，避免在未闭合代码块中显示原始 Markdown 符号。
 */
export function maskArticleHiddenContent(content: string): string {
  const blockPattern = /(^|\n)\s*:::ginblog-hidden\s+(paid|comment)\s*\r?\n([\s\S]*?)\r?\n\s*:::\s*(?=\n|$)/gi
  const shortPattern = /\[ginblog-hidden\s*:\s*(paid|comment)\s*\]([\s\S]*?)\[\/ginblog-hidden\s*\]/gi
  const render = (prefix: string, type: string) => `${prefix}\n[[ginblog-access:${type.toLowerCase() === 'paid' ? 'paid' : 'comment'}]]\n`
  return content
    .replace(blockPattern, (_match, prefix: string, type: string) => render(prefix, type))
    .replace(shortPattern, (_match, type: string) => render('', type))
}

/** 判断正文是否包含指定类型的局部隐藏区块。 */
export function hasArticleHiddenType(content: string, type: ArticleHiddenType): boolean {
  const normalized = content || ''
  const blockPattern = new RegExp(`(^|\\n)\\s*:::ginblog-hidden\\s+${type}\\s*\\r?\\n`, 'i')
  const shortPattern = new RegExp(`\\[ginblog-hidden\\s*:\\s*${type}\\s*\\]`, 'i')
  return blockPattern.test(normalized) || shortPattern.test(normalized)
}
