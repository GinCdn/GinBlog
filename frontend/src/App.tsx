/** 应用路由，仅注册后端已实现的业务页面。 */
import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAppStore } from '@/store'
import { isAuthenticated } from '@/utils/auth'
import Home from '@/pages/Home'

const AdminLayout = lazy(() => import('@/layouts/AdminLayout'))
const UserLayout = lazy(() => import('@/layouts/UserLayout'))
const NotFound = lazy(() => import('@/pages/NotFound'))
const AdminLogin = lazy(() => import('@/pages/admin/Login'))
const AdminForgot = lazy(() => import('@/pages/admin/Forgot'))
const AdminConsole = lazy(() => import('@/pages/admin/Console'))
const AdminEmail = lazy(() => import('@/pages/admin/Email'))
const AdminSiteConfig = lazy(() => import('@/pages/admin/SiteConfig'))
const AdminCarouselConfig = lazy(() => import('@/pages/admin/CarouselConfig'))
const AdminUser = lazy(() => import('@/pages/admin/User'))
const AdminUserInfo = lazy(() => import('@/pages/admin/UserInfo'))
const UserForgot = lazy(() => import('@/pages/user/Forgot'))
const UserLogin = lazy(() => import('@/pages/user/Login'))
const UserRegister = lazy(() => import('@/pages/user/Register'))
const UserConsole = lazy(() => import('@/pages/user/Console'))
const UserInfo = lazy(() => import('@/pages/user/UserInfo'))
const RealName = lazy(() => import('@/pages/user/RealName'))
const RegisterConfigPage = lazy(() => import('@/pages/admin/Configs').then((module) => ({ default: module.RegisterConfigPage })))
const RoleConfigPage = lazy(() => import('@/pages/admin/Configs').then((module) => ({ default: module.RoleConfigPage })))
const PaymentConfigPage = lazy(() => import('@/pages/admin/Configs').then((module) => ({ default: module.PaymentConfigPage })))
const AlipayConfigPage = lazy(() => import('@/pages/admin/Configs').then((module) => ({ default: module.AlipayConfigPage })))
const PromotionConfigPage = lazy(() => import('@/pages/admin/Configs').then((module) => ({ default: module.PromotionConfigPage })))
const Records = lazy(() => import('@/pages/admin/Records'))
const Articles = lazy(() => import('@/pages/Articles'))
const ArticleDetail = lazy(() => import('@/pages/ArticleDetail'))
const ArticleEdit = lazy(() => import('@/pages/user/ArticleEdit'))
const SmsConfig = lazy(() => import('@/pages/admin/SmsConfig'))
const AntiBrushConfig = lazy(() => import('@/pages/admin/AntiBrushConfig'))
const AdminArticles = lazy(() => import('@/pages/admin/Articles'))
const AdminComments = lazy(() => import('@/pages/admin/Comments'))
const AdminCategories = lazy(() => import('@/pages/admin/Categories'))
const CommissionPage = lazy(() => import('@/pages/user/Finance').then((module) => ({ default: module.CommissionPage })))
const OrderPage = lazy(() => import('@/pages/user/Finance').then((module) => ({ default: module.OrderPage })))
const PromotionPage = lazy(() => import('@/pages/user/Finance').then((module) => ({ default: module.PromotionPage })))
const RechargePage = lazy(() => import('@/pages/user/Finance').then((module) => ({ default: module.RechargePage })))
const RolePage = lazy(() => import('@/pages/user/Finance').then((module) => ({ default: module.RolePage })))
const WithdrawalPage = lazy(() => import('@/pages/user/Finance').then((module) => ({ default: module.WithdrawalPage })))
function AdminRoute({ children }: { children: React.ReactNode }) {
  return isAuthenticated('admin') ? <>{children}</> : <Navigate to="/admin/login" replace />
}

function UserRoute({ children }: { children: React.ReactNode }) {
  return isAuthenticated('user') ? <>{children}</> : <Navigate to="/user/login" replace />
}

export default function App() {
  const loadSiteConfig = useAppStore((state) => state.loadSiteConfig)
  const siteConfigLoaded = useAppStore((state) => state.siteConfigLoaded)

  useEffect(() => { loadSiteConfig() }, [loadSiteConfig])

  // 站点配置加载完成后再渲染页面，避免默认配置闪现。
  if (!siteConfigLoaded) {
    return <div className="route-loading" role="status">页面加载中</div>
  }

  return (
    <Suspense fallback={<div className="route-loading" role="status">页面加载中</div>}>
      <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/articles" element={<Articles />} />
      <Route path="/category/:slug" element={<Articles />} />
      <Route path="/articles/:id" element={<ArticleDetail />} />
      <Route path="/user/login" element={<UserLogin />} />
      <Route path="/user/register" element={<UserRegister />} />
      <Route path="/user/forgot" element={<UserForgot />} />
      <Route path="/user" element={<UserRoute><UserLayout /></UserRoute>}>
        <Route index element={<Navigate to="console" replace />} />
        <Route path="console" element={<UserConsole />} />
        <Route path="recharge" element={<RechargePage />} />
        <Route path="orders" element={<OrderPage />} />
        <Route path="promotion" element={<PromotionPage />} />
        <Route path="commissions" element={<CommissionPage />} />
        <Route path="withdrawal" element={<WithdrawalPage />} />
        <Route path="roles" element={<RolePage />} />
        <Route path="realname" element={<RealName />} />
        <Route path="userinfo" element={<UserInfo />} />
        <Route path="articles" element={<ArticleEdit />} />
      </Route>
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/forgot" element={<AdminForgot />} />
      <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
        <Route index element={<Navigate to="console" replace />} />
        <Route path="console" element={<AdminConsole />} />
        <Route path="user" element={<AdminUser />} />
        <Route path="siteconfig" element={<AdminSiteConfig />} />
        <Route path="carousel" element={<AdminCarouselConfig />} />
        <Route path="email" element={<AdminEmail />} />
        <Route path="register" element={<RegisterConfigPage />} />
        <Route path="roles" element={<RoleConfigPage />} />
        <Route path="payment" element={<PaymentConfigPage />} />
        <Route path="alipay" element={<AlipayConfigPage />} />
        <Route path="sms-config" element={<SmsConfig />} />
        <Route path="anti-brush" element={<AntiBrushConfig />} />
        <Route path="articles" element={<AdminArticles />} />
        <Route path="comments" element={<AdminComments />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="promotion-config" element={<PromotionConfigPage />} />
        <Route path="recharge" element={<Records kind="recharge" />} />
        <Route path="orders" element={<Records kind="order" />} />
        <Route path="promotion-users" element={<Records kind="promotionUsers" />} />
        <Route path="invites" element={<Records kind="invites" />} />
        <Route path="commissions" element={<Records kind="commissions" />} />
        <Route path="withdrawals" element={<Records kind="withdrawals" />} />
        <Route path="userinfo" element={<AdminUserInfo />} />
      </Route>
      <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
