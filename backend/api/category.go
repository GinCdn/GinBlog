package api

import (
	. "ginblog/core"
	"ginblog/model"
	"ginblog/result"
	"ginblog/utils"
	"github.com/gin-gonic/gin"
)

// CreateCategory 添加文章分类信息
// @Summary 添加文章分类信息
// @Tags 文章分类相关接口
// @Produce json
// @Description 添加文章分类信息
// @Param name formData string true "分类名"
// @Param slug formData string true "缩略名"
// @Param parent_id formData int false "父类ID"
// @Param description formData string false "分类描述"
// @Success 200 {object} result.Result{data=model.CreateCategory}
// @router /api/admin/CreateCategory [post]
// @Security ApiKeyAuth
func CreateCategory(c *gin.Context) {
	var dto model.CreateCategory
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}
	name := CheckCategoryName(dto.Name)
	if name.Cid > 0 {
		result.FailedWithMsg(c, result.InternalError, "该分类名已存在")
		return
	}
	slug := CheckCategorySlug(dto.Slug)
	if slug.Cid > 0 {
		result.FailedWithMsg(c, result.InternalError, "该缩略名已存在")
		return
	}
	category := &model.Category{
		Name:        dto.Name,
		Slug:        dto.Slug,
		Description: dto.Description,
		ParentID:    dto.ParentID,
		CreateTime:  utils.HTime{Time: utils.Now()},
		UpdateTime:  utils.HTime{Time: utils.Now()},
	}
	if err := Db.Create(category).Error; err != nil {
		result.Failed(c, result.InternalError, result.CreateDateError)
		return
	}
	result.Success(c, true)
}

// UpdateCategory 修改文章分类信息（支持部分字段更新）
// @Summary 修改文章分类信息（传入哪个字段就更新哪个字段）
// @Tags 文章分类相关接口
// @Produce json
// @Description 支持部分字段更新，仅传入需要修改的字段即可
// @Param cid formData uint true "分类ID（必须传入，用于定位分类）"
// @Param name formData string false "分类名（可选，传入则更新）"
// @Param slug formData string false "缩略名（可选，传入则更新）"
// @Param parent_id formData int false "父类ID（可选，传入则更新）"
// @Param description formData string false "分类描述（可选，传入则更新）"
// @Success 200 {object} result.Result{data=model.UpdateCategory}
// @router /api/admin/UpdateCategory [post]
// @Security ApiKeyAuth
func UpdateCategory(c *gin.Context) {
	var dto model.UpdateCategory
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}

	// 1. 校验当前分类ID是否存在，获取当前分类的ID（currentCid）
	currentCategory := CheckCategoryCid(dto.Cid)
	if currentCategory.Cid <= 0 {
		result.FailedWithMsg(c, result.NotFound, "该分类ID不存在")
		return
	}
	currentCid := currentCategory.Cid // 当前要更新的分类ID

	// 2. 检查分类名（仅当用户传入了新名称时才检查，且排除当前分类ID）
	if dto.Name != "" {
		// 调用支持排除ID的检查函数，查询是否有其他分类使用该名称
		existingName := CheckCategoryNameExcludeCid(dto.Name, currentCid)
		if existingName.Cid > 0 {
			result.FailedWithMsg(c, result.InternalError, "该分类名已存在")
			return
		}
	}

	// 3. 检查缩略名（仅当用户传入了新缩略名时才检查，且排除当前分类ID）
	if dto.Slug != "" {
		// 调用支持排除ID的检查函数，查询是否有其他分类使用该缩略名
		existingSlug := CheckCategorySlugExcludeCid(dto.Slug, currentCid)
		if existingSlug.Cid > 0 {
			result.FailedWithMsg(c, result.InternalError, "该缩略名已存在")
			return
		}
	}

	// 4. 构建更新数据并执行更新
	updateData := make(map[string]interface{})
	if dto.Name != "" {
		updateData["name"] = dto.Name
	}
	if dto.Slug != "" {
		updateData["slug"] = dto.Slug
	}
	if dto.Description != "" {
		updateData["description"] = dto.Description
	}
	if dto.ParentID >= 0 {
		updateData["parent_id"] = dto.ParentID
	}

	if len(updateData) > 0 {
		if err := Db.Model(&model.Category{}).Where("cid = ?", dto.Cid).Updates(updateData).Error; err != nil {
			result.FailedWithMsg(c, result.InternalError, "更新分类失败")
			return
		}
	}

	result.Success(c, true)
}

// 新增：支持排除指定ID的分类名检查函数
func CheckCategoryNameExcludeCid(name string, excludeCid uint) model.Category {
	var category model.Category
	// 查询条件：名称匹配 + 排除当前分类ID
	Db.Where("name = ? AND cid != ?", name, excludeCid).First(&category)
	return category
}

// 新增：支持排除指定ID的缩略名检查函数
func CheckCategorySlugExcludeCid(slug string, excludeCid uint) model.Category {
	var category model.Category
	// 查询条件：缩略名匹配 + 排除当前分类ID
	Db.Where("slug = ? AND cid != ?", slug, excludeCid).First(&category)
	return category
}

// DeleteCategory 删除文章分类信息
// @Summary 删除文章分类信息
// @Tags 文章分类相关接口
// @Produce json
// @Description 删除文章分类信息（需先删除子分类和关联文章）
// @Param cid formData uint true "分类ID"
// @Success 200 {object} result.Result{data=model.DeleteCategory}
// @router /api/admin/DeleteCategory [put]
// @Security ApiKeyAuth
func DeleteCategory(c *gin.Context) {
	var dto model.DeleteCategory
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}

	// 1. 校验分类是否存在
	var category model.Category
	if err := Db.Where("cid = ?", dto.Cid).First(&category).Error; err != nil {
		result.FailedWithMsg(c, result.NotFound, "该分类ID不存在")
		return
	}

	// 2. 校验是否有子分类（若有，禁止删除）
	var childCount int64
	Db.Model(&model.Category{}).Where("parent_id = ?", dto.Cid).Count(&childCount)
	if childCount > 0 {
		result.FailedWithMsg(c, result.BadRequest, "该分类下存在子分类，请先删除子分类")
		return
	}

	// 3. 校验是否有关联文章（若有，禁止删除）
	// 假设文章表结构体为 Article，关联字段为 CategoryID
	var articleCount int64
	Db.Model(&model.Article{}).Where("category_id = ?", dto.Cid).Count(&articleCount)
	if articleCount > 0 {
		result.FailedWithMsg(c, result.BadRequest, "该分类下存在文章，请先转移或删除文章")
		return
	}

	// 4. 执行删除
	if err := Db.Delete(&category).Error; err != nil {
		result.FailedWithMsg(c, result.InternalError, "删除失败："+err.Error())
		return
	}

	result.Success(c, true)
}

// CheckCategoryName 查询分类名
func CheckCategoryName(name string) *model.Category {
	var dto model.Category
	Db.Where("name = ?", name).First(&dto)
	return &dto
}

// CheckCategorySlug 查询缩略名
func CheckCategorySlug(slug string) *model.Category {
	var dto model.Category
	Db.Where("slug = ?", slug).First(&dto)
	return &dto
}

// CheckCategoryCid 查询分类id
func CheckCategoryCid(cid uint) *model.Category {
	var dto model.Category
	Db.Where("cid = ?", cid).First(&dto)
	return &dto
}
