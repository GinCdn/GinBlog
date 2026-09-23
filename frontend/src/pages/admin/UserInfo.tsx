import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Col, Form, Input, Row, Typography, message } from 'antd'
import { LockOutlined, SaveOutlined, UserOutlined } from '@ant-design/icons'
import { PageContainer } from '@ant-design/pro-components'
import { adminApi, publicApi } from '@/api'
import { useAdminStore } from '@/store'
import type { RegisterConfig } from '@/types'
import { setToken, setUsername } from '@/utils/auth'
import { getPasswordRequirement, getPasswordValidationMessage } from '@/utils/passwordRule'

const { Text } = Typography

/** 管理员个人资料与密码修改页面。 */
export default function UserInfoPage() {
  const { adminInfo, getAdminInfo } = useAdminStore()
  const [infoForm] = Form.useForm()
  const [infoSaving, setInfoSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [registerConfig, setRegisterConfig] = useState<RegisterConfig>()
  const passwordRequirement = useMemo(() => getPasswordRequirement(registerConfig), [registerConfig])

  useEffect(() => {
    void getAdminInfo()
    void publicApi.getRegisterInfo().then((result) => {
      if (result.code === 200) setRegisterConfig(result.data)
    })
  }, [getAdminInfo])

  useEffect(() => {
    if (adminInfo) infoForm.setFieldsValue(adminInfo)
  }, [adminInfo, infoForm])

  const saveInfo = async (values: Record<string, unknown>) => {
    setInfoSaving(true)
    try {
      const result = await adminApi.updateAdminInfo(values)
      if (result.code !== 200) throw new Error(result.msg || '管理员资料保存失败')
      if (result.data?.token) setToken('admin', result.data.token)
      if (result.data?.username) setUsername('admin', result.data.username)
      message.success('管理员资料保存成功')
      await getAdminInfo()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '管理员资料保存失败')
    } finally {
      setInfoSaving(false)
    }
  }

  const savePassword = async (values: { old_pwd: string; new_pwd: string }) => {
    setPasswordSaving(true)
    try {
      const result = await adminApi.updateAdminPassword({ ...values, username: adminInfo?.username || '' })
      if (result.code !== 200) throw new Error(result.msg || '密码修改失败')
      message.success('密码修改成功')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '密码修改失败')
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <PageContainer title="管理员个人资料" subTitle="修改当前管理员的登录资料和密码" className="admin-page-container">
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card className="admin-panel admin-form-panel" title="基本资料" bordered={false}>
            <Text type="secondary">用户名修改后会自动刷新当前登录令牌，QQ、邮箱和手机号用于管理员资料展示与通知。</Text>
            <Form form={infoForm} layout="vertical" onFinish={saveInfo} requiredMark="optional" className="admin-account-form">
              <Row gutter={[16, 0]}>
                <Col xs={24} md={12}><Form.Item name="username" label="管理员用户名" rules={[{ required: true, message: '请输入管理员用户名' }, { pattern: /^[a-zA-Z0-9_-]{5,20}$/, message: '用户名为5-20位字母、数字、下划线或短横线' }]}><Input prefix={<UserOutlined />} autoComplete="username" /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name="nick_name" label="昵称" rules={[{ required: true, whitespace: true, message: '请输入昵称' }]}><Input /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入正确的邮箱' }]}><Input placeholder="name@example.com" autoComplete="email" /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name="phone" label="手机号" rules={[{ required: true, pattern: /^1\d{10}$/, message: '请输入11位手机号' }]}><Input autoComplete="tel" /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name="qq" label="QQ" rules={[{ required: true, pattern: /^\d{5,11}$/, message: '请输入5-11位QQ号' }]}><Input inputMode="numeric" /></Form.Item></Col>
              </Row>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={infoSaving}>保存资料</Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card className="admin-panel admin-form-panel" title="修改密码" bordered={false}>
            <Text type="secondary">{passwordRequirement.hint}。密码规则由注册配置统一控制。</Text>
            <Form layout="vertical" onFinish={savePassword} requiredMark="optional" className="admin-account-form">
              <Form.Item name="old_pwd" label="原密码" rules={[{ required: true, message: '请输入原密码' }]}><Input.Password prefix={<LockOutlined />} autoComplete="current-password" /></Form.Item>
              <Form.Item name="new_pwd" label="新密码" extra={passwordRequirement.hint} rules={[{ required: true, message: '请输入新密码' }, { validator: (_, value) => { const error = getPasswordValidationMessage(value || '', passwordRequirement); return error ? Promise.reject(new Error(error)) : Promise.resolve() } }]}><Input.Password prefix={<LockOutlined />} placeholder={passwordRequirement.hint} autoComplete="new-password" /></Form.Item>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={passwordSaving}>保存密码</Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </PageContainer>
  )
}
