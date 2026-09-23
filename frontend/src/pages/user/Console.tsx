import { useEffect, useMemo, useState } from 'react'
import { Avatar, Card, Col, Row, Skeleton, Space, Statistic, Tag, Typography } from 'antd'
import { ArrowRightOutlined, FileTextOutlined, IdcardOutlined, UserOutlined, WalletOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useUserStore } from '@/store'
import { formatUserTime } from '@/utils/user-data'
import { getQQAvatarUrl } from '@/utils/avatar'

const roleNames: Record<string, string> = { default: '普通用户', Level1: '一级代理', Level2: '二级代理', Level3: '三级代理', Level4: '顶级代理' }

/** 用户中心账户概览页面，所有数据来自已注册的用户信息接口。 */
export default function Console() {
  const navigate = useNavigate()
  const { userInfo, getUserInfo } = useUserStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => { void getUserInfo().finally(() => setLoading(false)) }, [getUserInfo])

  const role = useMemo(() => {
    const value = userInfo?.roleLevel ?? userInfo?.role_level ?? 'default'
    return roleNames[value] || value
  }, [userInfo])
  const verified = Boolean(userInfo?.realNameAuth ?? userInfo?.real_name_auth)
  const shortcuts = [
    { key: 'profile', label: '个人资料', description: '管理账户与绑定信息', icon: <UserOutlined />, path: '/user/userinfo' },
    { key: 'realname', label: '实名认证', description: verified ? '认证状态已完成' : '完成账户身份认证', icon: <IdcardOutlined />, path: '/user/realname' },
    { key: 'articles', label: '文章管理', description: '发布和维护个人文章', icon: <FileTextOutlined />, path: '/user/articles' },
  ]

  return <div className="user-page user-console-page">
    <div className="user-page-heading user-console-heading"><div><Typography.Title level={2}>账户概览</Typography.Title><Typography.Text type="secondary">账户状态与博客创作</Typography.Text></div></div>
    <Skeleton loading={loading} active>
      <Row gutter={[16, 16]} className="user-console-overview-row">
        <Col xs={24} lg={16}><Card className="user-panel user-console-profile-card"><div className="user-console-profile"><Avatar size={72} src={getQQAvatarUrl(userInfo?.qq)} icon={<UserOutlined />} /><div className="user-console-profile-main"><Typography.Title level={3}>{userInfo?.username || '用户'}</Typography.Title><Typography.Text type="secondary">用户 ID：{userInfo?.id ?? '-'}　注册时间：{formatUserTime(userInfo?.createTime ?? userInfo?.create_time)}</Typography.Text><Space size={[6, 6]} wrap className="user-status-tags"><Tag color="blue">{role}</Tag><Tag color={verified ? 'success' : 'default'}>{verified ? '已实名认证' : '未实名认证'}</Tag></Space></div></div><div className="user-console-meta-grid"><div><span>账户等级</span><strong>{role}</strong></div><div><span>实名认证</span><strong>{verified ? '已完成' : '未完成'}</strong></div><div><span>绑定邮箱</span><strong>{userInfo?.email || '-'}</strong></div><div><span>绑定手机</span><strong>{userInfo?.phone || '-'}</strong></div></div></Card></Col>
        <Col xs={24} lg={8}><Card className="user-panel user-console-balance-card"><div className="user-console-balance-label"><WalletOutlined /><Typography.Text>可用余额</Typography.Text></div><Statistic value={Number(userInfo?.balance || 0)} precision={2} prefix="￥" /><Typography.Text type="secondary">用于站内服务消费</Typography.Text></Card></Col>
      </Row>
      <section className="user-console-service-section" aria-label="常用服务"><div className="user-console-service-heading"><Typography.Title level={4}>常用服务</Typography.Title><Typography.Text type="secondary">快捷进入账户与博客功能</Typography.Text></div><div className="user-console-shortcut-grid">{shortcuts.map((item) => <button key={item.key} className="user-console-shortcut" type="button" onClick={() => navigate(item.path)}><span className="user-console-shortcut-icon">{item.icon}</span><span className="user-console-shortcut-content"><strong>{item.label}</strong><small>{item.description}</small></span><ArrowRightOutlined className="user-console-shortcut-arrow" /></button>)}</div></section>
    </Skeleton>
  </div>
}