package model

import "ginblog/utils"

// ArticleFavorite 记录用户对文章的收藏状态。
type ArticleFavorite struct {
	ID         uint        `gorm:"primaryKey" json:"id"`
	ArticleID  uint        `gorm:"uniqueIndex:uk_article_favorite_user;not null;comment:文章ID" json:"article_id"`
	UserID     uint        `gorm:"uniqueIndex:uk_article_favorite_user;not null;comment:用户ID" json:"user_id"`
	CreateTime utils.HTime `gorm:"comment:创建时间" json:"createTime"`
}

// TableName 返回文章收藏记录表名。
func (ArticleFavorite) TableName() string { return "ginblog_article_favorite" }
