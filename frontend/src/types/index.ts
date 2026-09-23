/** 后端响应与业务数据类型。 */
export interface Result<T = any> { code: number; msg: string; data: T }
export interface PageResponse<T = any> { list?: T[]; total?: number; page?: number; page_size?: number; pagination?: { total?: number; page?: number; page_size?: number; pages?: number } }
export interface LoginForm { username: string; password: string; remember?: boolean }
export interface UserLoginResponse { token: string; UserVo?: { Username?: string } }
export interface RegisterForm { username: string; password: string; email: string; code: string; phone?: string; qq?: string; sex?: number; invite_code?: string }
export interface UserRealNameInfo { real_name?: string; id_card?: string; account?: string; channel?: string; verify_status?: boolean }
export interface User { id: number; nickName?: string; username: string; email?: string; phone?: string; qq?: string; sex?: number; status?: number | boolean; money?: number; balance?: number; real_name_auth?: boolean; realNameAuth?: boolean; real_name_info?: UserRealNameInfo; role_level?: string; roleLevel?: string; create_time?: string; createTime?: string; update_time?: string; updateTime?: string }
export interface AdminInfo { id: number; nick_name?: string; username: string; email?: string; phone?: string; qq?: string; create_time?: string; update_time?: string }
export interface CarouselConfig { id: number; image: string; link?: string; sort?: number; status?: boolean }
export interface SiteConfig { id?: number; title?: string; sub_title?: string; keywords?: string; logo?: string; favicon?: string; admin_email?: string; admin_kf_qq?: string; description?: string; icp_record?: string; copyright?: string; status?: boolean; comment_moderation?: boolean; comment_email_notify?: boolean }
export interface EmailConfig { id?: number; host?: string; port?: number; username?: string; password?: string; from_name?: string; fromName?: string; skip_tls_verify?: boolean }
export interface RegisterConfig { username_min_len?: number; username_max_len?: number; password_min_len?: number; password_max_len?: number; password_rule?: number; usernameMinLen?: number; usernameMaxLen?: number; passwordMinLen?: number; passwordMaxLen?: number; passwordRule?: number; verify_email?: boolean; verify_phone?: boolean; verifyEmail?: boolean; verifyPhone?: boolean; required_username?: boolean; required_phone?: boolean; required_email?: boolean; required_qq?: boolean; requiredUsername?: boolean; requiredPhone?: boolean; requiredEmail?: boolean; requiredQQ?: boolean; status?: boolean }
export interface RoleDiscount { id?: number; role_level?: string; discount?: number; status?: boolean }
export interface RealNameConfig { id?: number; channel?: 'alipay' | 'aliyun' | 'tencent' | 'mobile_three' | string; app_id?: string; secret_configured?: boolean; private_key_configured?: boolean; public_key_configured?: boolean; redirect_uri?: string; rule_id?: string; status?: boolean; provider_type?: 'official' | 'ginapi' | string; ginapi_base_url?: string; ginapi_app_key?: string; ginapi_app_secret_configured?: boolean; ginapi_app_slug?: string }
export interface PaymentConfig { id: number; name?: string; channel?: string; method?: string; scene?: string; enabled?: boolean; notify_url?: string; return_url?: string; epay_pay_url?: string; epay_pid?: string | number; epay_pay_key?: string; epay_pay_key_configured?: boolean; alipay_app_id?: string; alipay_private_key?: string; alipay_private_key_configured?: boolean; alipay_public_key?: string; alipay_public_key_configured?: boolean; wxpay_app_id?: string; wxpay_mch_id?: string; wxpay_api_key?: string; wxpay_api_key_configured?: boolean }
export interface AdminDailyTrendItem { date: string; orderCount: number; rechargeAmt: number; consumeAmt: number }
export interface AuthDailyTrendItem { date: string; success: number; pending: number; failed: number }
export interface AppCategory { id: number; name: string; slug: string; sort?: number; status?: boolean; description?: string }
export interface App { id: number; categoryId?: number; category_id?: number; name: string; slug: string; logo?: string; summary?: string; description?: string; providerName?: string; providerContact?: string; status?: boolean; requireRealName?: boolean; require_real_name?: boolean; plans?: AppPlan[] }
export interface AppPlan { id: number; appId?: number; app_id?: number; name: string; price: number; quota: number; quotaUnit?: string; quota_unit?: string; validDays?: number; valid_days?: number; trial?: boolean; sort?: number; status?: boolean; description?: string }
export interface AppEndpoint { id: number; appId?: number; app_id?: number; name: string; path: string; method: string; summary?: string; description?: string; requestHeaders?: string; requestQuery?: string; requestBody?: string; responseSuccess?: string; responseError?: string; errorCodes?: string; status?: boolean }
export interface AppOrder { id: number; orderNo?: string; order_no?: string; username?: string; appId?: number; app_id?: number; planId?: number; plan_id?: number; amount: number; paymentMethod?: string; payment_method?: string; status?: boolean; thirdTradeNo?: string; createTime?: string; paidAt?: string }
export interface AppSubscription { id: number; username?: string; appId?: number; app_id?: number; planId?: number; plan_id?: number; orderId?: number; order_id?: number; status?: boolean; quotaTotal?: number; quota_total?: number; quotaUsed?: number; quota_used?: number; startsAt?: string; expiresAt?: string; appKey?: string; lastUsedAt?: string }
export interface AppRealNameRecord { id: number; subscription_id: number; app_id: number; app_name?: string; plan_id?: number; plan_name?: string; username?: string; real_name?: string; id_card?: string; alipay_account?: string; verify_id?: string; status?: 'pending' | 'success' | 'failed' | string; verify_message?: string; create_time?: string; update_time?: string }

export interface Article {
  id: number
  title: string
  content: string
  description?: string
  coverImage?: string
  keywords?: string
  categoryId: number
  category?: Category
  authorId?: number
  author?: User
  viewCount?: number
  commentCount?: number
  isPublished?: boolean
  createTime?: string
  updateTime?: string
  tags?: Tag[]
  accessType?: 'public' | 'paid' | 'comment' | 'hidden' | string
  price?: number
  roleDiscount?: boolean
  rebateRate?: number
  isUnlocked?: boolean
  payablePrice?: number
  discountRate?: number
  unlockReason?: string
  hasProtectedContent?: boolean
  hasPaidContent?: boolean
  hasCommentContent?: boolean
  paidContentUnlocked?: boolean
  commentContentUnlocked?: boolean
  likeCount?: number
  liked?: boolean
  favoriteCount?: number
  favorited?: boolean
  previous?: ArticleNavigation
  next?: ArticleNavigation
}
export interface ArticleNavigation { id: number; title: string }
export interface Category { cid: number; name: string; slug?: string; parentId?: number; count?: number; description?: string; children?: Category[] }
export interface Tag { id: number; name: string }
export interface Comment {
  id: number
  articleId: number
  content: string
  userId?: number
  nickName?: string
  email?: string
  qq?: string
  likeCount?: number
  liked?: boolean
  parentId?: number
  isAuthor?: boolean
  status: number
  ip?: string
  createTime?: string
  updateTime?: string
}


