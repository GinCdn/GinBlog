package model

import "ginblog/utils"

// ArticleLike 记录用户对文章的点赞状态。
type ArticleLike struct {
	ID         uint        `gorm:"primaryKey" json:"id"`
	ArticleID  uint        `gorm:"uniqueIndex:uk_article_user;not null;comment:文章ID" json:"article_id"`
	UserID     uint        `gorm:"uniqueIndex:uk_article_user;not null;comment:用户ID" json:"user_id"`
	CreateTime utils.HTime `gorm:"comment:创建时间" json:"createTime"`
}

// TableName 返回文章点赞记录表名。
func (ArticleLike) TableName() string { return "ginblog_article_like" }

// CommentLike 记录用户对评论的点赞状态。
type CommentLike struct {
	ID         uint        `gorm:"primaryKey" json:"id"`
	CommentID  uint        `gorm:"uniqueIndex:uk_comment_user;not null;comment:评论ID" json:"comment_id"`
	UserID     uint        `gorm:"uniqueIndex:uk_comment_user;not null;comment:用户ID" json:"user_id"`
	CreateTime utils.HTime `gorm:"comment:创建时间" json:"createTime"`
}

// TableName 返回评论点赞记录表名。
func (CommentLike) TableName() string { return "ginblog_comment_like" }
