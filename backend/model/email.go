package model

import "ginblog/utils"

// Email 邮箱模型
type Email struct {
	ID            uint        `gorm:"primaryKey;comment:ID;not null" json:"id"`
	Host          string      `gorm:"size:64;comment:邮箱服务器" json:"host"`
	Username      string      `gorm:"size:64;comment:邮箱用户名" json:"username"`
	Password      string      `gorm:"size:64;comment:邮箱授权码" json:"password"`
	Port          int         `gorm:"comment:邮箱端口" json:"port"`
	FromName      string      `gorm:"size:64;comment:发件人名称" json:"fromName"`
	SkipTLSVerify bool        `gorm:"comment:TLS(true->开启,false->关闭);default:true" json:"skip_tls_verify"`
	CreateTime    utils.HTime `gorm:"comment:创建时间" json:"createTime"`
	UpdateTime    utils.HTime `gorm:"comment:更新时间;autoUpdateTime" json:"updateTime"`
}

func (Email) TableName() string {
	return "ginblog_email"
}

// CreateEmail 新增邮箱模型
type CreateEmail struct {
	Host     string `form:"host" json:"host" binding:"required"`
	Username string `form:"username" json:"username" binding:"required"`
	Password string `form:"password" json:"password" binding:"required"`
	Port     int    `form:"port" json:"port" binding:"required"`
	FromName string `form:"from_name" json:"fromName" binding:"required"`
}

// UpdateEmailDto 修改邮箱信息模型
type UpdateEmailDto struct {
	Host     string `form:"host" json:"host" binding:"required"`
	Username string `form:"username" json:"username" binding:"required"`
	Password string `form:"password" json:"password" binding:"required"`
	Port     int    `form:"port" json:"port" binding:"required"`
	FromName string `form:"from_name" json:"fromName" binding:"required"`
}

// EmailDto 邮箱发信模型
type EmailDto struct {
	Email string `form:"email" json:"email" binding:"required"`
}

// EmailCode 存储邮箱验证码模型
type EmailCode struct {
	ID        uint        `gorm:"primaryKey;comment:ID;not null" json:"id"`
	Email     string      `gorm:"size:64;comment:收件人邮箱" json:"email"`
	Code      string      `gorm:"size:10;comment:验证码" json:"code"`
	CreatedAt utils.HTime `gorm:"comment:生成时间;autoUpdateTime" json:"createdAt"`
	ExpiresAt utils.HTime `gorm:"comment:过期时间" json:"expiresAt"`
}

func (EmailCode) TableName() string {
	return "ginblog_email_code"
}

// EmailCodeVo 验证码校验模型
type EmailCodeVo struct {
	Email string `form:"email" json:"email" binding:"required"`
	Code  string `form:"code" json:"code" binding:"required"`
}
