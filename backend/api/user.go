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

// CreateUser 用户注册接口
// @Summary 用户注册接口
// @Tags 用户相关接口
// @Produce json
// @Description 用户注册接口
// @Param username formData string true "用户名(5-20位)"
// @Param password formData string true "密码(6-20位，需包含字母大小写数字三种类型)"
// @Param qq formData string true "QQ(5-11位数字)"
// @Param email formData string true "邮箱(test@qq.com)"
// @Param phone formData string true "手机号(11位数字)"
// @Param sex formData int true "性别(1=男,2=女)" Enums(1,2)
// @Param code formData string true "验证码"
// @Success 200 {object} result.Result{data=model.CreateUserDto}
// @router /api/user/register [post]
func CreateUser(c *gin.Context) {
	var dto model.CreateUserDto
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}
	// 关键步骤：调用 HTML 净化工具，处理用户输入的 HTML 内容
	sanitizer := utils.GetSanitizer()
	dto.Username = sanitizer.Sanitize(dto.Username)
	dto.Password = sanitizer.Sanitize(dto.Password)
	dto.QQ = sanitizer.Sanitize(dto.QQ)
	dto.Email = sanitizer.Sanitize(dto.Email)
	dto.Phone = sanitizer.Sanitize(dto.Phone)
	dto.Code = sanitizer.Sanitize(dto.Code)

	//检验各字段的唯一性
	validate := UserValidate(c)
	if !validate("username", "该用户名已存在", dto.Username) {
		return
	}
	if !validate("phone", "该手机号已被绑定", dto.Phone) {
		return
	}
	if !validate("email", "该邮箱已被绑定", dto.Email) {
		return
	}
	if !validate("qq", "该QQ号已被绑定", dto.QQ) {
		return
	}
	// 读取注册配置并执行密码与用户名规则校验；读取失败时保持原有默认规则。
	registerSetting, settingErr := model.GetOrCreateRegisterSetting(Db)
	if settingErr == nil {
		if !registerSetting.Status {
			result.FailedWithMsg(c, result.Forbidden, "当前未开放注册")
			return
		}
		usernameLen := len([]rune(dto.Username))
		if usernameLen < registerSetting.UsernameMinLen || usernameLen > registerSetting.UsernameMaxLen {
			result.FailedWithMsg(c, result.BadRequest, "用户名长度不符合注册配置")
			return
		}
		if valid, message := utils.ValidatePasswordByRegisterRule(dto.Password, registerSetting.PasswordMinLen, registerSetting.PasswordMaxLen, registerSetting.PasswordRule); !valid {
			result.FailedWithMsg(c, result.BadRequest, message)
			return
		}
	} else if !utils.IsValidPassword(dto.Password) {
		result.FailedWithMsg(c, result.BadRequest, "参数格式错误")
		return
	}
	//校验邮箱验证码
	if !VerifyEmailCode(c, Db, dto.Email, dto.Code) {
		return
	}
	//密码加密处理
	hashedPwd, err := utils.EncryptPassword(dto.Password)
	if err != nil {
		result.Failed(c, result.Unauthorized, result.HashPwdError)
		return
	}
	//插入数据
	addUser := &model.User{
		Username:   dto.Username,
		Password:   hashedPwd,
		Sex:        dto.Sex,
		QQ:         dto.QQ,
		Email:      dto.Email,
		Phone:      dto.Phone,
		Status:     1,
		RoleLevel:  model.DefaultRoleLevel,
		NickName:   "用户" + dto.Username,
		CreateTime: utils.HTime{Time: utils.Now()},
		UpdateTime: utils.HTime{Time: utils.Now()},
	}
	tx := Db.Create(addUser)
	if tx.Error != nil {
		result.Failed(c, result.InternalError, result.CreateDateError)
		return
	}

	// 有邀请码时绑定邀请关系，失败不阻断原有注册流程
	if dto.InviteCode != "" {
		var promotion model.Promotion
		if err := Db.Where("promo_code = ? and status = ?", dto.InviteCode, 1).First(&promotion).Error; err == nil && promotion.UserID != addUser.ID {
			now := utils.HTime{Time: utils.Now()}
			relation := &model.InviteRelation{
				InviterID:   promotion.UserID,
				InviteeID:   addUser.ID,
				InviteeName: addUser.Username,
				CreateTime:  now,
			}
			var inviter model.User
			if err := Db.First(&inviter, promotion.UserID).Error; err == nil {
				relation.InviterName = inviter.Username
			}
			if err := Db.Create(relation).Error; err != nil {
				global.Log.Errorf("注册邀请关系绑定失败: userId=%d, inviteCode=%s, err=%v", addUser.ID, dto.InviteCode, err)
			}
		}
	}
	result.Success(c, true)
}

// UserLogin 用户登录接口
// @Summary 用户登录
// @Tags 用户相关接口
// @Produce json
// @Description 用户登录接口
// @Param username formData string true "用户名"
// @Param password formData string true "密码"
// @Success 200 {object} result.Result{data=model.UserLoginDto}
// @router /api/user/login [post]
func UserLogin(c *gin.Context) {
	var dto model.UserLoginDto
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}

	// 登录凭据先净化，避免恶意内容进入查询和 Redis 键。
	sanitizer := utils.GetSanitizer()
	dto.Username = sanitizer.Sanitize(dto.Username)
	dto.Password = sanitizer.Sanitize(dto.Password)
	clientIP := c.ClientIP()
	limitType, remaining, err := checkLoginLimit(userLoginLimitConfig, dto.Username, clientIP)
	if err != nil {
		global.Log.Errorf("用户登录失败保护检查异常，降级放行: %v", err)
	} else if limitType == loginLimitByIP {
		result.FailedWithMsg(c, result.TooManyRequests, "当前网络请求过于频繁，请1小时后再试")
		return
	} else if limitType == loginLimitByUsername {
		result.FailedWithMsg(c, result.TooManyRequests, "该账号登录失败次数过多，请1小时后再试")
		return
	}

	userDto := CheckUsername(dto.Username)
	if userDto.ID <= 0 {
		if err := recordLoginFail(userLoginLimitConfig, dto.Username, clientIP); err != nil {
			global.Log.Errorf("用户登录失败次数记录异常: %v", err)
		}
		result.FailedWithMsg(c, result.Unauthorized, "用户名或密码错误")
		return
	}
	if !utils.VerifyPassword(userDto.Password, dto.Password) {
		if err := recordLoginFail(userLoginLimitConfig, dto.Username, clientIP); err != nil {
			global.Log.Errorf("用户登录失败次数记录异常: %v", err)
		}
		message := "用户名或密码错误"
		if remaining > 1 {
			message = fmt.Sprintf("用户名或密码错误，还可尝试%d次", remaining-1)
		}
		result.FailedWithMsg(c, result.Unauthorized, message)
		return
	}
	if err := clearLoginFail(userLoginLimitConfig, dto.Username); err != nil {
		global.Log.Errorf("用户登录失败次数清除异常: %v", err)
	}

	// 生成令牌并保持原有返回结构。
	token, _ := GenerateUserToken(userDto)
	global.Log.Infof("用户token:%v", token)
	userVo := &model.UserVo{
		ID:       userDto.ID,
		NickName: userDto.NickName,
		Username: userDto.Username,
	}
	result.Success(c, map[string]any{"token": token, "UserVo": userVo})
}

// UpdateUser 修改用户信息
// @Summary 修改用户信息
// @Tags 用户相关接口
// @Produce json
// @Description 修改用户信息
// @Param nick_name formData string false "昵称"
// @Param qq formData string false "QQ(5-11位数字)"
// @Param email formData string false "邮箱(test@qq.com)"
// @Param phone formData string false "手机号(11位数字)"
// @Param sex formData int false "性别(1=男,2=女)" Enums(1,2)
// @Success 200 {object} result.Result{data=model.UpdateUserDto}
// @router /api/user/update [post]
// @Security ApiKeyAuth
func UpdateUser(c *gin.Context) {
	var dto model.UpdateUserDto
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}
	username, exists := c.Get("username")
	if !exists {
		result.Failed(c, result.InternalError, result.UserDataError)
		return
	}
	// 根据登录态查询当前用户，避免使用请求参数修改其他用户。
	userDto := CheckUsername(username)
	if userDto.ID <= 0 {
		result.Failed(c, result.NotFound, result.SubUserNotFound)
		return
	}

	// 只更新请求中明确提交的字段，未提交字段保持数据库原值。
	updateUser := make(map[string]interface{})
	if _, ok := c.Request.PostForm["nick_name"]; ok {
		if dto.NickName == "" {
			result.Failed(c, result.BadRequest, result.SubMissingParam)
			return
		}
		updateUser["nick_name"] = dto.NickName
	}
	if _, ok := c.Request.PostForm["sex"]; ok {
		updateUser["sex"] = dto.Sex
	}
	if _, ok := c.Request.PostForm["qq"]; ok {
		if !utils.IsValidQQ(dto.QQ) {
			result.FailedWithMsg(c, result.BadRequest, "QQ格式错误")
			return
		}
		updateUser["qq"] = dto.QQ
	}
	if _, ok := c.Request.PostForm["email"]; ok {
		if !utils.IsValidEmail(dto.Email) {
			result.FailedWithMsg(c, result.BadRequest, "邮箱格式错误")
			return
		}
		updateUser["email"] = dto.Email
	}
	if _, ok := c.Request.PostForm["phone"]; ok {
		if !utils.IsValidPhone(dto.Phone) {
			result.FailedWithMsg(c, result.BadRequest, "手机号格式错误")
			return
		}
		updateUser["phone"] = dto.Phone
	}
	if len(updateUser) == 0 {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}
	if err := Db.Model(&model.User{}).Where("id = ?", userDto.ID).Updates(updateUser).Error; err != nil {
		result.Failed(c, result.ServiceUnavail, result.UpdateError)
		return
	}
	result.Success(c, true)
}

// UpdateUserPwd 修改用户密码
// @Summary 修改用户密码
// @Tags 用户相关接口
// @Produce json
// @Description 修改用户密码
// @Param username formData string true "用户名"
// @Param old_pwd formData string true "原密码"
// @Param new_pwd formData string true "新密码(6-20位，必须包含字母大小写数字三种类型)"
// @Success 200 {object} result.Result{data=model.UserPwdDto}
// @router /api/user/updatePwd [post]
// @Security ApiKeyAuth
func UpdateUserPwd(c *gin.Context) {
	var dto model.UserPwdDto
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}

	// 密码修改对象必须以登录令牌中的身份为准，禁止使用请求参数切换目标用户。
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
	userDto := CheckUsername(username)
	if userDto.ID <= 0 {
		result.Failed(c, result.NotFound, result.SubUserNotFound)
		return
	}
	if dto.NewPassword == dto.OldPassword {
		result.FailedWithMsg(c, result.BadRequest, "新密码不能与原密码相同")
		return
	}
	registerSetting, settingErr := model.GetOrCreateRegisterSetting(Db)
	if settingErr == nil {
		if valid, message := utils.ValidatePasswordByRegisterRule(dto.NewPassword, registerSetting.PasswordMinLen, registerSetting.PasswordMaxLen, registerSetting.PasswordRule); !valid {
			result.FailedWithMsg(c, result.BadRequest, message)
			return
		}
	} else if !utils.IsValidPassword(dto.NewPassword) {
		result.FailedWithMsg(c, result.BadRequest, "密码格式错误")
		return
	}
	if !utils.VerifyPassword(userDto.Password, dto.OldPassword) {
		result.FailedWithMsg(c, result.Unauthorized, "原密码错误")
		return
	}
	hashedPwd, err := utils.EncryptPassword(dto.NewPassword)
	if err != nil {
		result.Failed(c, result.Unauthorized, result.HashPwdError)
		return
	}
	// 密码变更同时自增令牌版本号，使该账号此前签发的全部令牌失效。
	updateUser := map[string]interface{}{
		"password":      hashedPwd,
		"token_version": gorm.Expr("token_version + 1"),
	}
	if err := Db.Model(&model.User{}).Where("id = ?", userDto.ID).Updates(updateUser).Error; err != nil {
		result.Failed(c, result.ServiceUnavail, result.UpdateError)
		return
	}
	result.Success(c, true)
}

// GetUser 获取用户信息
// @Summary 获取用户信息
// @Tags 用户相关接口
// @Produce json
// @Description 获取用户信息
// @Success 200 {object} result.Result
// @router /api/user/getUserInfo [get]
// @Security ApiKeyAuth
func GetUser(c *gin.Context) {
	username, exists := c.Get("username")
	if !exists {
		result.Failed(c, result.InternalError, result.UserDataError)
		return
	}
	var user model.User
	//根据当前用户查询对应信息
	if err := Db.Where("username = ?", username).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			result.Failed(c, result.NotFound, result.SubUserNotFound)
			return
		} else {
			result.Failed(c, result.InternalError, result.UserDataError)
			return
		}
	}
	// 注意：返回用户信息时过滤密码
	user.Password = ""
	result.Success(c, user)
}

// UpdateEmailPwd 通过邮箱修改用户密码
// @Summary 通过邮箱修改用户密码
// @Tags 用户相关接口
// @Produce json
// @Description 通过邮箱修改用户密码
// @Param email formData string true "邮箱账号"
// @Param code formData string true "验证码"
// @Param new_pwd formData string true "新密码(6-20位，必须包含字母大小写数字三种类型)"
// @Success 200 {object} result.Result{data=model.UpdateEmailPwd}
// @router /api/user/UpdateEmailPwd [post]
func UpdateEmailPwd(c *gin.Context) {
	var dto model.UpdateEmailPwd
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}
	// 关键步骤：调用 HTML 净化工具，处理用户输入的 HTML 内容
	sanitizer := utils.GetSanitizer()
	dto.Email = sanitizer.Sanitize(dto.Email)
	dto.Code = sanitizer.Sanitize(dto.Code)
	dto.NewPassword = sanitizer.Sanitize(dto.NewPassword)

	user := CheckUserEmail(dto.Email)
	if user.ID <= 0 {
		result.Failed(c, result.NotFound, result.SubUserNotFound)
		return
	}
	if !utils.IsValidEmail(dto.Email) {
		result.Failed(c, result.BadRequest, "邮箱格式错误")
		return
	}

	registerSetting, settingErr := model.GetOrCreateRegisterSetting(Db)
	if settingErr == nil {
		if valid, message := utils.ValidatePasswordByRegisterRule(dto.NewPassword, registerSetting.PasswordMinLen, registerSetting.PasswordMaxLen, registerSetting.PasswordRule); !valid {
			result.FailedWithMsg(c, result.BadRequest, message)
			return
		}
	} else if !utils.IsValidPassword(dto.NewPassword) {
		result.FailedWithMsg(c, result.BadRequest, "密码格式错误")
		return
	}
	//校验邮箱验证码
	if !VerifyEmailCode(c, Db, dto.Email, dto.Code) {
		return
	}
	//密码加密
	hashedPwd, err := utils.EncryptPassword(dto.NewPassword)
	if err != nil {
		result.Failed(c, result.Unauthorized, result.HashPwdError)
		return
	}
	//更新密码，同时自增令牌版本号使该账号此前签发的全部令牌失效
	updateData := map[string]interface{}{
		"password":      hashedPwd,
		"token_version": gorm.Expr("token_version + 1"),
	}
	if err := Db.Model(&model.User{}).Where("id = ?", user.ID).Updates(updateData).Error; err != nil {
		result.Failed(c, result.ServiceUnavail, result.UpdateError)
		return
	}
	result.Success(c, true)
}

// CheckUserColumns 通用字段查询（精确白名单版）
// 检查指定字段是否存在对应值（如判断手机号/邮箱是否已被注册）
// 参数：
//   - column：字段名（必须在白名单中，如"username"/"phone"/"email"）
//   - value：字段值（如"admin"/"13800138000"）
//
// 返回：
//   - 存在返回true，不存在返回false
//   - 错误不为nil时表示查询失败（如字段不支持、数据库错误）
func CheckUserColumns(column string, value interface{}) (bool, error) {
	// 1. 字段白名单（切片+循环精确匹配，无歧义）
	allowedColumns := []string{"username", "phone", "email", "qq"}
	columnAllowed := false
	for _, allowed := range allowedColumns {
		if allowed == column {
			columnAllowed = true
			break
		}
	}
	if !columnAllowed {
		return false, fmt.Errorf("不支持的查询字段: %s", column)
	}

	// 2. 快速校验空值（避免无效数据库查询）
	if value == nil {
		return false, fmt.Errorf("查询值不能为空")
	}
	// 针对字符串类型的空值单独校验（避免"空字符串"被当作有效值）
	if strVal, ok := value.(string); ok && strVal == "" {
		return false, fmt.Errorf("查询值不能为空")
	}

	// 3. 执行查询（复用count变量，减少内存分配）
	var count int64
	if err := Db.Model(&model.User{}).
		Where(column+" = ?", value).
		Count(&count).Error; err != nil {
		global.Log.Errorf("字段查询失败 [column=%s, value=%v]: %v", column, value, err)
		return false, fmt.Errorf("数据库查询失败") // 对外隐藏敏感错误信息
	}

	return count > 0, nil
}

// UserValidate 生成用户字段校验器（完美版）
// 功能：同时处理字段的格式校验和唯一性校验，支持一次定义多次复用
// 参数：
//   - c：Gin上下文，用于返回错误响应
//
// 返回：
//
//	校验函数，接收（字段名、唯一性错误提示、字段值），返回是否校验通过
func UserValidate(c *gin.Context) func(column, uniqueErrMsg string, value interface{}) bool {
	return func(column, uniqueErrMsg string, value interface{}) bool {
		// 1. 安全类型转换（防止非字符串类型导致panic）
		strVal, ok := value.(string)
		if !ok {
			result.FailedWithMsg(c, result.BadRequest, column+"必须为字符串类型")
			return false
		}

		// 2. 格式校验（按字段类型执行对应规则）
		var formatValid bool
		var formatRule string // 用于提示具体格式要求
		switch column {
		case "username":
			formatValid = utils.IsValidUsername(strVal)
			formatRule = "（5-20位字母、数字或下划线）"
		case "phone":
			formatValid = utils.IsValidPhone(strVal)
			formatRule = "（11位有效手机号）"
		case "email":
			formatValid = utils.IsValidEmail(strVal)
			formatRule = "（如test@qq.com）"
		case "qq":
			formatValid = utils.IsValidQQ(strVal)
			formatRule = "（5-11位数字）"
		default:
			// 未知字段默认不校验格式（可根据需求改为严格模式）
			result.FailedWithMsg(c, result.BadRequest, "不支持的校验字段："+column)
			return false
		}

		// 格式校验失败时返回具体规则
		if !formatValid {
			result.FailedWithMsg(
				c,
				result.BadRequest,
				column+"格式错误"+formatRule,
			)
			return false
		}

		// 3. 唯一性校验（调用安全版字段查询函数）
		exists, err := CheckUserColumns(column, strVal)
		if err != nil {
			// 数据库错误单独处理，隐藏内部细节
			result.FailedWithMsg(c, result.InternalError, "系统繁忙，请稍后再试")
			return false
		}
		if exists {
			// 使用业务自定义的唯一性提示
			result.FailedWithMsg(c, result.BadRequest, uniqueErrMsg)
			return false
		}

		// 所有校验通过
		return true
	}
}

// CheckUsername 查询用户名
func CheckUsername(username any) (user *model.User) {
	Db.Where("username = ?", username).First(&user)
	return user
}

func CheckUserEmail(email string) (user *model.User) {
	Db.Where("email = ?", email).First(&user)
	return user
}
