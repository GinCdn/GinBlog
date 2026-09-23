import { useAppStore } from '@/store'
import { getChineseSiteText } from '@/utils/blog'

/** 公开博客底部信息，保持站点配置和备案信息的展示方式统一。 */
export default function BlogFooter() {
  const siteConfig = useAppStore((state) => state.siteConfig)
  const systemName = getChineseSiteText(siteConfig?.title, 'GinBlog博客系统')
  return (
    <footer className="joe-blog-footer">
      <div>
        <strong>{siteConfig?.copyright?.trim() || `${systemName} 版权所有`}</strong>
        <span>记录技术实践，分享真实经验</span>
      </div>
      {siteConfig?.icp_record?.trim() && (
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
          {siteConfig.icp_record.trim()}
        </a>
      )}
    </footer>
  )
}