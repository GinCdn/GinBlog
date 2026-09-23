import { useEffect, useState } from 'react'
import { DeleteOutlined, LinkOutlined, PictureOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, InputNumber, Row, Col, Switch, Upload, message, type UploadProps } from 'antd'
import { PageContainer } from '@ant-design/pro-components'
import { adminApi } from '@/api'
import { getToken } from '@/utils/auth'

type CarouselFormItem = { id: number; image: string; link: string; sort: number; status: boolean }
type CarouselFormValues = { slides: CarouselFormItem[] }

const defaultSlides = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, image: '', link: '', sort: index + 1, status: false }))

/** 管理员维护首页轮播图，固定提供六个展示位，空展示位不会在前台显示。 */
export default function CarouselConfigPage() {
  const [form] = Form.useForm<CarouselFormValues>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const currentSlides = Form.useWatch('slides', form) || []
  const load = async () => {
    setLoading(true)
    try {
      const result = await adminApi.getCarousels()
      if (result.code !== 200) throw new Error(result.msg || '轮播图配置加载失败')
      const saved = result.data || []
      const slides = defaultSlides.map((item) => {
        const found = saved.find((slide) => slide.id === item.id)
        return found ? { ...item, ...found, image: found.image || '', link: found.link || '', sort: found.sort || item.sort, status: Boolean(found.status) } : item
      })
      form.setFieldsValue({ slides })
    } catch (error) {
      message.error(error instanceof Error ? error.message : '轮播图配置加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const uploadProps = (index: number): UploadProps => ({
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
          form.setFieldValue(['slides', index, 'image'], result.data)
          form.setFieldValue(['slides', index, 'status'], true)
          message.success(`第${index + 1}张轮播图上传成功`)
        } else message.error(result?.msg || '图片上传失败')
      }
      if (file.status === 'error') message.error('图片上传失败')
    },
  })

  const clearImage = (index: number) => {
    form.setFieldValue(['slides', index, 'image'], '')
    form.setFieldValue(['slides', index, 'status'], false)
  }

  const save = async (values: CarouselFormValues) => {
    setSaving(true)
    try {
      const results = await Promise.all(values.slides.map((slide, index) => adminApi.updateCarousel({
        id: index + 1,
        image: slide.image?.trim() || '',
        link: slide.link?.trim() || '',
        sort: Number(slide.sort || slide.id),
        status: Boolean(slide.status && slide.image?.trim()),
      })))
      const failed = results.find((result) => result.code !== 200)
      if (failed) throw new Error(failed.msg || '轮播图配置保存失败')
      message.success('轮播图配置已保存')
      await load()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '轮播图配置保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageContainer title="轮播图配置" subTitle="设置首页展示的一至六张轮播图及其跳转地址" className="admin-page-container">
      <Card className="admin-panel admin-form-panel carousel-config-panel" bordered={false} loading={loading}>
        <div className="carousel-config-tip">建议上传 1600×520 像素、宽高比约 3:1 的图片，可保证首页轮播区域显示完整。轮播图按排序值从小到大展示，未上传图片或关闭开关的展示位不会在首页显示，跳转地址可填写站内路径或完整网址。</div>
        <Form form={form} layout="vertical" onFinish={save} initialValues={{ slides: defaultSlides }}>
          <Form.List name="slides">
            {(fields) => (
              <Row gutter={[16, 16]}>
                {fields.map((field, index) => (
                  <Col xs={24} md={12} xl={8} key={field.key}>
                    <Card className="carousel-config-card" size="small" title={`轮播图 ${index + 1}`}>
                      <Form.Item name={[field.name, 'image']} label="图片地址" rules={[{ max: 500, message: '图片地址不能超过500个字符' }]}>
                        <Input placeholder="上传图片后自动填充" prefix={<PictureOutlined />} />
                      </Form.Item>
                      <div className="carousel-preview">
                        {currentSlides[index]?.image ? <img src={currentSlides[index].image} alt={`轮播图${index + 1}`} /> : <span>暂未上传图片</span>}
                      </div>
                      <div className="carousel-upload-actions">
                        <Upload {...uploadProps(index)}><Button icon={<UploadOutlined />}>上传图片</Button></Upload>
                        <Button danger icon={<DeleteOutlined />} onClick={() => clearImage(index)}>清空图片</Button>
                      </div>
                      <Form.Item name={[field.name, 'link']} label="跳转链接" extra="留空表示点击图片不跳转。">
                        <Input placeholder="例如 /articles/1 或 https://example.com" prefix={<LinkOutlined />} />
                      </Form.Item>
                      <Row gutter={12} align="middle">
                        <Col span={12}><Form.Item name={[field.name, 'sort']} label="排序"><InputNumber min={1} max={6} precision={0} style={{ width: '100%' }} /></Form.Item></Col>
                        <Col span={12}><Form.Item name={[field.name, 'status']} label="启用" valuePropName="checked"><Switch /></Form.Item></Col>
                      </Row>
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </Form.List>
          <div className="admin-form-actions"><Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存</Button></div>
        </Form>
      </Card>
    </PageContainer>
  )
}
