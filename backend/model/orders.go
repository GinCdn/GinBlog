package model

import (
	"ginblog/utils"
)

// RechargeOrder 充值订单模型
type RechargeOrder struct {
	ID           uint         `gorm:"primaryKey;autoIncrement" json:"id"`
	Username     string       `gorm:"size:32;index;comment:用户账号" json:"username"`
	UserID       uint         `gorm:"index;comment:用户ID" json:"user_id"`
	TradeNo      string       `gorm:"size:64;uniqueIndex;comment:平台订单号" json:"trade_no"`
	ThirdTradeNo string       `gorm:"size:64;comment:第三方支付单号" json:"third_trade_no"`
	Amount       float64      `gorm:"default:0;comment:充值金额" json:"amount"`
	PayType      string       `gorm:"size:32;comment:支付渠道 alipay wxpay" json:"pay_type"`
	PayMethod    string       `gorm:"size:32;comment:支付方式 official epay" json:"pay_method"`
	Status       bool         `gorm:"default:false;comment:是否支付成功" json:"status"`
	Remark       string       `gorm:"size:255;comment:备注" json:"remark"`
	PayURL       string       `gorm:"size:1024" json:"-"`
	CreateTime   utils.HTime  `gorm:"comment:创建时间" json:"create_time"`
	PayTime      *utils.HTime `gorm:"comment:支付时间" json:"pay_time"`
}

// TableName 指定充值订单表名
func (RechargeOrder) TableName() string { return "ginblog_user_recharge_order" }

// PayOrder 支付流水订单模型
type PayOrder struct {
	ID         uint         `gorm:"primaryKey;autoIncrement" json:"id"`
	TradeNo    string       `gorm:"size:64;uniqueIndex;comment:平台订单号" json:"trade_no"`
	Type       string       `gorm:"size:32;default:recharge;comment:业务类型" json:"type"`
	Name       string       `gorm:"size:128;comment:订单名称" json:"name"`
	Money      float64      `gorm:"default:0;comment:支付金额" json:"money"`
	Username   string       `gorm:"size:32;index;comment:用户账号" json:"username"`
	Status     bool         `gorm:"default:false;comment:是否支付成功" json:"status"`
	PayType    string       `gorm:"size:32;comment:支付渠道" json:"pay_type"`
	CreateTime utils.HTime  `gorm:"comment:创建时间" json:"create_time"`
	PayTime    *utils.HTime `gorm:"comment:支付时间" json:"pay_time"`
}

// TableName 指定支付流水表名
func (PayOrder) TableName() string { return "ginblog_pay_order" }

// OrderPageResponse 订单分页通用结构
type OrderPageResponse[T any] struct {
	List     []T   `json:"list"`
	Total    int64 `json:"total"`
	Page     int   `json:"page"`
	PageSize int   `json:"page_size"`
}
