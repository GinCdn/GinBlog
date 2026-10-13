import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import { prefetchArticleRoute } from '@/utils/articlePrefetch'
import { alignSeoUrlsToCurrentOrigin } from '@/utils/seo'
import 'antd/dist/reset.css'
import './styles/global.css'

// 编译产物可能被部署到与构建时不同的域名，渲染前统一把绝对地址纠正为当前域名。
alignSeoUrlsToCurrentOrigin()

// 兼容历史 /web 入口和当前根目录入口，避免访问 /web/#/ 时落入前端 404 页面。
const routerBaseName = window.location.pathname === '/web' || window.location.pathname.startsWith('/web/')
  ? '/web'
  : undefined

// 文章详情页加速：React 挂载前就把正文请求发出去，与站点配置请求并行执行，
// 不再需要等「站点配置 → 路由代码块 → 正文接口」逐级串行。
const routePath = routerBaseName ? window.location.pathname.slice(routerBaseName.length) : window.location.pathname
const articleRouteMatch = /^\/articles\/(\d+)\/?$/.exec(routePath || '')
if (articleRouteMatch) {
  prefetchArticleRoute(Number(articleRouteMatch[1]))
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          colorSuccess: '#52c41a',
          borderRadius: 6,
          fontFamily: '"PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif',
        },
      }}
    >
      <BrowserRouter basename={routerBaseName}>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
)