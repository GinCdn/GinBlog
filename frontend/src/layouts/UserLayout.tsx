import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import {
  AppstoreOutlined,
  DashboardOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ShareAltOutlined,
  UserOutlined,
  WalletOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import {
  Avatar,
  Breadcrumb,
  Button,
  Dropdown,
  Layout,
  Menu,
  Space,
  Typography,
  type MenuProps,
} from 'antd'
import { useAppStore, useUserStore } from '@/store'
import { isAuthenticated } from '@/utils/auth'
import { getQQAvatarUrl } from '@/utils/avatar'

const menuItems: MenuProps['items'] = [
  { key: '/user/console', label: '用户中心', icon: <DashboardOutlined /> },
  { key: '/user/articles', label: '文章管理', icon: <FileTextOutlined /> },
  {
    key: 'finance',
    label: '财务管理',
    icon: <WalletOutlined />,
    children: [
      { key: '/user/recharge', label: '余额充值' },
      { key: '/user/orders', label: '支付订单' },
    ],
  },
  {
    key: 'promotion',
    label: '推广中心',
    icon: <ShareAltOutlined />,
    children: [
      { key: '/user/promotion', label: '推广概览' },
      { key: '/user/commissions', label: '佣金明细' },
      { key: '/user/withdrawal', label: '提现申请' },
    ],
  },
  {
    key: 'account',
    label: '账户管理',
    icon: <UserOutlined />,
    children: [
      { key: '/user/roles', label: '角色优惠' },
      { key: '/user/realname', label: '实名认证' },
      { key: '/user/userinfo', label: '个人资料' },
    ],
  },
]

const titles: Record<string, string> = {
  '/user/console': '用户中心',
  '/user/articles': '文章管理',
  '/user/recharge': '余额充值',
  '/user/orders': '支付订单',
  '/user/promotion': '推广概览',
  '/user/commissions': '佣金明细',
  '/user/withdrawal': '提现申请',
  '/user/roles': '角色优惠',
  '/user/realname': '实名认证',
  '/user/userinfo': '个人资料',
}

const groups: Record<string, string[]> = {
  finance: ['/user/recharge', '/user/orders'],
  promotion: ['/user/promotion', '/user/commissions', '/user/withdrawal'],
  account: ['/user/roles', '/user/realname', '/user/userinfo'],
}

function getSystemName(title?: string): string {
  const name = title?.trim() || 'GinBlog'
  return name.endsWith('系统') ? name : `${name}系统`
}

/** 用户中心的导航与页面承载布局。 */
export default function UserLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobile, setMobile] = useState(false)
  const { siteConfig } = useAppStore()
  const { userInfo, getUserInfo, logout } = useUserStore()
  const activeGroupKeys = useMemo(
    () => Object.entries(groups)
      .filter(([, paths]) => paths.includes(location.pathname))
      .map(([key]) => key),
    [location.pathname],
  )
  const [openKeys, setOpenKeys] = useState<string[]>(activeGroupKeys)

  useEffect(() => {
    setOpenKeys((keys) => Array.from(new Set([...keys, ...activeGroupKeys])))
  }, [activeGroupKeys])

  useEffect(() => {
    if (isAuthenticated('user')) {
      void getUserInfo()
    }
  }, [getUserInfo])

  useEffect(() => {
    if (mobile) setCollapsed(true)
  }, [location.pathname, mobile])

  const handleLogout = () => {
    logout()
    navigate('/user/login')
  }

  return (
    <div className="admin-shell">
      <Layout className="admin-layout">
        <Layout.Sider
          className="admin-sider"
          width={240}
          breakpoint="lg"
          collapsedWidth={mobile ? 0 : 64}
          onBreakpoint={(broken) => {
            setMobile(broken)
            setCollapsed(broken)
          }}
          collapsed={collapsed}
          trigger={null}
        >
          <div className="admin-brand">
            {siteConfig?.logo ? (
              <img src={siteConfig.logo} alt="" />
            ) : (
              <AppstoreOutlined className="admin-brand-icon" />
            )}
            {!collapsed && <span>{getSystemName(siteConfig?.title)}</span>}
          </div>
          <Menu
            className="admin-menu"
            mode="inline"
            items={menuItems}
            selectedKeys={[location.pathname]}
            openKeys={openKeys}
            onOpenChange={(keys) => setOpenKeys(keys)}
            onClick={({ key }) => {
              if (key.startsWith('/')) {
                navigate(key)
              }
            }}
          />
        </Layout.Sider>
        <Layout className="admin-main-layout">
          <Layout.Header className="admin-header">
            <Space size={14}>
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed((value) => !value)}
              />
              <Breadcrumb items={[{ title: titles[location.pathname] || '用户中心' }]} />
            </Space>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'profile',
                    icon: <UserOutlined />,
                    label: '个人资料',
                    onClick: () => navigate('/user/userinfo'),
                  },
                  { type: 'divider' },
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    danger: true,
                    label: '退出登录',
                    onClick: handleLogout,
                  },
                ],
              }}
            >
              <Space className="admin-user-menu">
                <Avatar size="small" src={getQQAvatarUrl(userInfo?.qq)} icon={<UserOutlined />} />
                <Typography.Text>{userInfo?.username || '用户'}</Typography.Text>
              </Space>
            </Dropdown>
          </Layout.Header>
          <Layout.Content className="admin-content">
            <Outlet />
          </Layout.Content>
          <Layout.Footer className="admin-footer">
            {siteConfig?.copyright || `${siteConfig?.title || 'GinBlog'} 版权所有`}
          </Layout.Footer>
        </Layout>
      </Layout>
    </div>
  )
}
