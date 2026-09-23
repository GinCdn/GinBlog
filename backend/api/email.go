package api

import (
	"errors"
	"fmt"
	. "ginblog/core"
	"ginblog/middleware"
	"ginblog/model"
	"ginblog/result"
	"ginblog/utils"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"strings"
)

// 邮箱配置固定使用数据库中的第 1 条记录。
const emailConfigID uint = 1

// CreateEmail 新增邮箱接口信息
// @Summary 新增邮箱接口信息
// @Tags 邮箱相关接口
// @Produce json
// @Description 新增邮箱接口信息
// @Param host formData string true "邮箱服务器"
// @Param username formData string true "邮箱用户名"
// @Param password formData string true "授权码"
// @Param port formData int true "邮箱端口"
// @Param from_name formData string true "发件人名称"
// @Success 200 {object} result.Result{data=model.CreateEmail}
// @router /api/admin/CreateEmail [post]
// @Security ApiKeyAuth
func CreateEmail(c *gin.Context) {
	var dto model.CreateEmail
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}
	//格式校验
	if !utils.IsValidEmail(dto.Username) {
		result.FailedWithMsg(c, result.BadRequest, "邮箱格式错误")
		return
	}
	var count int64
	Db.Model(&model.Email{}).Count(&count)
	if count > 0 {
		result.FailedWithMsg(c, result.InternalError, "已存在邮箱配置")
		return
	}
	addEmail := &model.Email{
		Host:       dto.Host,
		Username:   dto.Username,
		Password:   dto.Password,
		Port:       dto.Port,
		FromName:   dto.FromName,
		CreateTime: utils.HTime{Time: utils.Now()},
	}
	if err := Db.Create(addEmail).Error; err != nil {
		result.Failed(c, result.InternalError, result.CreateDateError)
		return
	}
	result.Success(c, true)
}

// UpdateEmail 修改邮箱接口信息
// @Summary 修改邮箱接口信息
// @Tags 邮箱相关接口
// @Produce json
// @Description 修改邮箱接口信息
// @Param host formData string true "邮箱服务器"
// @Param username formData string true "邮箱用户名"
// @Param password formData string true "授权码"
// @Param port formData int true "邮箱端口"
// @Param from_name formData string true "发件人名称"
// @Success 200 {object} result.Result{data=model.UpdateEmailDto}
// @router /api/admin/UpdateEmail [post]
// @Security ApiKeyAuth
func UpdateEmail(c *gin.Context) {
	var dto model.UpdateEmailDto
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}
	//格式校验
	if !utils.IsValidEmail(dto.Username) {
		result.FailedWithMsg(c, result.BadRequest, "邮箱格式错误")
		return
	}
	var emailDto model.Email
	if err := Db.First(&emailDto, emailConfigID).Error; err != nil {
		result.FailedWithMsg(c, result.NotFound, "邮箱配置不存在")
		return
	}
	updateEmail := map[string]interface{}{
		"host":      dto.Host,
		"username":  dto.Username,
		"password":  dto.Password,
		"port":      dto.Port,
		"from_name": dto.FromName,
	}
	if err := Db.Model(&model.Email{}).Where("id = ?", emailConfigID).Updates(updateEmail).Error; err != nil {
		result.Failed(c, result.ServiceUnavail, result.UpdateError)
		return
	}
	result.Success(c, true)
}

// SendCode 邮箱验证码接口
// @Summary 邮箱验证码接口
// @Tags 邮箱相关接口
// @Produce json
// @Description 邮箱验证码接口(发送间隙60s)
// @Param email formData string true "收件人邮箱地址"
// @Success 200 {object} result.Result{data=model.EmailDto}
// @router /api/SendCode [post]
func SendCode(c *gin.Context) {
	var dto model.EmailDto
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}

	// 格式校验
	if !utils.IsValidEmail(dto.Email) {
		result.FailedWithMsg(c, result.BadRequest, "邮箱格式错误")
		return
	}

	// 获取smtp配置
	if !VerifyAntiBrush(c, antiBrushEmail) {
		return
	}

	smtpConfig, err := GetEmailConfig(Db)
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "邮箱发信服务获取失败："+err.Error())
		return
	}

	// 关键：使用单例模式获取邮件服务（与修复后的MailService配套）
	mailService := middleware.NewMailService(Db, smtpConfig)

	// 发送验证码
	if err := mailService.SendCode(dto.Email); err != nil {
		switch {
		case strings.Contains(err.Error(), "频率限制"):
			result.FailedWithMsg(c, result.ServiceUnavail, "操作过于频繁，请60秒后再试!")
		case strings.Contains(err.Error(), "邮箱格式"):
			result.FailedWithMsg(c, result.BadRequest, "邮箱格式不正确")
		default:
			result.FailedWithMsg(c, result.InternalError, "验证码发送失败: "+err.Error())
		}
		return
	}

	result.Success(c, true)
}

// VerifyCode 邮箱验证码校验接口
// @Summary 邮箱验证码校验接口
// @Tags 邮箱相关接口
// @Produce json
// @Description 邮箱验证码校验接口
// @Param email formData string true "收件人邮箱地址"
// @Param code formData string true "邮箱验证码"
// @Success 200 {object} result.Result{data=model.EmailCodeVo}
// @router /api/VerifyCode [post]
func VerifyCode(c *gin.Context) {
	var dto model.EmailCodeVo
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}
	//格式校验
	if !utils.IsValidEmail(dto.Email) {
		result.FailedWithMsg(c, result.BadRequest, "邮箱格式错误")
		return
	}
	// 直接复用通用校验函数，一行搞定所有逻辑
	if !VerifyEmailCode(c, Db, dto.Email, dto.Code) {
		return // 校验失败已自动返回响应，无需额外处理
	}

	result.Success(c, true)
}

// GetEmail 获取邮箱信息
// @Summary 获取邮箱信息
// @Tags 邮箱相关接口
// @Produce json
// @Description 获取邮箱信息
// @Success 200 {object} result.Result
// @router /api/admin/getEmailInfo [get]
// @Security ApiKeyAuth
func GetEmail(c *gin.Context) {
	var dto model.Email
	if err := Db.First(&dto, emailConfigID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			result.FailedWithMsg(c, result.NotFound, "邮箱配置不存在")
		} else {
			result.Failed(c, result.InternalError, result.InfoDateError)
		}
		return
	}
	result.Success(c, dto)
}

// CheckEmail 查询邮箱用户名
func CheckEmail(username string) (email *model.Email) {
	Db.Where("username = ?", username).First(&email)
	return email
}

// VerifyEmailCode 通用验证码校验函数
// 一步完成配置获取+服务初始化+验证码校验
// 参数：gin上下文、DB实例、用户输入的邮箱和验证码
// 返回：true=校验通过，false=校验失败（已自动返回错误响应）
func VerifyEmailCode(c *gin.Context, db *gorm.DB, inputEmail, inputCode string) bool {
	// 1. 获取SMTP配置
	smtpConfig, err := GetEmailConfig(db)
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "邮箱发信服务获取失败："+err.Error())
		return false
	}

	// 2. 初始化邮件服务
	mailService := middleware.NewMailService(db, smtpConfig)

	// 3. 校验验证码
	codeValid, err := mailService.VerifyEmailCode(inputEmail, inputCode)
	if err != nil {
		result.FailedWithMsg(c, result.BadRequest, "验证码错误："+err.Error())
		return false
	}
	if !codeValid {
		result.FailedWithMsg(c, result.BadRequest, "验证码无效或已过期")
		return false
	}

	// 校验通过
	return true
}

// GetEmailConfig 获取邮箱配置
func GetEmailConfig(db *gorm.DB) (*model.Email, error) {
	var email model.Email
	if err := db.First(&email, emailConfigID).Error; err != nil {
		return nil, fmt.Errorf("未配置邮箱服务")
	}
	// 关键参数校验
	if email.Host == "" || email.Username == "" || email.Password == "" || email.Port == 0 {
		return nil, fmt.Errorf("SMTP配置不完整！")
	}
	return &email, nil
}
