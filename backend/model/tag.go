package model

import "ginblog/utils"

type Tag struct {
	ID          uint        `gorm:"primary_key;autoIncrement;comment:标签ID" json:"id"`
	Name        string      `gorm:"size:32;uniqueIndex;not null;comment:标签名" json:"name"`
	CreatorType string      `gorm:"size:10;not null;default:'user';comment:创建者类型(admin/user)" json:"creator_type"` // 新增字段
	CreatorID   uint        `gorm:"comment:创建者ID(关联管理员/用户表)" json:"creator_id"`                                    // 新增字段
	CreateTime  utils.HTime `gorm:"comment:创建时间" json:"createTime"`
	UpdateTime  utils.HTime `gorm:"comment:更新时间;autoUpdateTime" json:"updateTime"`
}

func (Tag) TableName() string {
	return "ginblog_tag"
}

type CreateTag struct {
	Name string `form:"name" json:"name" binding:"required"`
}

type UpdateTag struct {
	ID   uint   `form:"id" json:"id" binding:"required"`
	Name string `form:"name" json:"name" binding:"required"`
}
type DeleteTag struct {
	ID uint `form:"id" json:"id" binding:"required"`
}

type ArticleTag struct {
	ArticleID  uint        `gorm:"primaryKey;references:model.Article.ID;comment:文章ID" json:"article_id"` // 关联文章表的ID
	TagID      uint        `gorm:"primaryKey;references:model.Tag.ID;comment:标签ID" json:"tag_id"`         // 关联标签表的ID
	CreateTime utils.HTime `gorm:"comment:创建时间" json:"createTime"`
	UpdateTime utils.HTime `gorm:"comment:更新时间;autoUpdateTime" json:"updateTime"`
}

func (ArticleTag) TableName() string {
	return "ginblog_article_tag"
}

// TagListResponse 标签分页列表响应结构体
type TagListResponse struct {
	List       []Tag `json:"list"`        // 当前页的标签列表
	Total      int64 `json:"total"`       // 符合条件的标签总条数
	Page       int   `json:"page"`        // 当前页码（与请求参数一致）
	PageSize   int   `json:"page_size"`   // 每页条数（与请求参数一致）
	TotalPages int64 `json:"total_pages"` // 总页数（自动计算）
}
