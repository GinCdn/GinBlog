package model

import "ginblog/utils"

// CarouselConfig 表示首页单个轮播图配置，固定支持一至六个展示位。
type CarouselConfig struct {
	ID         uint        `gorm:"primaryKey;autoIncrement:false" json:"id"`
	Image      string      `gorm:"size:500;not null;comment:轮播图片地址" json:"image"`
	Link       string      `gorm:"size:500;comment:轮播跳转地址" json:"link"`
	Sort       int         `gorm:"default:0;comment:展示顺序" json:"sort"`
	Status     bool        `gorm:"default:true;comment:是否启用" json:"status"`
	CreateTime utils.HTime `gorm:"comment:创建时间" json:"createTime"`
	UpdateTime utils.HTime `gorm:"comment:更新时间;autoUpdateTime" json:"updateTime"`
}

// TableName 指定首页轮播图配置表名。
func (CarouselConfig) TableName() string { return "ginblog_carousel_config" }

// UpdateCarouselConfig 管理端更新单个轮播图配置。
type UpdateCarouselConfig struct {
	ID     uint   `form:"id" json:"id" binding:"required,min=1,max=6"`
	Image  string `form:"image" json:"image"`
	Link   string `form:"link" json:"link"`
	Sort   int    `form:"sort" json:"sort"`
	Status *bool  `form:"status" json:"status"`
}
