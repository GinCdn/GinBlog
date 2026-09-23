package model

import (
	"ginblog/utils"
)

// Article 文章模型
type Article struct {
	ID                     uint               `gorm:"primary_key;autoIncrement;comment:文章ID" json:"id"`
	Title                  string             `gorm:"size:128;not null;comment:文章标题" json:"title"`
	Content                string             `gorm:"type:longtext;comment:文章Markdown内容" json:"content"`
	Description            string             `gorm:"size:512;comment:文章描述" json:"description"`
	CoverImage             string             `gorm:"size:512;comment:文章封面图" json:"coverImage"`
	Keywords               string             `gorm:"size:512;comment:文章SEO关键词" json:"keywords"`
	CategoryID             uint               `gorm:"not null;comment:分类ID" json:"categoryId"`
	Category               Category           `gorm:"foreignKey:CategoryID;references:Cid;comment:关联分类信息" json:"category,omitempty"` // 关联分类
	AuthorID               uint               `gorm:"not null;comment:作者ID" json:"authorId"`
	Author                 User               `gorm:"foreignKey:AuthorID;references:ID;comment:关联作者信息" json:"author,omitempty"` // 关联作者（假设有User模型）
	ViewCount              int                `gorm:"default:0;comment:浏览量" json:"viewCount"`
	CommentCount           int                `gorm:"default:0;comment:评论数" json:"commentCount"`
	LikeCount              int                `gorm:"default:0;comment:点赞数" json:"likeCount"`
	FavoriteCount          int                `gorm:"-" json:"favoriteCount"`
	IsPublished            bool               `gorm:"not null;comment:是否发布（true=已发布,false=草稿）" json:"isPublished"`
	CreateTime             utils.HTime        `gorm:"comment:创建时间" json:"createTime"`
	UpdateTime             utils.HTime        `gorm:"comment:更新时间;autoUpdateTime" json:"updateTime"`
	Tags                   []Tag              `gorm:"many2many:ginblog_article_tag;foreignKey:ID;joinForeignKey:ArticleID;references:ID;joinReferences:TagID" json:"tags,omitempty"`
	AccessType             string             `gorm:"size:16;default:public;comment:文章访问方式 public/paid/comment/hidden" json:"accessType"`
	Price                  float64            `gorm:"default:0;comment:文章价格" json:"price"`
	RoleDiscount           bool               `gorm:"default:false;comment:是否启用用户等级折扣" json:"roleDiscount"`
	RebateRate             float64            `gorm:"default:0;comment:推广返佣比例" json:"rebateRate"`
	IsUnlocked             bool               `gorm:"-" json:"isUnlocked,omitempty"`
	PayablePrice           float64            `gorm:"-" json:"payablePrice,omitempty"`
	DiscountRate           float64            `gorm:"-" json:"discountRate,omitempty"`
	UnlockReason           string             `gorm:"-" json:"unlockReason,omitempty"`
	HasProtectedContent    bool               `gorm:"-" json:"hasProtectedContent,omitempty"`
	HasPaidContent         bool               `gorm:"-" json:"hasPaidContent,omitempty"`
	HasCommentContent      bool               `gorm:"-" json:"hasCommentContent,omitempty"`
	PaidContentUnlocked    bool               `gorm:"-" json:"paidContentUnlocked,omitempty"`
	CommentContentUnlocked bool               `gorm:"-" json:"commentContentUnlocked,omitempty"`
	Liked                  bool               `gorm:"-" json:"liked,omitempty"`
	Favorited              bool               `gorm:"-" json:"favorited,omitempty"`
	Previous               *ArticleNavigation `gorm:"-" json:"previous,omitempty"`
	Next                   *ArticleNavigation `gorm:"-" json:"next,omitempty"`
}

// ArticleNavigation 同分类文章导航信息。
type ArticleNavigation struct {
	ID    uint   `json:"id"`
	Title string `json:"title"`
}

// TableName 自定义表名
func (Article) TableName() string {
	return "ginblog_article"
}

// CreateArticle 文章新增模型
type CreateArticle struct {
	Title          string   `form:"title" json:"title" binding:"required"`
	Content        string   `form:"content" json:"content" binding:"required"`
	Description    string   `form:"description" json:"description" binding:"required"`
	CoverImage     string   `form:"cover_image" json:"coverImage"`
	Keywords       string   `form:"keywords" json:"keywords"`
	CategoryID     uint     `form:"category_id" json:"category_id" binding:"required"`
	IsPublished    bool     `form:"is_published" json:"is_published" binding:"omitempty,boolean"`
	SelectedTagIDs []uint   `form:"selected_tag_ids" json:"selectedTagIDs" binding:"omitempty"` // 选择的管理员标签ID（可选）
	CustomTags     []string `form:"custom_tags" json:"customTags" binding:"omitempty"`          // 自定义标签名（可选）
	AccessType     string   `form:"access_type" json:"accessType" binding:"omitempty"`
	Price          float64  `form:"price" json:"price" binding:"omitempty,min=0"`
	RoleDiscount   bool     `form:"role_discount" json:"roleDiscount" binding:"omitempty,boolean"`
	RebateRate     float64  `form:"rebate_rate" json:"rebateRate" binding:"omitempty,min=0,max=100"`
}

// UpdateArticle 文章更新模型
type UpdateArticle struct {
	ID             uint     `form:"id" json:"id" binding:"required"`
	Title          string   `form:"title" json:"title"`
	Content        string   `form:"content" json:"content"`
	Description    string   `form:"description" json:"description"`
	CoverImage     string   `form:"cover_image" json:"coverImage"`
	Keywords       string   `form:"keywords" json:"keywords"`
	CategoryID     uint     `form:"category_id" json:"category_id"`
	IsPublished    bool     `form:"is_published" json:"is_published" binding:"omitempty,boolean"`
	SelectedTagIDs []uint   `form:"selected_tag_ids" json:"selectedTagIDs" binding:"omitempty"` // 新增：更新后的管理员标签
	CustomTags     []string `form:"custom_tags" json:"customTags" binding:"omitempty"`          // 新增：更新后的自定义标签
	AccessType     string   `form:"access_type" json:"accessType" binding:"omitempty"`
	Price          float64  `form:"price" json:"price" binding:"omitempty,min=0"`
	RoleDiscount   bool     `form:"role_discount" json:"roleDiscount" binding:"omitempty,boolean"`
	RebateRate     float64  `form:"rebate_rate" json:"rebateRate" binding:"omitempty,min=0,max=100"`
}

type GetArticleList struct {
	Page        int    `form:"page" json:"page"`
	PageSize    int    `form:"page_size" json:"page_size"`
	ID          uint   `form:"id" json:"id"`
	Title       string `form:"title" json:"title"`
	CategoryID  uint   `form:"category_id" json:"category_id"`
	IsPublished bool   `form:"is_published" json:"is_published"`
}

// DeleteArticle 文章删除模型
type DeleteArticle struct {
	ID uint `form:"id" json:"id" binding:"required"`
}

// ArticleSearch 搜索模型
type ArticleSearch struct {
	Page        int      `form:"page" json:"page" binding:"omitempty,min=1"`                   // 页码（默认1）
	PageSize    int      `form:"page_size" json:"page_size" binding:"omitempty,min=1,max=100"` // 每页条数（默认20，最大100）
	Keyword     string   `form:"keyword" json:"keyword" binding:"omitempty"`                   // 单搜索框关键词（核心新增）
	ID          uint     `form:"id" json:"id" binding:"omitempty,min=1"`                       // 文章ID（精确搜索）
	Title       string   `form:"title" json:"title"`                                           // 文章标题（模糊搜索）
	Content     string   `form:"content" json:"content"`                                       // 文章内容（模糊搜索）
	Description string   `form:"description" json:"description"`                               // 文章描述（模糊搜索）
	TagNames    []string `form:"tag_names" json:"tag_names" binding:"omitempty"`               // 标签名列表（多标签精确匹配，逗号分隔）
}

// PageResponse 通用分页数据结构体
type PageResponse struct {
	List      []Article `json:"list" comment:"文章列表（含分类、作者、标签关联信息）"`
	Total     int64     `json:"total" comment:"符合条件的文章总条数"`
	Page      int       `json:"page" comment:"当前页码"`
	PageSize  int       `json:"page_size" comment:"每页显示的文章条数"`
	TotalPage int       `json:"total_page" comment:"总页数（向上取整）"`
}
