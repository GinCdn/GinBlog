package api

import (
	"ginblog/controller"
	. "ginblog/core"
	"ginblog/model"
	"ginblog/result"

	"github.com/gin-gonic/gin"
)

// categoryArticleCount 分类下已发布文章数量。
type categoryArticleCount struct {
	CategoryID uint
	Count      int
}

// GetCategoryChildrenInfo 获取分类及子分类。
// @Summary 获取分类及子分类
// @Tags 文章分类相关接口
// @Produce json
// @Description 获取分类及子分类及每个分类下的已发布文章数量
// @Success 200 {object} result.Result
// @router /api/admin/GetCategoryChildrenInfo [get]
// @router /api/user/GetCategoryChildrenInfo [get]
// @Security ApiKeyAuth
// @router /api/GetCategoryChildrenInfo [get]
func GetCategoryChildrenInfo(c *gin.Context) {
	var categories []model.Category
	if err := Db.Find(&categories).Error; err != nil {
		result.Failed(c, result.InternalError, result.InfoDateError)
		return
	}

	// 前台分类数量只统计已发布文章，避免草稿和历史冗余计数影响展示。
	var counts []categoryArticleCount
	if err := Db.Model(&model.Article{}).
		Select("category_id, COUNT(*) AS count").
		Where("is_published = ?", true).
		Group("category_id").
		Scan(&counts).Error; err != nil {
		result.Failed(c, result.InternalError, result.InfoDateError)
		return
	}
	countByCategoryID := make(map[uint]int, len(counts))
	for _, item := range counts {
		countByCategoryID[item.CategoryID] = item.Count
	}
	for index := range categories {
		category := categories[index]
		if category.ParentID == 0 {
			// 父分类需累加所有子孙分类的文章数，与前台展示口径保持一致。
			categories[index].Count = 0
			for _, descendantID := range collectCategoryDescendantIDs(category.Cid, categories) {
				categories[index].Count += countByCategoryID[descendantID]
			}
			continue
		}
		// 子分类直接使用自身的已发布文章数量。
		categories[index].Count = countByCategoryID[category.Cid]
	}

	// 转成树形结构。
	tree := controller.MakeCategoryTree(categories)
	result.Success(c, tree)
}
