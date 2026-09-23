import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import {
  AccountBookOutlined,
  AppstoreOutlined,
  DashboardOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  ShareAltOutlined,
  TeamOutlined,
  UserOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  CommentOutlined,
} from '@ant-design/icons'
import { Avatar, Breadcrumb, Button, Dropdown, Layout, Menu, Space, Typography, type MenuProps } from 'antd'
import { useAdminStore, useAppStore } from '@/store'
import { isAuthenticated, removeToken } from '@/utils/auth'
import { getQQAvatarUrl } from '@/utils/avatar'

const menuItems: MenuProps['items'] = [
  { key: '/admin/console', label: '控制台', icon: <DashboardOutlined /> },
  {
    key: 'system',
    label: '系统设置',
    icon: <SettingOutlined />,
    children: [
      { key: '/admin/siteconfig', label: '站点配置' },
      { key: '/admin/carousel', label: '轮播图配置' },
      { key: '/admin/email', label: '邮件配置' },
      { key: '/admin/register', label: '注册配置' },
      { key: '/admin/roles', label: '角色折扣' },
      { key: '/admin/payment', label: '支付配置' },
      { key: '/admin/alipay', label: '实名配置' },
      { key: '/admin/sms-config', label: '短信配置' },
      { key: '/admin/anti-brush', label: '防刷配置' },
    ],
  },
  { key: '/admin/categories', label: '分类管理', icon: <FolderOpenOutlined /> },
  { key: '/admin/articles', label: '文章管理', icon: <FileTextOutlined /> },
  { key: '/admin/comments', label: '评论管理', icon: <CommentOutlined /> },
  { key: '/admin/user', label: '用户管理', icon: <TeamOutlined /> },
  {
    key: 'finance',
    label: '订单管理',
    icon: <AccountBookOutlined />,
    children: [
      { key: '/admin/recharge', label: '充值记录' },
      { key: '/admin/orders', label: '支付订单' },
    ],
  },
  {
    key: 'promotion',
    label: '推广管理',
    icon: <ShareAltOutlined />,
    children: [
      { key: '/admin/promotion-config', label: '推广配置' },
      { key: '/admin/promotion-users', label: '推广用户' },
      { key: '/admin/invites', label: '邀请关系' },
      { key: '/admin/commissions', label: '佣金记录' },
      { key: '/admin/withdrawals', label: '提现审核' },
    ],
  },
]

const titles: Record<string, string> = { '/admin/console': '控制台', '/admin/articles': '文章管理', '/admin/comments': '评论管理', '/admin/categories': '分类管理', '/admin/user': '用户管理', '/admin/recharge': '充值记录', '/admin/orders': '支付订单', '/admin/withdrawals': '提现审核', '/admin/promotion-config': '推广配置', '/admin/promotion-users': '推广用户', '/admin/invites': '邀请关系', '/admin/commissions': '佣金记录', '/admin/siteconfig': '站点配置', '/admin/carousel': '轮播图配置', '/admin/email': '邮件配置', '/admin/register': '注册配置', '/admin/roles': '角色折扣', '/admin/payment': '支付配置', '/admin/alipay': '实名配置', '/admin/sms-config': '短信配置', '/admin/anti-brush': '防刷配置', '/admin/userinfo': '管理员账户' }
const groups: Record<string, string[]> = { finance: ['/admin/recharge', '/admin/orders'], promotion: ['/admin/promotion-config', '/admin/promotion-users', '/admin/invites', '/admin/commissions', '/admin/withdrawals'], system: ['/admin/siteconfig', '/admin/carousel', '/admin/email', '/admin/register', '/admin/roles', '/admin/payment', '/admin/alipay', '/admin/sms-config', '/admin/anti-brush'] }

function getSystemName(title?: string): string {
  const name = title?.trim() || 'GinBlog'
  return name.endsWith('系统') ? name : `${name}系统`
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobile, setMobile] = useState(false)
  const { siteConfig } = useAppStore()
  const { adminInfo, getAdminInfo } = useAdminStore()
  const activeGroupKeys = useMemo(() => Object.entries(groups).filter(([, paths]) => paths.includes(location.pathname)).map(([key]) => key), [location.pathname])
  const [openKeys, setOpenKeys] = useState<string[]>(activeGroupKeys)

  useEffect(() => { setOpenKeys((keys) => Array.from(new Set([...keys, ...activeGroupKeys]))) }, [activeGroupKeys])
  useEffect(() => { if (isAuthenticated('admin')) void getAdminInfo() }, [getAdminInfo])
  useEffect(() => { if (mobile) setCollapsed(true) }, [location.pathname, mobile])
  const logout = () => { removeToken('admin'); useAdminStore.getState().logout(); navigate('/admin/login') }

  return <div className="admin-shell"><Layout className="admin-layout"><Layout.Sider className="admin-sider" width={240} breakpoint="lg" collapsedWidth={mobile ? 0 : 64} onBreakpoint={(broken) => { setMobile(broken); setCollapsed(broken) }} collapsed={collapsed} trigger={null}>
    <div className="admin-brand">{siteConfig?.logo ? <img src={siteConfig.logo} alt="" /> : <AppstoreOutlined className="admin-brand-icon" />}{!collapsed && <span>{getSystemName(siteConfig?.title)}</span>}</div>
    <Menu className="admin-menu" mode="inline" items={menuItems} selectedKeys={[location.pathname]} openKeys={openKeys} onOpenChange={(keys) => setOpenKeys(keys)} onClick={({ key }) => { if (key.startsWith('/')) navigate(key) }} />
  </Layout.Sider><Layout className="admin-main-layout"><Layout.Header className="admin-header"><Space size={14}><Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed((value) => !value)} /><Breadcrumb items={[{ title: titles[location.pathname] || '控制台' }]} /></Space><Dropdown menu={{ items: [{ key: 'profile', icon: <UserOutlined />, label: '管理员账户', onClick: () => navigate('/admin/userinfo') }, { type: 'divider' }, { key: 'logout', icon: <LogoutOutlined />, danger: true, label: '退出登录', onClick: logout }] }}><Space className="admin-user-menu"><Avatar size="small" src={getQQAvatarUrl(adminInfo?.qq)} icon={<UserOutlined />} /><Typography.Text>{adminInfo?.username || '管理员'}</Typography.Text></Space></Dropdown></Layout.Header><Layout.Content className="admin-content"><Outlet /></Layout.Content><Layout.Footer className="admin-footer">{siteConfig?.copyright || `${siteConfig?.title || 'GinBlog'} 版权所有`}</Layout.Footer></Layout></Layout></div>
}