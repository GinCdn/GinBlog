import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import 'antd/dist/reset.css'
import './styles/global.css'

// 兼容历史 /web 入口和当前根目录入口，避免访问 /web/#/ 时落入前端 404 页面。
const routerBaseName = window.location.pathname === '/web' || window.location.pathname.startsWith('/web/')
  ? '/web'
  : undefined
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