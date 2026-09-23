package model

import (
	"strings"

	"ginblog/utils"

	"gorm.io/gorm"
)

// User 用户模型
type User struct {
	ID           uint        `gorm:"primaryKey;autoIncrement:1000;comment:ID;not null" json:"id"`
	NickName     string      `gorm:"size:32;comment:昵称" json:"nickName"`
	Username     string      `gorm:"size:32;comment:账号" json:"username"`
	Password     string      `gorm:"size:64;comment:密码" json:"password"`
	TokenVersion int         `gorm:"default:0;not null;comment:令牌版本号，修改账号或密码后自增，使此前签发的令牌全部失效" json:"-"`
	Sex          int         `gorm:"comment:1->男,2->女;not null" json:"sex"`
	QQ           string      `gorm:"size:10;comment:QQ" json:"qq"`
	Email        string      `gorm:"size:64;comment:Email" json:"email"`
	Phone        string      `gorm:"size:64;comment:Phone" json:"phone"`
	Money        float64     `gorm:"default:0;comment:余额" json:"money"`
	Status       int         `gorm:"default:1;comment:1->正常,2->封禁;not null" json:"status"`
	RealNameAuth bool        `gorm:"default:false;index;comment:是否已完成实名认证" json:"real_name_auth"`
	RoleLevel    string      `gorm:"size:32;default:default;index;comment:用户等级" json:"roleLevel"`
	CreateTime   utils.HTime `gorm:"comment:创建时间" json:"createTime"`
	UpdateTime   utils.HTime `gorm:"comment:更新时间;autoUpdateTime" json:"updateTime"`
}

// DefaultRoleLevel 是新用户注册时使用的默认等级标识。
const DefaultRoleLevel = "default"

// NormalizeRoleLevel 将空用户等级兼容为默认等级。
func NormalizeRoleLevel(roleLevel string) string {
	roleLevel = strings.TrimSpace(roleLevel)
	if roleLevel == "" {
		return DefaultRoleLevel
	}
	return roleLevel
}

func (User) TableName() string {
	return "ginblog_user"
}

// Auto 在数据库迁移时执行
func Auto(db *gorm.DB) error {
	if err := db.Set("gorm:table_options", "AUTO_INCREMENT=1000").AutoMigrate(&User{}); err != nil {
		return err
	}
	return nil
}

// CreateUserDto 新增用户操作模型
type CreateUserDto struct {
	Username   string `form:"username" json:"username" binding:"required"`
	Password   string `form:"password" json:"password" binding:"required"`
	Sex        int    `form:"sex" json:"sex" binding:"required"`
	QQ         string `form:"qq" json:"qq" binding:"required,min=5,max=11"`
	Email      string `form:"email" json:"email" binding:"required"`
	Code       string `form:"code" json:"code" binding:"required"`
	Phone      string `form:"phone" json:"phone" binding:"required,len=11"`
	InviteCode string `form:"invite_code" json:"invite_code" binding:"omitempty,max=32"`
}

// UserLoginDto 用户登录模型
type UserLoginDto struct {
	Username string `form:"username" json:"username" binding:"required"`
	Password string `form:"password" json:"password" binding:"required"`
}

// UpdateUserDto 修改用户信息模型
type UpdateUserDto struct {
	NickName string `form:"nick_name" json:"nickName" binding:"omitempty,max=32"`
	Sex      int    `form:"sex" json:"sex" binding:"omitempty,oneof=1 2"`
	QQ       string `form:"qq" json:"qq" binding:"omitempty,max=11"`
	Email    string `form:"email" json:"email" binding:"omitempty,max=64"`
	Phone    string `form:"phone" json:"phone" binding:"omitempty,len=11"`
}

// UserPwdDto 修改用户密码模型
type UserPwdDto struct {
	Username    string `form:"username" json:"username" binding:"required"`
	OldPassword string `form:"old_pwd" json:"oldPwd" binding:"required"`
	NewPassword string `form:"new_pwd" json:"newPwd" binding:"required"`
}

// UserVo token模型
type UserVo struct {
	ID       uint   `form:"ID" json:"ID" binding:"required"`
	NickName string `form:"nickName" json:"nickName" binding:"required"`
	Username string `form:"username" json:"username" binding:"required"`
	QQ       string `form:"qq" json:"qq" binding:"required"`
	Email    string `form:"email" json:"email" binding:"required"`
	Phone    string `form:"phone" json:"phone" binding:"required"`
	Sex      int    `form:"sex" json:"sex" binding:"required"`
}

// UserPageResult 添加分页结果模型
type UserPageResult struct {
	Total    int64  `json:"total"`     // 总记录数
	Page     int64  `json:"page"`      // 当前页码
	PageSize int64  `json:"page_size"` // 每页条数
	List     []User `json:"list"`      // 用户列表
}

// UpdateUser 修改用户信息模型
type UpdateUser struct {
	ID       uint   `form:"id" json:"id" binding:"required"`
	NickName string `form:"nick_name" json:"nickName"`
	Password string `form:"password" json:"password"`
	Sex      int    `form:"sex" json:"sex"`
	QQ       string `form:"qq" json:"qq"`
	Email    string `form:"email" json:"email"`
	Phone    string `form:"phone" json:"phone"`
	Status   int    `form:"status" json:"status"`
}

// UpdateUserInfo 修改用户信息的参数
// ID为必传，其他字段为可选（传则更新，不传则保持原数据）
type UpdateUserInfo struct {
	ID        uint    `form:"id" json:"id" binding:"required,min=1"`                 // 用户ID（必传，精确匹配）
	NickName  string  `form:"nick_name" json:"nick_name" binding:"omitempty,max=32"` // 昵称（可选，最大32字符）
	Username  string  `form:"username" json:"username" binding:"omitempty,max=32"`   // 账号（可选，最大32字符）
	Sex       int     `form:"sex" json:"sex" binding:"omitempty,oneof=1 2"`          // 性别（可选，1-男/2-女）
	QQ        string  `form:"qq" json:"qq" binding:"omitempty,max=10"`               // QQ（可选，最大10字符）
	Email     string  `form:"email" json:"email" binding:"omitempty,max=64"`         // 邮箱（可选，最大64字符）
	Phone     string  `form:"phone" json:"phone" binding:"omitempty,max=64"`         // 电话（可选，最大64字符）
	Money     float64 `form:"money" json:"money" binding:"omitempty,min=0"`          // 余额（可选，不能为负数）
	Status    int     `form:"status" json:"status" binding:"omitempty,oneof=1 2"`    // 状态（可选，1-正常/2-封禁）
	RoleLevel string  `form:"role_level" json:"role_level" binding:"omitempty,max=32"`
	Password  string  `form:"password" json:"password"`
}

// DeleteUser 删除用户
type DeleteUser struct {
	ID uint `form:"id" json:"id" binding:"required"`
}

// UpdateEmailPwd 前端修改用户密码模型
type UpdateEmailPwd struct {
	Email       string `form:"email" binding:"required,email"` // 验证邮箱格式
	Code        string `form:"code" binding:"required,len=6"`
	NewPassword string `form:"new_pwd" binding:"required,min=6,max=20"`
}

// GetUserDTO 管理员查询用户信息的分页与筛选参数
// 用于接收查询字符串参数（query params），支持分页和多字段筛选
type GetUserDTO struct {
	// 分页参数
	Page     int `form:"page" json:"page" binding:"omitempty,min=1"`                     // 页码：从1开始，默认1，最小1
	PageSize int `form:"page_size" json:"page_size" binding:"omitempty,oneof=20 50 100"` // 每页条数：仅支持20/50/100，默认20

	// 筛选参数（可选，未传则不筛选）
	ID       uint   `form:"id" json:"id" binding:"omitempty,min=1"`              // 用户ID：精确匹配，最小1（对应User模型的ID自增起始1000）
	Username string `form:"username" json:"username" binding:"omitempty,max=32"` // 账号：模糊匹配，最大长度32（对应User模型的username字段size:32）
	QQ       string `form:"qq" json:"qq" binding:"omitempty,max=10"`             // QQ号：模糊匹配，最大长度10（对应User模型的qq字段size:10）
	Email    string `form:"email" json:"email" binding:"omitempty,max=64"`       // 邮箱：模糊匹配，最大长度64（对应User模型的email字段size:64）
	Sex      int    `form:"sex" json:"sex" binding:"omitempty,oneof=1 2"`        // 性别：精确匹配，1=男，2=女（对应User模型的sex字段约束）
	Status   int    `form:"status" json:"status" binding:"omitempty,oneof=1 2"`  // 状态：精确匹配，1=正常，2=封禁（对应User模型的status字段约束）
}

// CreateUserDTO 管理员添加用户的参数
// 用户名和密码为必传，其他字段可选（未传则用默认值）
type CreateUserDTO struct {
	NickName string  `form:"nick_name" json:"nick_name" binding:"omitempty,max=32"` // 昵称（可选，默认空）
	Username string  `form:"username" json:"username" binding:"required,max=32"`    // 账号（必传，唯一，最大32字符）
	Password string  `form:"password" json:"password" binding:"required,min=6"`     // 密码（必传，最小6字符）
	Sex      int     `form:"sex" json:"sex" binding:"omitempty,oneof=1 2"`          // 性别（可选，1-男/2-女，默认0）
	QQ       string  `form:"qq" json:"qq" binding:"omitempty,max=10"`               // QQ（可选，最大10字符）
	Email    string  `form:"email" json:"email" binding:"omitempty,max=64"`         // 邮箱（可选，最大64字符）
	Phone    string  `form:"phone" json:"phone" binding:"omitempty,max=64"`         // 电话（可选，最大64字符）
	Money    float64 `form:"money" json:"money" binding:"omitempty,min=0"`          // 余额（可选，默认0，不能为负）
	Status   int     `form:"status" json:"status" binding:"omitempty,oneof=1 2"`    // 状态（可选，默认1-正常/2-封禁）
}
