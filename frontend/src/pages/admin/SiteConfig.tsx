import { SaveOutlined, UploadOutlined } from '@ant-design/icons'
import { PageContainer } from '@ant-design/pro-components'
import { Button, Card, Col, Form, Input, Row, Switch, Tooltip, Typography, Upload, message, type UploadProps } from 'antd'
import { useEffect, useState } from 'react'
import { adminApi, publicApi } from '@/api'
import type { SiteConfig } from '@/types'
import { useAppStore } from '@/store'
import { getToken } from '@/utils/auth'

const { Text } = Typography

/** 管理员维护博客站点的公开信息和评论审核策略。 */
export default function SiteConfigPage() {
  const [form] = Form.useForm<SiteConfig>()
  const loadSiteConfig = useAppStore((state) => state.loadSiteConfig)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const result = await publicApi.getSiteInfo()
        if (result.code !== 200) throw new Error(result.msg || '站点配置加载失败')
        form.setFieldsValue({
          ...result.data,
          comment_moderation: Boolean(result.data?.comment_moderation),
          comment_email_notify: Boolean(result.data?.comment_email_notify),
        })
      } catch (error) {
        message.error(error instanceof Error ? error.message : '站点配置加载失败')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [form])

  /** 保存配置后同步刷新全局站点信息，保证后台和前台展示一致。 */
  const save = async (values: SiteConfig) => {
    setSaving(true)
    try {
      const result = await adminApi.updateSiteConfig(values)
      if (result.code !== 200) throw new Error(result.msg || '站点配置保存失败')
      await loadSiteConfig()
      message.success('站点配置已保存')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '站点配置保存失败')
    } finally {
      setSaving(false)
    }
  }

  /** 返回图片上传控件配置，并把服务端地址回填到对应字段。 */
  const getImageUploadProps = (field: 'logo' | 'favicon'): UploadProps => ({
    action: '/api/admin/upload',
    name: 'file',
    accept: 'image/png,image/jpeg,image/gif,image/webp',
    showUploadList: false,
    headers: { Authorization: `Bearer ${getToken('admin') || ''}` },
    beforeUpload: (file) => {
      if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
        message.error('仅支持 JPG、PNG、GIF 或 WebP 图片')
        return Upload.LIST_IGNORE
      }
      return true
    },
    onChange: ({ file }) => {
      if (file.status === 'done') {
        const result = file.response as { code?: number; msg?: string; data?: string }
        if (result?.code === 200 && result.data) {
          form.setFieldValue(field, result.data)
          message.success('图片上传成功')
          return
        }
        message.error(result?.msg || '图片上传失败')
      }
      if (file.status === 'error') message.error('图片上传失败')
    },
  })

  return (
    <PageContainer title="站点配置" subTitle="维护博客站点的公开信息、联系方式和评论审核策略" className="admin-page-container">
      <Card className="admin-panel admin-form-panel" loading={loading} bordered={false}>
        <Form className="admin-site-form" form={form} layout="vertical" onFinish={save} requiredMark="optional">
          <div className="admin-form-section">
            <div>
              <h3>基础信息</h3>
              <Text type="secondary">用于浏览器标题、搜索引擎信息和站点公开展示。</Text>
            </div>
            <Row gutter={[16, 0]}>
              <Col xs={24} md={12}><Form.Item name="title" label="站点名称"><Input placeholder="请输入站点名称" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="sub_title" label="副标题"><Input placeholder="请输入副标题" /></Form.Item></Col>
              <Col xs={24}><Form.Item name="description" label="站点描述"><Input.TextArea rows={3} placeholder="请输入站点描述" /></Form.Item></Col>
              <Col xs={24}><Form.Item name="keywords" label="关键词"><Input placeholder="多个关键词请使用英文逗号分隔" /></Form.Item></Col>
            </Row>
          </div>

          <div className="admin-form-section">
            <div>
              <h3>品牌与联系信息</h3>
              <Text type="secondary">填写可公开访问的资源地址和管理员联系方式。</Text>
            </div>
            <Row gutter={[16, 0]}>
              <Col xs={24} md={12}><Form.Item name="logo" label="Logo 地址"><Input placeholder="https://" addonAfter={<Upload {...getImageUploadProps('logo')}><Tooltip title="上传 Logo"><Button type="text" size="small" icon={<UploadOutlined />} /></Tooltip></Upload>} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="favicon" label="网站图标地址"><Input placeholder="https://" addonAfter={<Upload {...getImageUploadProps('favicon')}><Tooltip title="上传网站图标"><Button type="text" size="small" icon={<UploadOutlined />} /></Tooltip></Upload>} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="admin_email" label="管理员邮箱"><Input placeholder="name@example.com" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="admin_kf_qq" label="客服 QQ"><Input placeholder="请输入客服 QQ" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="icp_record" label="ICP备案号"><Input placeholder="请输入备案号" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="copyright" label="版权信息"><Input placeholder="请输入版权信息" /></Form.Item></Col>
            </Row>
          </div>

          <div className="admin-form-actions">
            <Form.Item name="comment_moderation" valuePropName="checked" noStyle>
              <Switch checkedChildren="开启审核" unCheckedChildren="无需审核" />
            </Form.Item>
            <span>评论审核</span>
            <Text type="secondary">开启后，用户和游客发表的评论需在评论管理中审核后才会公开显示。</Text>
            <Form.Item name="comment_email_notify" valuePropName="checked" noStyle>
              <Switch checkedChildren="开启通知" unCheckedChildren="关闭通知" />
            </Form.Item>
            <span>评论邮件通知</span>
            <Text type="secondary">审核通过后，一级评论通知文章作者，回复评论通知被回复者。</Text>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存配置</Button>
          </div>
        </Form>
      </Card>
    </PageContainer>
  )
}
