package api

import (
	. "ginblog/core"
	"ginblog/model"
	"ginblog/result"
	"ginblog/utils"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"strconv"
	"strings"
)

// CreateTag 创建标签名
// @Summary 创建标签名
// @Tags 标签相关接口
// @Produce json
// @Description 创建标签名（管理员和用户均可创建，自动区分创建者类型）
// @Param name formData string true "标签名"
// @Success 200 {object} result.Result{data=bool} "创建成功返回标签信息"
// @Failure 400 {object} result.Result "参数错误"
// @Failure 401 {object} result.Result "未授权"
// @Failure 500 {object} result.Result "服务器错误"
// @router /api/admin/CreateTag [post]
// @router /api/user/CreateTag [post]
// @Security ApiKeyAuth
func CreateTag(c *gin.Context) {
	var dto model.CreateTag
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}
	// 关键步骤：调用 HTML 净化工具，处理用户输入的 HTML 内容
	// 1. 获取全局净化工具实例
	sanitizer := utils.GetSanitizer()
	// 2. 净化文章内容（核心，防止 XSS）
	dto.Name = sanitizer.Sanitize(dto.Name)

	// 1. 检查标签名是否已存在
	name := CheckTagName(dto.Name)
	if name.ID > 0 {
		result.FailedWithMsg(c, result.Conflict, "该标签名已存在") // 用409冲突更合理
		return
	}

	// 2. 获取当前用户信息，区分创建者类型
	username, exists := c.Get("username")
	if !exists {
		result.Failed(c, result.InternalError, result.UserDataError)
		return
	}

	// 3. 区分管理员/普通用户，记录创建者信息
	var creatorType string
	var creatorID uint

	isAdminPath := strings.Contains(c.Request.URL.Path, "/api/admin/CreateTag")
	if isAdminPath {
		// 管理员创建
		admin := CheckAdmin(username.(string))
		if admin.ID <= 0 {
			result.Failed(c, result.NotFound, result.SubUserNotFound)
			return
		}
		creatorType = "admin"
		creatorID = admin.ID
	} else {
		// 普通用户创建
		user := CheckUsername(username.(string))
		if user.ID <= 0 {
			result.Failed(c, result.NotFound, result.SubUserNotFound)
			return
		}
		creatorType = "user"
		creatorID = user.ID
	}

	// 4. 创建标签（包含创建者信息）
	tag := model.Tag{
		Name:        dto.Name,
		CreatorType: creatorType,
		CreatorID:   creatorID,
		CreateTime:  utils.HTime{Time: utils.Now()},
		UpdateTime:  utils.HTime{Time: utils.Now()},
	}
	if err := Db.Create(&tag).Error; err != nil {
		result.Failed(c, result.InternalError, result.CreateDateError)
		return
	}

	// 5. 返回完整标签信息（包含创建者信息）
	result.Success(c, true)
}

// UpdateTag 修改标签名
// @Summary 修改标签名
// @Tags 标签相关接口
// @Produce json
// @Description 修改标签名（管理员可修改所有标签，用户仅可修改自己创建的标签）
// @Param id formData uint true "标签ID"
// @Param name formData string true "新标签名"
// @Success 200 {object} result.Result{data=bool} "修改成功返回标签信息"
// @Failure 400 {object} result.Result "参数错误或标签名已存在"
// @Failure 500 {object} result.Result "服务器错误"
// @router /api/admin/UpdateTag [post]
// @router /api/user/UpdateTag [post]
// @Security ApiKeyAuth
func UpdateTag(c *gin.Context) {
	var dto model.UpdateTag
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}

	// 1. 验证用户登录状态
	username, exists := c.Get("username")
	if !exists {
		result.Failed(c, result.InternalError, result.UserDataError)
		return
	}

	// 2. 检查标签是否存在
	tag := CheckTagId(dto.ID) // 需实现根据ID查询标签的函数
	if tag.ID <= 0 {
		result.FailedWithMsg(c, result.NotFound, "标签不存在")
		return
	}

	// 3. 检查新标签名是否已被占用（排除当前标签）
	existingTag := CheckTagName(dto.Name)
	if existingTag.ID > 0 && existingTag.ID != dto.ID {
		result.FailedWithMsg(c, result.BadRequest, "该标签名已存在")
		return
	}

	// 4. 权限校验：管理员可修改所有标签，用户仅能修改自己创建的标签
	isAdminPath := strings.Contains(c.Request.URL.Path, "/api/admin/UpdateTag")
	if isAdminPath {
		// 管理员路由：验证是否为管理员
		admin := CheckAdmin(username.(string))
		if admin.ID <= 0 {
			result.Failed(c, result.NotFound, result.SubUserNotFound)
			return
		}
	} else {
		// 普通用户路由：验证是否为标签的创建者
		user := CheckUsername(username.(string))
		if user.ID <= 0 {
			result.Failed(c, result.NotFound, result.SubUserNotFound)
			return
		}
		// 检查标签是否为当前用户创建（CreatorType为user且CreatorID匹配）
		if tag.CreatorType != "user" || tag.CreatorID != user.ID {
			result.Failed(c, result.Forbidden, "无权限修改该标签")
			return
		}
	}

	// 5. 执行修改
	tag.Name = dto.Name
	tag.UpdateTime = utils.HTime{Time: utils.Now()} // 更新时间
	if err := Db.Save(&tag).Error; err != nil {
		result.Failed(c, result.ServiceUnavail, result.UpdateError)
		return
	}

	// 6. 返回修改后的标签信息
	result.Success(c, true)
}

// DeleteTag 根据ID删除指定标签
// @Summary 根据ID删除指定标签
// @Tags 标签相关接口
// @Produce json
// @Description 根据ID删除指定标签（管理员可删除所有标签，用户仅可删除自己创建的标签）
// @Param id formData uint true "标签ID"
// @Success 200 {object} result.Result{data=bool} "删除成功返回true"
// @Failure 400 {object} result.Result "参数错误"
// @Failure 401 {object} result.Result "未授权"
// @Failure 403 {object} result.Result "无权限删除该标签"
// @Failure 404 {object} result.Result "标签或用户不存在"
// @Failure 500 {object} result.Result "服务器错误"
// @router /api/admin/DeleteTag [put]
// @router /api/user/DeleteTag [put]
// @Security ApiKeyAuth
func DeleteTag(c *gin.Context) {
	var dto model.DeleteTag
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}

	// 1. 验证用户登录状态
	username, exists := c.Get("username")
	if !exists {
		result.Failed(c, result.InternalError, result.UserDataError)
		return
	}

	// 2. 检查标签是否存在
	tag := CheckTagId(dto.ID)
	if tag.ID <= 0 {
		result.FailedWithMsg(c, result.NotFound, "标签不存在")
		return
	}

	// 3. 权限校验：管理员可删除所有标签，用户仅能删除自己创建的标签
	isAdminPath := strings.Contains(c.Request.URL.Path, "/api/admin/DeleteTag")
	if isAdminPath {
		// 管理员路由：验证是否为管理员
		admin := CheckAdmin(username.(string))
		if admin.ID <= 0 {
			result.Failed(c, result.NotFound, result.SubUserNotFound)
			return
		}
	} else {
		// 普通用户路由：验证是否为标签的创建者
		user := CheckUsername(username.(string))
		if user.ID <= 0 {
			result.Failed(c, result.NotFound, result.SubUserNotFound)
			return
		}
		// 检查标签是否为当前用户创建
		if tag.CreatorType != "user" || tag.CreatorID != user.ID {
			result.Failed(c, result.Forbidden, "无权限删除该标签")
			return
		}
	}

	// 4. 事务：删除标签 + 解除与所有文章的关联（避免残留脏数据）
	err := Db.Transaction(func(tx *gorm.DB) error {
		// 先解除标签与文章的关联
		if err := tx.Where("tag_id = ?", dto.ID).Delete(&model.ArticleTag{}).Error; err != nil {
			return err
		}
		// 再删除标签本身
		return tx.Delete(&model.Tag{}, dto.ID).Error
	})
	if err != nil {
		result.Failed(c, result.InternalError, result.DeleteError)
		return
	}

	// 5. 返回删除成功
	result.Success(c, true)
}

// GetTagList 分页获取标签列表
// @Summary 分页获取标签列表
// @Tags 标签相关接口
// @Produce json
// @Description 分页获取标签列表（管理员看所有，用户仅看管理员预留标签）
// @Param page query int false "页码（默认1）"
// @Param page_size query int false "每页条数（可选20/50/100，默认20）"
// @Param order query string false "排序方式（create_time_desc-降序，create_time_asc-升序，默认降序）"
// @Success 200 {object} result.Result{data=model.TagListResponse} "分页标签列表"
// @Failure 400 {object} result.Result "参数错误"
// @Failure 401 {object} result.Result "未授权"
// @Failure 500 {object} result.Result "服务器错误"
// @router /api/admin/GetTagList [get]
// @router /api/user/GetTagList [get]
// @Security ApiKeyAuth
func GetTagList(c *gin.Context) {
	// 1. 解析分页参数（保持不变）
	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil || page < 1 {
		result.FailedWithMsg(c, result.BadRequest, "页码必须为正整数")
		return
	}

	pageSize, err := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if err != nil {
		result.FailedWithMsg(c, result.BadRequest, "每页条数格式错误")
		return
	}
	allowedSizes := map[int]bool{20: true, 50: true, 100: true}
	if !allowedSizes[pageSize] {
		result.FailedWithMsg(c, result.BadRequest, "每页条数仅支持20/50/100")
		return
	}

	order := c.DefaultQuery("order", "create_time_desc")
	var orderStr string
	switch order {
	case "create_time_desc":
		orderStr = "create_time DESC"
	case "create_time_asc":
		orderStr = "create_time ASC"
	default:
		result.FailedWithMsg(c, result.BadRequest, "排序方式仅支持create_time_desc/create_time_asc")
		return
	}

	// 2. 验证用户并区分权限
	username, exists := c.Get("username")
	if !exists {
		result.Failed(c, result.InternalError, result.UserDataError)
		return
	}

	isAdminPath := strings.Contains(c.Request.URL.Path, "/api/admin/GetTagList")
	var dbQuery *gorm.DB = Db.Model(&model.Tag{}) // 基础查询对象

	if isAdminPath {
		// 管理员：验证身份，查询所有标签（保持不变）
		admin := CheckAdmin(username.(string))
		if admin.ID <= 0 {
			result.Failed(c, result.NotFound, result.SubUserNotFound)
			return
		}
		// 管理员无过滤条件，查询全部
	} else {
		// 普通用户：仅查询「管理员预留标签」（核心调整）
		user := CheckUsername(username.(string))
		if user.ID <= 0 {
			result.Failed(c, result.NotFound, result.SubUserNotFound)
			return
		}
		// 仅筛选管理员创建的标签（假设管理员创建的标签 creator_type = "admin"）
		dbQuery = dbQuery.Where("creator_type = ?", "admin")
	}

	// 3. 分页查询（基于权限过滤后的查询对象）
	var tags []model.Tag
	var total int64

	// 先查总数
	if err := dbQuery.Count(&total).Error; err != nil {
		result.Failed(c, result.InternalError, result.InfoDateError)
		return
	}

	// 再查当前页数据
	offset := (page - 1) * pageSize
	if err := dbQuery.Order(orderStr).Offset(offset).Limit(pageSize).Find(&tags).Error; err != nil {
		result.Failed(c, result.InternalError, result.InfoDateError)
		return
	}

	// 4. 构造响应（保持不变）
	response := model.TagListResponse{
		List:       tags,
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: (total + int64(pageSize) - 1) / int64(pageSize),
	}

	result.Success(c, response)
}

func CheckTagName(name string) *model.Tag {
	var dto model.Tag
	Db.Where("name = ?", name).First(&dto)
	return &dto
}
func CheckTagId(id uint) *model.Tag {
	var dto model.Tag
	Db.Where("id = ?", id).First(&dto)
	return &dto
}
