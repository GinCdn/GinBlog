/**
 * 让编译产物自动适配当前访问域名。
 *
 * 前端是编译后分发的静态资源，index.html 里的绝对地址在构建时按当时的站点地址写入。
 * 一旦这份产物被部署到别的域名（换域名、迁移、分发给其他站长），这些地址就会指向错误的站点。
 * 这里在页面初始化时把它们统一改写为当前访问域名下的等价地址，
 * 使同一份编译产物在任意域名下都能自洽，无需重新构建。
 */

/** 把绝对地址换算成当前域名下的等价地址；相对地址与非法地址原样返回。 */
function rewriteUrl(value: string, origin: string): string {
  if (!/^https?:\/\//i.test(value)) return value
  try {
    const url = new URL(value)
    if (url.origin === origin) return value
    return `${origin}${url.pathname}${url.search}${url.hash}`
  } catch {
    return value
  }
}

/** 递归改写对象中出现的全部绝对地址字符串（含 @id、url、logo 等字段）。 */
function rewriteDeep(value: unknown, origin: string): unknown {
  if (typeof value === 'string') return rewriteUrl(value, origin)
  if (Array.isArray(value)) return value.map((item) => rewriteDeep(item, origin))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteDeep(item, origin)]))
  }
  return value
}

/** 在应用挂载前调用一次即可。 */
export function alignSeoUrlsToCurrentOrigin(): void {
  if (typeof window === 'undefined') return
  const origin = window.location.origin

  document.head.querySelectorAll<HTMLMetaElement>('meta[property="og:url"], meta[property="og:image"]').forEach((element) => {
    if (element.content) element.content = rewriteUrl(element.content, origin)
  })

  const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (canonical && canonical.href) canonical.href = rewriteUrl(canonical.href, origin)

  // 站点级结构化数据：解析后逐个字段改写，避免误伤 JSON 里的其他文本。
  document.head.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"][data-seo-site]').forEach((script) => {
    try {
      script.textContent = JSON.stringify(rewriteDeep(JSON.parse(script.textContent || ''), origin))
    } catch {
      // 解析失败时保持原样，不影响页面渲染。
    }
  })
}
