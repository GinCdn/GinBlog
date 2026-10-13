/**
 * 文章详情预取缓存
 *
 * 目的：把文章接口请求提前到「页面启动」与「鼠标悬停」阶段，缩短正文出现时间。
 * 边界：只做提前发起与短时缓存，不参与任何业务判断；支付回跳、评论后刷新等
 *      场景走 force 刷新，确保拿到的是最新数据。
 */
import { publicApi } from '@/api'
import type { Article, PageResponse, Result } from '@/types'

type ArticleDetailResult = Result<PageResponse<Article>>

/** 缓存有效期，超过后重新请求，避免长时间停留页面看到过期数据。 */
const CACHE_TTL = 30 * 1000

const cache = new Map<number, { at: number; value: ArticleDetailResult }>()
const pending = new Map<number, Promise<ArticleDetailResult>>()
/** 每个文章的请求序号，用于丢弃被新请求取代的过期响应。 */
const sequence = new Map<number, number>()

function isValidId(id: number): boolean {
  return Number.isFinite(id) && id > 0
}

/** 读取未过期的缓存结果。 */
export function takeArticleDetail(id: number): ArticleDetailResult | undefined {
  if (!isValidId(id)) return undefined
  const hit = cache.get(id)
  if (!hit) return undefined
  if (Date.now() - hit.at >= CACHE_TTL) {
    cache.delete(id)
    return undefined
  }
  return hit.value
}

/** 返回已缓存或正在进行中的请求，均不存在时返回 undefined。 */
function consumeArticleDetail(id: number): Promise<ArticleDetailResult> | undefined {
  const cached = takeArticleDetail(id)
  if (cached) return Promise.resolve(cached)
  return pending.get(id)
}

/**
 * 加载文章详情：优先复用预取结果，其次复用进行中的请求，最后才发起新请求。
 * 结果会写入缓存，供后续路由跳转直接命中。
 */
export function fetchArticleDetail(id: number): Promise<ArticleDetailResult> {
  if (!isValidId(id)) return Promise.reject(new Error('文章编号无效'))
  const reused = consumeArticleDetail(id)
  if (reused) return reused

  const current = (sequence.get(id) || 0) + 1
  sequence.set(id, current)
  const task = publicApi
    .getArticleDetail(id)
    .then((result) => {
      // 仅当本次请求仍是最新一次时才写入缓存，避免被旧响应覆盖。
      if (sequence.get(id) === current) cache.set(id, { at: Date.now(), value: result })
      return result
    })
    .finally(() => {
      if (pending.get(id) === task) pending.delete(id)
    })
  pending.set(id, task)
  return task
}

/** 强制刷新：丢弃缓存与进行中的请求后重新拉取，用于支付成功、评论提交后的场景。 */
export function refreshArticleDetail(id: number): Promise<ArticleDetailResult> {
  if (!isValidId(id)) return Promise.reject(new Error('文章编号无效'))
  cache.delete(id)
  pending.delete(id)
  return fetchArticleDetail(id)
}

/**
 * 预取文章正文数据，并可同时预热文章详情页的懒加载代码块。
 * 在页面启动阶段或列表项悬停时调用，点击后基本可立即出内容。
 */
export function prefetchArticleRoute(id: number): void {
  if (!isValidId(id)) return
  void fetchArticleDetail(id).catch(() => undefined)
  // 文章详情页为 React.lazy 拆分，提前 import 可省去点击后的等待。
  void import('@/pages/ArticleDetail').catch(() => undefined)
}
