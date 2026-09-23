package model

import (
	"ginblog/utils"
)

// Category 文章分类模型
type Category struct {
	Cid         uint        `gorm:"primary_key;autoIncrement;comment:分类ID" json:"cid"`
	Name        string      `gorm:"size:32;uniqueIndex:idx_category_name;comment:分类名" json:"name"`
	Slug        string      `gorm:"size:32;uniqueIndex:idx_category_slug;comment:缩略名" json:"slug"`
	ParentID    int         `gorm:"default:0;comment:父分类ID" json:"parentId,omitempty"` // 支持多级分类
	Count       int         `gorm:"default:0;comment:文章数量" json:"count"`
	Description string      `gorm:"size:255;comment:分类描述" json:"description"`
	CreateTime  utils.HTime `gorm:"comment:创建时间" json:"createTime"`
	UpdateTime  utils.HTime `gorm:"comment:更新时间;autoUpdateTime" json:"updateTime"`
}

func (Category) TableName() string {
	return "ginblog_category"
}

// CreateCategory 文章分类添加模型
type CreateCategory struct {
	Name        string `form:"name" json:"name" binding:"required"`
	Slug        string `form:"slug" json:"slug" binding:"required"`
	ParentID    int    `form:"parent_id" json:"parent_id"`
	Description string `form:"description" json:"description"`
}

// UpdateCategory 文章分类修改模型
type UpdateCategory struct {
	Cid         uint   `form:"cid" json:"cid" binding:"required"`
	Name        string `form:"name" json:"name"`
	Slug        string `form:"slug" json:"slug"`
	Description string `form:"description" json:"description"`
	ParentID    int    `form:"parent_id" json:"parent_id"`
}

// DeleteCategory 文章分类删除模型
type DeleteCategory struct {
	Cid uint `form:"cid" json:"cid" binding:"required"`
}

// CategoryTree 树形结构的分类
type CategoryTree struct {
	Cid         uint           `json:"cid"`
	Name        string         `json:"name"`
	Slug        string         `json:"slug"`
	ParentID    int            `json:"parentId"`
	Count       int            `json:"count"`
	Description string         `json:"description"`
	Children    []CategoryTree `json:"children"` // 子分类列表
}
