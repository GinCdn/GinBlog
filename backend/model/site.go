package model

import "ginblog/utils"

// SiteConfig 站点配置模型，存储站点全局配置项。
type SiteConfig struct {
	ID                 uint        `gorm:"primary_key;auto_increment:false" json:"id"`
	Title              string      `gorm:"size:128;comment:站点标题" json:"title"`
	SubTitle           string      `gorm:"size:128;comment:副标题" json:"sub_title"`
	Keywords           string      `gorm:"size:128;comment:关键词" json:"keywords"`
	Logo               string      `gorm:"comment:LOGO" json:"logo"`
	Favicon            string      `gorm:"comment:Favicon" json:"favicon"`
	AdminEmail         string      `gorm:"size:128;comment:管理员邮箱" json:"admin_email"`
	AdminKfQQ          string      `gorm:"size:32;comment:客服QQ" json:"admin_kf_qq"`
	Description        string      `gorm:"size:255;comment:站点描述" json:"description"`
	IcpRecord          string      `gorm:"size:128;comment:ICP备案号" json:"icp_record"`
	CommentModeration  bool        `gorm:"comment:评论审核开关" json:"comment_moderation"`
	CommentEmailNotify bool        `gorm:"default:false;comment:评论邮件通知开关" json:"comment_email_notify"`
	Copyright          string      `gorm:"size:128;comment:版权信息" json:"copyright"`
	CreateTime         utils.HTime `gorm:"comment:创建时间" json:"createTime"`
	UpdateTime         utils.HTime `gorm:"comment:更新时间;autoUpdateTime" json:"updateTime"`
}

// TableName 指定表名。
func (SiteConfig) TableName() string {
	return "ginblog_site_config"
}

// UpdateSiteConfig 更新站点配置的请求参数。
type UpdateSiteConfig struct {
	Title              string `form:"title" json:"title"`
	SubTitle           string `form:"sub_title" json:"sub_title"`
	Keywords           string `form:"keywords" json:"keywords"`
	Logo               string `form:"logo" json:"logo" binding:"omitempty,url"`
	Favicon            string `form:"favicon" json:"favicon" binding:"omitempty,url"`
	AdminEmail         string `form:"admin_email" json:"admin_email" binding:"omitempty,email"`
	AdminKfQQ          string `form:"admin_kf_qq" json:"admin_kf_qq"`
	Description        string `form:"description" json:"description"`
	IcpRecord          string `form:"icp_record" json:"icp_record"`
	CommentModeration  bool   `form:"comment_moderation" json:"comment_moderation"`
	CommentEmailNotify bool   `form:"comment_email_notify" json:"comment_email_notify"`
	Copyright          string `form:"copyright" json:"copyright"`
}
