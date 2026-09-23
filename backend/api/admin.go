package api

import (
	"errors"
	"fmt"
	. "ginblog/core"
	"ginblog/global"
	"ginblog/model"
	"ginblog/result"
	"ginblog/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// AdminLogin 后台登录接口
// @Summary 后台登录接口
// @Tags 后台相关接口
// @Produce json
// @Description 后台登录接口
// @Param username formData string true "用户名"
// @Param password formData string true "密码"
// @Success 200 {object} result.Result{data=model.AdminLoginDto}
// @router /api/admin/login [post]
func AdminLogin(c *gin.Context) {
	var dto model.AdminLoginDto
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}

	// 登录凭据先统一净化，再参与账号和 IP 两个维度的失败保护。
	sanitizer := utils.GetSanitizer()
	dto.Username = sanitizer.Sanitize(dto.Username)
	dto.Password = sanitizer.Sanitize(dto.Password)
	clientIP := c.ClientIP()
	limitType, remaining, err := checkLoginLimit(adminLoginLimitConfig, dto.Username, clientIP)
	if err != nil {
		global.Log.Errorf("管理员登录失败保护检查异常，降级放行: %v", err)
	} else if limitType == loginLimitByIP {
		result.FailedWithMsg(c, result.TooManyRequests, "当前网络请求过于频繁，请1小时后再试")
		return
	} else if limitType == loginLimitByUsername {
		result.FailedWithMsg(c, result.TooManyRequests, "该账号登录失败次数过多，请1小时后再试")
		return
	}

	adminDto := CheckAdmin(dto.Username)
	if adminDto.ID < 0 {
		if err := recordLoginFail(adminLoginLimitConfig, dto.Username, clientIP); err != nil {
			global.Log.Errorf("管理员登录失败次数记录异常: %v", err)
		}
		result.FailedWithMsg(c, result.Unauthorized, "用户名或密码错误")
		return
	}
	if !utils.VerifyPassword(adminDto.Password, dto.Password) {
		if err := recordLoginFail(adminLoginLimitConfig, dto.Username, clientIP); err != nil {
			global.Log.Errorf("管理员登录失败次数记录异常: %v", err)
		}
		message := "用户名或密码错误"
		if remaining > 1 {
			message = fmt.Sprintf("用户名或密码错误，还可尝试%d次", remaining-1)
		}
		result.FailedWithMsg(c, result.Unauthorized, message)
		return
	}
	if err := clearLoginFail(adminLoginLimitConfig, dto.Username); err != nil {
		global.Log.Errorf("管理员登录失败次数清除异常: %v", err)
	}

	// 生成令牌并保持原有返回结构。
	token, _ := GenerateAdminToken(adminDto)
	global.Log.Info("管理员token：", token)
	adminVo := model.AdminVo{
		ID:       adminDto.ID,
		Username: adminDto.Username,
	}
	result.Success(c, map[string]any{"token": token, "Admin": adminVo})
}

// UpdateAdminPwd 修改管理员密码
// @Summary 修改管理员密码
// @Tags 后台相关接口
// @Produce json
// @Description 修改管理员密码
// @Param username formData string true "用户名"
// @Param old_pwd formData string true "原密码"
// @Param new_pwd formData string true "新密码"
// @Success 200 {object} result.Result{data=model.UpdateAdminPwdDto}
// @router /api/admin/updateAdminPwd [post]
// @Security ApiKeyAuth
func UpdateAdminPwd(c *gin.Context) {
	var dto model.UpdateAdminPwdDto
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}
	if dto.NewPassword == dto.OldPassword {
		result.FailedWithMsg(c, result.BadRequest, "新密码不能与旧密码相同")
		return
	}
	registerSetting, settingErr := model.GetOrCreateRegisterSetting(Db)
	if settingErr == nil {
		if valid, message := utils.ValidatePasswordByRegisterRule(dto.NewPassword, registerSetting.PasswordMinLen, registerSetting.PasswordMaxLen, registerSetting.PasswordRule); !valid {
			result.FailedWithMsg(c, result.BadRequest, message)
			return
		}
	} else if !utils.IsValidPassword(dto.NewPassword) {
		errMsg := utils.GetPasswordErrorMsg(dto.NewPassword)
		result.FailedWithMsg(c, result.BadRequest, errMsg)
		return
	}

	// 管理员只能修改本人密码，用户名参数继续保留以兼容既有前端请求。
	usernameValue, exists := c.Get("username")
	if !exists {
		result.Failed(c, result.Unauthorized, result.SubNoAuthInfo)
		return
	}
	username, ok := usernameValue.(string)
	if !ok || username == "" {
		result.Failed(c, result.Unauthorized, result.SubNoAuthInfo)
		return
	}
	var adminDto model.Admin
	if err := Db.Where("username = ?", username).First(&adminDto).Error; err != nil {
		result.Failed(c, result.NotFound, result.SubUserNotFound)
		return
	}
	if !utils.VerifyPassword(adminDto.Password, dto.OldPassword) {
		result.FailedWithMsg(c, result.Unauthorized, "原密码错误")
		return
	}
	hashedPwd, err := utils.EncryptPassword(dto.NewPassword)
	if err != nil {
		result.Failed(c, result.Unauthorized, result.HashPwdError)
		return
	}
	// 密码变更同时自增令牌版本号，使该账号此前签发的全部令牌失效。
	tx := Db.Begin()
	updateData := map[string]interface{}{
		"password":      hashedPwd,
		"token_version": gorm.Expr("token_version + 1"),
	}
	if err := tx.Model(&adminDto).Updates(updateData).Error; err != nil {
		tx.Rollback()
		result.Failed(c, result.ServiceUnavail, result.UpdateError)
		return
	}
	tx.Commit()
	result.Success(c, true)
}

// UpdateAdmin 修改管理员信息
// @Summary 修改管理员信息
// @Tags 后台相关接口
// @Produce json
// @Description 修改当前登录管理员的用户名、昵称、QQ、邮箱和手机号
// @Param username formData string true "用户名（5至20位字母、数字、下划线或短横线）"
// @Param nick_name formData string true "昵称"
// @Param qq formData string true "QQ（5-11位数字）"
// @Param email formData string true "邮箱（如test@qq.com）"
// @Param phone formData string true "手机号（11位有效数字）"
// @Success 200 {object} result.Result{data=model.UpdateAdminDto} "更新成功，用户名变更时返回新令牌"
// @router /api/admin/update [post]
// @Security ApiKeyAuth
func UpdateAdmin(c *gin.Context) {
	var dto model.UpdateAdminDto
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}
	if dto.NickName == "" || dto.Username == "" || dto.QQ == "" || dto.Email == "" || dto.Phone == "" {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}
	if !utils.IsValidUsername(dto.Username) || !utils.IsValidQQ(dto.QQ) || !utils.IsValidPhone(dto.Phone) || !utils.IsValidEmail(dto.Email) {
		result.FailedWithMsg(c, result.BadRequest, "参数格式错误")
		return
	}

	// 使用当前令牌身份定位管理员，避免通过请求参数修改其他管理员资料。
	usernameValue, exists := c.Get("username")
	if !exists {
		result.Failed(c, result.Unauthorized, result.SubNoAuthInfo)
		return
	}
	currentUsername, ok := usernameValue.(string)
	if !ok || currentUsername == "" {
		result.Failed(c, result.Unauthorized, result.SubNoAuthInfo)
		return
	}
	var admin model.Admin
	if err := Db.Where("username = ?", currentUsername).First(&admin).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			result.Failed(c, result.NotFound, result.SubUserNotFound)
			return
		}
		result.Failed(c, result.InternalError, result.SubDbError)
		return
	}

	// 用户名变更前先检查冲突，避免管理员账号重复。
	if dto.Username != admin.Username {
		var count int64
		if err := Db.Model(&model.Admin{}).Where("username = ? AND id <> ?", dto.Username, admin.ID).Count(&count).Error; err != nil {
			result.Failed(c, result.InternalError, result.SubDbError)
			return
		}
		if count > 0 {
			result.FailedWithMsg(c, result.BadRequest, "用户名已存在")
			return
		}
	}

	// 用户名变更后签发新令牌，当前页面可继续保持登录状态。
	// 同时自增令牌版本号，使该账号此前签发的其它令牌全部失效。
	newToken := ""
	updateData := map[string]interface{}{
		"username":  dto.Username,
		"phone":     dto.Phone,
		"email":     dto.Email,
		"qq":        dto.QQ,
		"nick_name": dto.NickName,
	}
	if dto.Username != admin.Username {
		var err error
		newVersion := admin.TokenVersion + 1
		newToken, err = GenerateAdminToken(model.Admin{ID: admin.ID, Username: dto.Username, TokenVersion: newVersion})
		if err != nil {
			result.Failed(c, result.ServiceUnavail, result.UpdateError)
			return
		}
		updateData["token_version"] = newVersion
	}

	if err := Db.Model(&admin).Updates(updateData).Error; err != nil {
		result.Failed(c, result.ServiceUnavail, result.UpdateError)
		return
	}

	dto.Token = newToken
	result.Success(c, dto)
}

// GetAdmin 获取管理员信息
// @Summary 获取管理员信息
// @Tags 后台相关接口
// @Produce json
// @Description 获取当前登录管理员的信息（从登录态中获取username）
// @Success 200 {object} result.Result
// @router /api/admin/getAdminInfo [get]
// @Security ApiKeyAuth
func GetAdmin(c *gin.Context) {
	// 获取并验证username（修正变量名，避免混淆）
	usernameVal, exists := c.Get("username")
	if !exists {
		result.Failed(c, result.InternalError, result.UserDataError)
		return
	}
	username, ok := usernameVal.(string)
	if !ok {
		result.Failed(c, result.InternalError, result.UserDataError)
		return
	}

	// 查询管理员信息
	var admin model.Admin
	if err := Db.Where("username = ?", username).First(&admin).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			result.Failed(c, result.NotFound, result.SubUserNotFound)
		} else {
			result.Failed(c, result.InternalError, result.SubDbError)
		}
		return
	}

	// 构建返回数据（过滤密码等敏感字段）
	adminInfo := map[string]interface{}{
		"id":          admin.ID,
		"nick_name":   admin.NickName,
		"username":    admin.Username,
		"qq":          admin.QQ,
		"email":       admin.Email,
		"phone":       admin.Phone,
		"create_time": admin.CreateTime,
		"update_time": admin.UpdateTime,
	}

	result.Success(c, adminInfo)
}

// CheckAdmin 根据用户名查询
func CheckAdmin(username string) (adminDto model.Admin) {
	Db.Where("username = ?", username).First(&adminDto)
	return adminDto
}
