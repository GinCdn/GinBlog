package model

import "ginblog/utils"

// ArticlePurchase 文章付费解锁记录，记录用户实际支付金额和折扣。
type ArticlePurchase struct {
	ID            uint         `gorm:"primaryKey;autoIncrement" json:"id"`
	ArticleID     uint         `gorm:"uniqueIndex:uk_article_user;not null;index;comment:文章ID" json:"articleId"`
	UserID        uint         `gorm:"uniqueIndex:uk_article_user;not null;index;comment:用户ID" json:"userId"`
	TradeNo       string       `gorm:"size:64;uniqueIndex;not null;comment:支付流水号" json:"tradeNo"`
	Amount        float64      `gorm:"default:0;comment:实际支付金额" json:"amount"`
	OriginalPrice float64      `gorm:"default:0;comment:原始价格" json:"originalPrice"`
	DiscountRate  float64      `gorm:"default:100;comment:用户等级折扣百分比" json:"discountRate"`
	Status        bool         `gorm:"default:true;comment:是否已解锁" json:"status"`
	CreateTime    utils.HTime  `gorm:"comment:创建时间" json:"createTime"`
	PayTime       *utils.HTime `gorm:"comment:支付时间" json:"payTime"`
}

// TableName 指定文章购买记录表名。
func (ArticlePurchase) TableName() string { return "ginblog_article_purchase" }
