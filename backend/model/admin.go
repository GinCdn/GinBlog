package model

import "ginblog/utils"

// Admin 管理员模型
type Admin struct {
	ID           uint        `gorm:"primary_key;comment:ID;not null" json:"id"`
	NickName     string      `gorm:"size:32;comment:昵称" json:"nick_name"`
	Username     string      `gorm:"size:32;comment:管理员账号" json:"username"`
	Password     string      `gorm:"size:64;comment:管理员密码" json:"password"`
	TokenVersion int         `gorm:"default:0;not null;comment:令牌版本号，修改账号或密码后自增，使此前签发的令牌全部失效" json:"-"`
	QQ           string      `gorm:"size:10;comment:QQ" json:"qq"`
	Email        string      `gorm:"size:64;comment:Email" json:"email"`
	Phone        string      `gorm:"size:11;comment:Phone" json:"phone"`
	CreateTime   utils.HTime `gorm:"comment:创建时间" json:"create_time"`
	UpdateTime   utils.HTime `gorm:"comment:更新时间;autoUpdateTime" json:"update_time"`
}

func (Admin) TableName() string {
	return "ginblog_admin"
}

// AdminLoginDto 登录模型
type AdminLoginDto struct {
	Username string `form:"username" json:"username" binding:"required"`
	Password string `form:"password" json:"password" binding:"required"`
}

// UpdateAdminDto 信息修改模型
type UpdateAdminDto struct {
	NickName string `form:"nick_name" json:"nick_name" binding:"required"`
	Username string `form:"username" json:"username" binding:"required"`
	QQ       string `form:"qq" json:"qq" binding:"required"`
	Email    string `form:"email" json:"email" binding:"required"`
	Phone    string `form:"phone" json:"phone" binding:"required"`
	Token    string `form:"-" json:"token,omitempty"`
}

// UpdateAdminPwdDto 修改管理员密码模型
type UpdateAdminPwdDto struct {
	Username    string `form:"username" json:"username" binding:"required"`
	OldPassword string `form:"old_pwd" json:"oldPwd" binding:"required"`
	NewPassword string `form:"new_pwd" json:"newPwd" binding:"required"`
}

// AdminVo token模型
type AdminVo struct {
	ID       uint   `form:"id" json:"id" binding:"required"`
	Username string `form:"username" json:"username" binding:"required"`
	QQ       string `form:"qq" json:"qq" binding:"required"`
	Email    string `form:"email" json:"email" binding:"required"`
	Phone    string `form:"phone" json:"phone" binding:"required"`
}
