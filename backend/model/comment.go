package model

import (
	"encoding/json"
	"ginblog/utils"
)

// Comment 评论模型
type Comment struct {
	ID         uint            `gorm:"primary_key;autoIncrement;comment:ID" json:"id"`
	ArticleID  uint            `gorm:"comment:文章ID" json:"article_id"`
	Content    string          `gorm:"size:128;comment:评论内容" json:"content"`
	UserID     uint            `gorm:"default:0;comment:评论者ID(0为游客)" json:"user_id"`
	NickName   string          `gorm:"size:32;comment:评论者昵称" json:"nickName"`
	QQ         string          `gorm:"-" json:"qq"` // 评论者绑定的QQ，仅用于生成头像，不写入评论表。
	Email      string          `gorm:"size:64;comment:评论者邮箱" json:"email"`
	ParentID   int             `gorm:"default:0;comment:父评论ID" json:"parentId"`
	IsAuthor   bool            `gorm:"default:0;comment:是否作者回复(0否/1是)" json:"is_author"`
	Status     int8            `gorm:"default:0;comment:状态(0待审核/1已通过/2已拒绝/3垃圾评论)" json:"status"`
	IP         string          `gorm:"size:32;comment:评论者ip" json:"ip"`
	UserAgent  string          `gorm:"size:512;comment:评论者设备信息" json:"user_agent"`
	Meta       json.RawMessage `gorm:"type:json;comment:扩展元数据(点赞数、举报状态等)" json:"meta"`
	LikeCount  int             `gorm:"default:0;comment:点赞数" json:"likeCount"`
	Liked      bool            `gorm:"-" json:"liked,omitempty"`
	CreateTime utils.HTime     `gorm:"comment:创建时间" json:"createTime"`
	UpdateTime utils.HTime     `gorm:"comment:更新时间;autoUpdateTime" json:"updateTime"`
	// 关联字段（可选，用于查询时关联文章/用户）
	Article Article `gorm:"foreignKey:ID" json:"-"` // 关联文章（忽略JSON序列化）
	User    User    `gorm:"foreignKey:ID" json:"-"` // 关联用户（忽略JSON序列化）
}

func (Comment) TableName() string {
	return "ginblog_comment"
}

type CreateComment struct {
	ArticleID uint   `form:"article_id" json:"article_id" binding:"required"` // 必传，文章ID
	Content   string `form:"content" json:"content" binding:"required"`       // 必传，评论内容
	NickName  string `form:"nick_name" json:"nick_name"`                      // 游客必填，登录用户可选（无binding，业务逻辑中校验）
	Email     string `form:"email" json:"email" binding:"omitempty,email"`    // 关键：omitempty允许不传递（登录用户），传递时校验格式
	ParentID  int    `form:"parent_id" json:"parent_id"`                      // 可选，父评论ID
}

type DeleteComment struct {
	ID uint `form:"id" json:"id" binding:"required"`
}

type GetCommentDTO struct {
	Page      int    `form:"page" json:"page" binding:"omitempty,min=1"`                     // 页码（默认1，最小1）
	PageSize  int    `form:"page_size" json:"page_size" binding:"omitempty,oneof=20 50 100"` // 每页条数（仅支持20/50/100，默认20）
	ArticleID uint   `form:"article_id" json:"article_id" binding:"omitempty,min=1"`         // 筛选：文章ID（精确匹配）
	Content   string `form:"content" json:"content" binding:"omitempty,max=128"`             // 筛选：评论内容（模糊匹配）
	Status    *int8  `form:"status" json:"status" binding:"omitempty,oneof=0 1 2 3"`         // 筛选：评论状态（指针类型，nil=未传；0=待审核/1=已通过）
	ParentID  *int   `form:"parent_id" json:"parent_id" binding:"omitempty,min=0"`           // 筛选：父评论ID（指针类型，nil=未传；0=一级评论）
}

type UpdateComment struct {
	ID     uint `form:"id" json:"id" binding:"required"`
	Status int8 `form:"status" json:"status" binding:"omitempty,oneof=1 2 3"`
}
