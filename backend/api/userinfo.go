package api

import (
	"errors"
	. "ginblog/core"
	"ginblog/model"
	"ginblog/result"
	"ginblog/utils"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"strings"
)

// adminUserRealNameInfo 是管理员用户列表使用的实名信息，只返回展示所需字段。
type adminUserRealNameInfo struct {
	RealName     string `json:"real_name"`
	IDCard       string `json:"id_card"`
	Channel      string `json:"channel"`
	VerifyStatus bool   `json:"verify_status"`
}

// adminUserListItem 是管理员用户列表的安全响应结构，不包含用户密码。
type adminUserListItem struct {
	ID           uint                   `json:"id"`
	NickName     string                 `json:"nickName"`
	Username     string                 `json:"username"`
	Sex          int                    `json:"sex"`
	QQ           string                 `json:"qq"`
	Email        string                 `json:"email"`
	Phone        string                 `json:"phone"`
	Money        float64                `json:"money"`
	Status       int                    `json:"status"`
	RoleLevel    string                 `json:"roleLevel"`
	CreateTime   utils.HTime            `json:"createTime"`
	UpdateTime   utils.HTime            `json:"updateTime"`
	RealNameAuth bool                   `json:"real_name_auth"`
	RealNameInfo *adminUserRealNameInfo `json:"real_name_info,omitempty"`
}

// GetUserInfo 管理员分页查询用户信息（支持多字段筛选）
// @Summary 管理员分页查询用户信息
// @Tags 用户管理接口
// @Produce json
// @Description 管理员分页获取用户信息，支持按ID、账号、QQ、邮箱、性别、状态筛选，默认每页20条
// @Param page query int false "页码（从1开始，默认1）"
// @Param page_size query int false "每页条数（支持20/50/100，默认20）"
// @Param id query uint false "用户ID（精确匹配，可选）"
// @Param username query string false "账号（模糊匹配，可选）"
// @Param qq query string false "QQ（模糊匹配，可选）"
// @Param email query string false "邮箱（模糊匹配，可选）"
// @Param sex query int false "性别（1-男，2-女，精确匹配，可选）"
// @Param status query int false "状态（1-正常，2-封禁，精确匹配，可选）"
// @Success 200 {object} result.Result{data=map[string]interface{}} "查询成功，返回用户列表和分页信息"
// @Failure 400 {object} result.Result "参数错误"
// @Failure 401 {object} result.Result "未登录"
// @Failure 403 {object} result.Result "无管理员权限"
// @Failure 500 {object} result.Result "服务器错误"
// @router /api/admin/GetUserInfo [get]
// @Security ApiKeyAuth
func GetUserInfo(c *gin.Context) {
	// 1. 绑定分页和筛选参数
	var dto model.GetUserDTO
	if err := c.ShouldBindQuery(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}

	// 2. 处理分页默认值
	page := dto.Page
	if page < 1 {
		page = 1 // 默认第1页
	}
	pageSize := dto.PageSize
	switch pageSize {
	case 20, 50, 100:
	default:
		pageSize = 20 // 默认20条/页
	}
	offset := (page - 1) * pageSize // 计算偏移量

	// 3. 验证管理员权限
	username, exists := c.Get("username")
	if !exists {
		result.FailedWithMsg(c, result.Unauthorized, "未登录，无权限查询用户信息")
		return
	}
	admin := CheckAdmin(username.(string)) // 复用之前的管理员校验函数
	if admin.ID <= 0 {
		result.FailedWithMsg(c, result.Forbidden, "无管理员权限，无法查询用户信息")
		return
	}

	// 4. 构建动态查询条件（排除密码字段，避免泄露）
	db := Db.Model(&model.User{}).Select("id, nick_name, username, sex, qq, email, phone, money, status, real_name_auth, role_level, create_time, update_time")

	// 4.1 筛选：用户ID（精确匹配）
	if dto.ID > 0 {
		db = db.Where("id = ?", dto.ID)
	}

	// 4.2 筛选：账号（模糊匹配）
	if dto.Username != "" {
		db = db.Where("username like ?", "%"+dto.Username+"%")
	}

	// 4.3 筛选：QQ（模糊匹配）
	if dto.QQ != "" {
		db = db.Where("qq like ?", "%"+dto.QQ+"%")
	}

	// 4.4 筛选：邮箱（模糊匹配）
	if dto.Email != "" {
		db = db.Where("email like ?", "%"+dto.Email+"%")
	}

	// 4.5 筛选：性别（1-男，2-女，精确匹配）
	if dto.Sex == 1 || dto.Sex == 2 {
		db = db.Where("sex = ?", dto.Sex)
	}

	// 4.6 筛选：状态（1-正常，2-封禁，精确匹配）
	if dto.Status == 1 || dto.Status == 2 {
		db = db.Where("status = ?", dto.Status)
	}

	// 5. 执行分页查询（先查总条数，再查当前页数据）
	var (
		userList []model.User
		total    int64
	)

	// 5.1 统计总条数
	if err := db.Count(&total).Error; err != nil {
		result.FailedWithMsg(c, result.InternalError, "查询用户信息失败")
		return
	}

	// 5.2 查询当前页数据（按ID倒序，最新用户在前）
	if err := db.Offset(offset).Limit(pageSize).Order("id desc").Find(&userList).Error; err != nil {
		result.FailedWithMsg(c, result.InternalError, "查询用户信息失败")
		return
	}

	// 6. 批量查询当前页用户的实名信息，避免逐条查询产生额外数据库开销。
	userIDs := make([]uint, 0, len(userList))
	for _, user := range userList {
		userIDs = append(userIDs, user.ID)
	}

	authByUserID := make(map[uint]model.UserRealNameAuth, len(userIDs))
	if len(userIDs) > 0 {
		var realNameRecords []model.UserRealNameAuth
		if err := Db.Where("user_id IN ?", userIDs).Order("update_time desc, id desc").Find(&realNameRecords).Error; err != nil {
			result.FailedWithMsg(c, result.InternalError, "查询用户实名信息失败")
			return
		}
		for _, record := range realNameRecords {
			if _, exists := authByUserID[record.UserID]; !exists {
				authByUserID[record.UserID] = record
			}
		}
	}

	// 7. 组装安全响应。管理员可查看完整手机号和真实姓名，身份证号码始终脱敏。
	list := make([]adminUserListItem, 0, len(userList))
	for _, user := range userList {
		item := adminUserListItem{
			ID:           user.ID,
			NickName:     user.NickName,
			Username:     user.Username,
			Sex:          user.Sex,
			QQ:           user.QQ,
			Email:        user.Email,
			Phone:        user.Phone,
			Money:        user.Money,
			Status:       user.Status,
			RealNameAuth: user.RealNameAuth,
			RoleLevel:    user.RoleLevel,
			CreateTime:   user.CreateTime,
			UpdateTime:   user.UpdateTime,
		}
		if record, exists := authByUserID[user.ID]; exists {
			item.RealNameInfo = &adminUserRealNameInfo{
				RealName:     record.RealName,
				IDCard:       utils.DesensitizeIDCard(record.IDCard),
				Channel:      record.Channel,
				VerifyStatus: user.RealNameAuth && record.VerifyStatus,
			}
		}
		list = append(list, item)
	}

	// 8. 组装返回数据
	responseData := map[string]interface{}{
		"list":       list,                                            // 用户列表（不含密码）
		"total":      total,                                           // 总条数
		"total_page": (total + int64(pageSize) - 1) / int64(pageSize), // 总页数（向上取整）
		"page":       page,                                            // 当前页码
		"page_size":  pageSize,                                        // 每页条数
	}

	// 9. 返回成功结果
	result.Success(c, responseData)
}

// UpdateUserInfo 管理员修改用户信息（动态更新，传则改，不传则不变）
// @Summary 管理员修改用户信息
// @Tags 用户管理接口
// @Produce json
// @Description 管理员通过用户ID查询用户，仅更新传入的字段（未传字段保持不变），ID为必传
// @Param id formData uint true "用户ID（必传，精确匹配）"
// @Param nick_name formData string false "昵称（可选，最大32字符）"
// @Param username formData string false "账号（可选，最大32字符）"
// @Param sex formData int false "性别（可选，1-男/2-女）"
// @Param qq formData string false "QQ（可选，最大10字符）"
// @Param email formData string false "邮箱（可选，最大64字符）"
// @Param phone formData string false "电话（可选，最大64字符）"
// @Param money formData float64 false "余额（可选，不能为负数）"
// @Param password formData string false "密码（可选，6-20位）"
// @Param status formData int false "状态（可选，1-正常/2-封禁）"
// @Success 200 {object} result.Result{data=bool} "更新成功返回true"
// @Failure 400 {object} result.Result "参数错误（如ID未传/字段不合法）"
// @Failure 401 {object} result.Result "未登录"
// @Failure 403 {object} result.Result "无管理员权限"
// @Failure 404 {object} result.Result "用户ID不存在"
// @Failure 500 {object} result.Result "服务器错误"
// @router /api/admin/UpdateUser [post]
// @Security ApiKeyAuth
func UpdateUserInfo(c *gin.Context) {
	// 1. 绑定修改参数（ID必传，其他字段可选）
	var dto model.UpdateUserInfo
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}

	// 2. 验证管理员权限
	username, exists := c.Get("username")
	if !exists {
		result.FailedWithMsg(c, result.Unauthorized, "未登录，无权限修改用户信息")
		return
	}
	admin := CheckAdmin(username.(string))
	if admin.ID <= 0 {
		result.FailedWithMsg(c, result.Forbidden, "无管理员权限，无法修改用户信息")
		return
	}

	// 3. 检查用户是否存在（通过ID查询）
	var user model.User
	if err := Db.Where("id = ?", dto.ID).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			result.FailedWithMsg(c, result.NotFound, "用户ID不存在")
			return
		}
		result.FailedWithMsg(c, result.InternalError, "修改用户信息失败")
		return
	}

	// 4. 构建动态更新数据（仅包含传入的非空/有效值）
	updateData := make(map[string]interface{})
	credentialChanged := false
	if dto.NickName != "" {
		updateData["nick_name"] = dto.NickName
	}
	if dto.Username != "" {
		updateData["username"] = dto.Username
		// 账号名实际变化时标记凭据变更，用于使该用户的历史令牌失效。
		if dto.Username != user.Username {
			credentialChanged = true
		}
	}
	if dto.Sex == 1 || dto.Sex == 2 { // 仅当传入合法性别时更新
		updateData["sex"] = dto.Sex
	}
	if dto.QQ != "" {
		updateData["qq"] = dto.QQ
	}
	if dto.Email != "" {
		updateData["email"] = dto.Email
	}
	if dto.Phone != "" {
		updateData["phone"] = dto.Phone
	}
	if dto.Money >= 0 { // 余额不能为负数
		updateData["money"] = dto.Money
	}
	if dto.Status == 1 || dto.Status == 2 { // 仅当传入合法状态时更新
		updateData["status"] = dto.Status
	}
	if roleLevel := strings.TrimSpace(dto.RoleLevel); roleLevel != "" {
		updateData["role_level"] = model.NormalizeRoleLevel(roleLevel)
	}
	if dto.Password != "" {
		hashed, err := utils.EncryptPassword(dto.Password)
		if err != nil {
			result.Failed(c, result.Unauthorized, result.HashPwdError)
			return
		}
		updateData["password"] = hashed
		// 重置密码同样视为凭据变更。
		credentialChanged = true
	}
	// 用户名或密码变更后自增令牌版本号，使该用户此前签发的全部令牌失效。
	if credentialChanged {
		updateData["token_version"] = gorm.Expr("token_version + 1")
	}

	// 5. 执行更新（如果有需要更新的字段）
	if len(updateData) > 0 {
		if err := Db.Model(&model.User{}).Where("id = ?", dto.ID).Updates(updateData).Error; err != nil {
			result.FailedWithMsg(c, result.InternalError, "修改用户信息失败")
			return
		}
	}

	// 6. 返回成功（即使没有字段更新，也返回成功，避免前端困惑）
	result.Success(c, true)
}

// DeleteUserInfo 管理员删除用户（ID必传）
// @Summary 管理员删除用户
// @Tags 用户管理接口
// @Produce json
// @Description 管理员通过用户ID删除指定用户，ID为必传
// @Param id formData uint true "用户ID（必传，精确匹配）"
// @Success 200 {object} result.Result{data=bool} "删除成功返回true"
// @Failure 400 {object} result.Result "参数错误（如ID未传）"
// @Failure 401 {object} result.Result "未登录"
// @Failure 403 {object} result.Result "无管理员权限"
// @Failure 404 {object} result.Result "用户ID不存在"
// @Failure 500 {object} result.Result "服务器错误"
// @router /api/admin/DeleteUser [put]
// @Security ApiKeyAuth
func DeleteUserInfo(c *gin.Context) {
	// 1. 绑定删除参数（ID必传）
	var dto model.DeleteUser
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}

	// 2. 验证管理员权限
	username, exists := c.Get("username")
	if !exists {
		result.FailedWithMsg(c, result.Unauthorized, "未登录，无权限删除用户")
		return
	}
	admin := CheckAdmin(username.(string))
	if admin.ID <= 0 {
		result.FailedWithMsg(c, result.Forbidden, "无管理员权限，无法删除用户")
		return
	}

	// 3. 检查用户是否存在
	var user model.User
	if err := Db.Where("id = ?", dto.ID).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			result.FailedWithMsg(c, result.NotFound, "用户ID不存在")
			return
		}
		result.FailedWithMsg(c, result.InternalError, "删除用户失败")
		return
	}

	// 4. 执行删除（物理删除，如需逻辑删除可改为更新status为特殊值，如3-已删除）
	if err := Db.Where("id = ?", dto.ID).Delete(&model.User{}).Error; err != nil {
		result.FailedWithMsg(c, result.InternalError, "删除用户失败")
		return
	}

	// 5. 返回成功
	result.Success(c, true)
}

// CreateUserInfo 管理员添加新用户
// @Summary 管理员添加新用户
// @Tags 用户管理接口
// @Produce json
// @Description 管理员创建新用户，用户名和密码为必传，其他字段可选（未传则用默认值）
// @Param nick_name query string false "昵称（可选，最大32字符）"
// @Param username query string true "账号（必传，唯一，最大32字符）"
// @Param password query string true "密码（必传，最小6字符）"
// @Param sex query int false "性别（可选，1-男/2-女）"
// @Param qq query string false "QQ（可选，最大10字符）"
// @Param email query string false "邮箱（可选，最大64字符）"
// @Param phone query string false "电话（可选，最大64字符）"
// @Param money query float64 false "余额（可选，默认0，不能为负）"
// @Param status query int false "状态（可选，默认1-正常/2-封禁）"
// @Success 200 {object} result.Result{data=model.User} "创建成功返回新用户信息（不含密码）"
// @Failure 400 {object} result.Result "参数错误（如用户名/密码未传、字段不合法）"
// @Failure 401 {object} result.Result "未登录"
// @Failure 403 {object} result.Result "无管理员权限"
// @Failure 409 {object} result.Result "用户名已存在"
// @Failure 500 {object} result.Result "服务器错误"
// @router /api/admin/CreateUser [post]
// @Security ApiKeyAuth
func CreateUserInfo(c *gin.Context) {
	// 1. 绑定添加用户参数（用户名和密码必传）
	var dto model.CreateUserDTO
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}

	// 2. 验证管理员权限
	username, exists := c.Get("username")
	if !exists {
		result.FailedWithMsg(c, result.Unauthorized, "未登录，无权限添加用户")
		return
	}
	admin := CheckAdmin(username.(string))
	if admin.ID <= 0 {
		result.FailedWithMsg(c, result.Forbidden, "无管理员权限，无法添加用户")
		return
	}

	// 3. 检查用户名是否已存在（避免重复）
	var existingUser model.User
	if err := Db.Where("username = ?", dto.Username).First(&existingUser).Error; err == nil {
		// 无错误说明查询到了用户，用户名已存在
		result.FailedWithMsg(c, result.Conflict, "用户名已存在，请更换账号")
		return
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		// 其他数据库错误（如连接失败）
		result.FailedWithMsg(c, result.InternalError, "添加用户失败")
		return
	}

	// 4. 密码加密（使用bcrypt，避免明文存储）
	hashedPassword, err := utils.EncryptPassword(dto.Password)
	if err != nil {
		result.Failed(c, result.Unauthorized, result.HashPwdError)
		return
	}

	// 5. 构建用户对象（设置默认值）
	newUser := model.User{
		NickName:   dto.NickName,
		Username:   dto.Username,
		Password:   string(hashedPassword), // 存储加密后的密码
		Sex:        dto.Sex,                // 未传则默认0（可在业务中处理为“未知”）
		QQ:         dto.QQ,
		Email:      dto.Email,
		Phone:      dto.Phone,
		Money:      dto.Money,  // 未传则默认0（模型定义中已设置default:0）
		Status:     dto.Status, // 未传则默认1（模型定义中已设置default:1）
		RoleLevel:  model.DefaultRoleLevel,
		CreateTime: utils.HTime{Time: utils.Now()}, // 手动设置创建时间（或由gorm自动处理）
	}
	// 处理状态默认值（如果DTO未传status，模型的default:1会生效，这里再兜底）
	if dto.Status == 0 {
		newUser.Status = 1
	}

	// 6. 插入数据库
	if err := Db.Create(&newUser).Error; err != nil {

		result.FailedWithMsg(c, result.InternalError, "添加用户失败")
		return
	}

	result.Success(c, true)
}
