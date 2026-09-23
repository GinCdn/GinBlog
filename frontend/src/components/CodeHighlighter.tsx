import { CheckOutlined, CopyOutlined } from '@ant-design/icons'
import { useRef, useState, type CSSProperties } from 'react'
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go'
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup'
import php from 'react-syntax-highlighter/dist/esm/languages/prism/php'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'
import oneDark from 'react-syntax-highlighter/dist/esm/styles/prism/one-dark'

SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('csharp', csharp)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('go', go)
SyntaxHighlighter.registerLanguage('java', java)
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('html', markup)
SyntaxHighlighter.registerLanguage('htm', markup)
SyntaxHighlighter.registerLanguage('xml', markup)
SyntaxHighlighter.registerLanguage('markup', markup)
SyntaxHighlighter.registerLanguage('php', php)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('sql', sql)
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('yaml', yaml)

interface CodeHighlighterProps {
  children: string
  language: string
  showLineNumbers?: boolean
  wrapLongLines?: boolean
  lineNumberStyle?: CSSProperties
  customStyle?: CSSProperties
}

/** 根据编辑器语言别名选择已注册的 Prism 语法高亮规则。 */
function normalizeCodeLanguage(language: string) {
  const normalizedLanguage = language.trim().toLowerCase()
  const aliases: Record<string, string> = {
    curl: 'bash',
    sh: 'bash',
    shell: 'bash',
    js: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    yml: 'yaml',
  }
  return aliases[normalizedLanguage] || normalizedLanguage || 'text'
}

/** 将代码写入剪贴板，不支持剪贴板接口时使用兼容方式复制。 */
async function copyCodeToClipboard(content: string) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(content)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = content
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '0'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)

  if (!copied) {
    throw new Error('复制失败')
  }
}

/** 显示文章代码块的语法高亮、行号及复制入口。 */
export default function CodeHighlighter({ children, language, customStyle, ...props }: CodeHighlighterProps) {
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<number | undefined>(undefined)

  /** 复制成功后短暂反馈结果，便于用户确认操作。 */
  const handleCopy = async () => {
    try {
      await copyCodeToClipboard(children || '')
      setCopied(true)
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="ginblog-code-block">
      <div className="ginblog-code-toolbar" aria-hidden="true">
        <span className="ginblog-code-dot is-red" />
        <span className="ginblog-code-dot is-yellow" />
        <span className="ginblog-code-dot is-green" />
      </div>
      <button
        type="button"
        className="ginblog-code-copy"
        onClick={handleCopy}
        aria-label={copied ? '代码已复制' : '复制代码'}
        title={copied ? '代码已复制' : '复制代码'}
      >
        {copied ? <CheckOutlined /> : <CopyOutlined />}
      </button>
      <SyntaxHighlighter
        language={normalizeCodeLanguage(language)}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '42px 17px 16px',
          color: '#abb2bf',
          background: '#282c34',
          userSelect: 'text',
          WebkitUserSelect: 'text',
          ...customStyle,
        }}
        {...props}
      >
        {children || ''}
      </SyntaxHighlighter>
    </div>
  )
}
