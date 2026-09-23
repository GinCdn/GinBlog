package model

import (
	"ginblog/utils"

	"gorm.io/gorm"
)

// PromotionConfig 推广返佣全局配置，固定读取 ID 为 1 的单行记录
type PromotionConfig struct {
	ID                   int         `gorm:"primaryKey;autoIncrement:false;default:1" json:"id"`
	RequireRealName      bool        `gorm:"default:false;comment:申请推广是否要求实名" json:"require_real_name"`
	MinWithdrawal        float64     `gorm:"default:10;comment:最低提现金额" json:"min_withdrawal"`
	CommissionSettleDays int         `gorm:"default:7;comment:佣金结算天数" json:"commission_settle_days"`
	Status               bool        `gorm:"default:false;comment:是否开启推广" json:"status"`
	CreateTime           utils.HTime `gorm:"comment:创建时间" json:"create_time"`
	UpdateTime           utils.HTime `gorm:"comment:更新时间;autoUpdateTime" json:"update_time"`
}

// TableName 指定推广配置表名
func (PromotionConfig) TableName() string { return "ginblog_promotion_config" }

// GetOrCreatePromotionConfig 获取推广配置，不存在时创建默认配置
func GetOrCreatePromotionConfig(db *gorm.DB) (*PromotionConfig, error) {
	var config PromotionConfig
	if err := db.First(&config, 1).Error; err == nil {
		return &config, nil
	}
	config = PromotionConfig{ID: 1, MinWithdrawal: 10, CommissionSettleDays: 7}
	if err := db.Create(&config).Error; err != nil {
		return nil, err
	}
	return &config, nil
}

// Promotion 用户推广申请模型
type Promotion struct {
	ID          uint         `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID      uint         `gorm:"uniqueIndex;not null;comment:用户ID" json:"user_id"`
	PromoCode   string       `gorm:"size:32;uniqueIndex;comment:推广码" json:"promo_code"`
	Status      int          `gorm:"default:0;comment:0待审核 1启用 2拒绝" json:"status"`
	RejectReason string      `gorm:"size:255;comment:拒绝原因" json:"reject_reason"`
	ReviewTime  *utils.HTime `gorm:"comment:审核时间" json:"review_time"`
	CreateTime  utils.HTime  `gorm:"comment:申请时间" json:"create_time"`
	UpdateTime  utils.HTime  `gorm:"comment:更新时间;autoUpdateTime" json:"update_time"`
}

// TableName 指定推广表名
func (Promotion) TableName() string { return "ginblog_promotion" }

// InviteRelation 邀请关系模型
type InviteRelation struct {
	ID          uint        `gorm:"primaryKey;autoIncrement" json:"id"`
	InviterID   uint        `gorm:"index;not null;comment:邀请人ID" json:"inviter_id"`
	InviterName string      `gorm:"size:32;comment:邀请人账号" json:"inviter_name"`
	InviteeID   uint        `gorm:"uniqueIndex;not null;comment:被邀请人ID" json:"invitee_id"`
	InviteeName string      `gorm:"size:32;comment:被邀请人账号" json:"invitee_name"`
	CreateTime  utils.HTime `gorm:"comment:创建时间" json:"create_time"`
}

// TableName 指定邀请关系表名
func (InviteRelation) TableName() string { return "ginblog_invite_relation" }

// Commission 返佣记录模型
type Commission struct {
	ID           uint         `gorm:"primaryKey;autoIncrement" json:"id"`
	InviterID    uint         `gorm:"index;not null;comment:邀请人ID" json:"inviter_id"`
	InviterName  string       `gorm:"size:32;comment:邀请人账号" json:"inviter_name"`
	InviteeID    uint         `gorm:"index;comment:被邀请人ID" json:"invitee_id"`
	InviteeName  string       `gorm:"size:32;comment:被邀请人账号" json:"invitee_name"`
	OrderNo      string       `gorm:"size:64;uniqueIndex;comment:关联订单号" json:"order_no"`
	OrderAmount  float64      `gorm:"default:0;comment:订单金额" json:"order_amount"`
	RebateRate   float64      `gorm:"default:0;comment:返佣比例百分比" json:"rebate_rate"`
	Amount       float64      `gorm:"default:0;comment:佣金金额" json:"amount"`
	Status       int          `gorm:"default:0;comment:0待结算 1已结算 2无效" json:"status"`
	SettleTime   *utils.HTime `gorm:"comment:结算时间" json:"settle_time"`
	CreateTime   utils.HTime  `gorm:"comment:创建时间" json:"create_time"`
}

// TableName 指定返佣记录表名
func (Commission) TableName() string { return "ginblog_commission" }

// Withdrawal 提现申请模型
type Withdrawal struct {
	ID             uint         `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID         uint         `gorm:"index;not null;comment:用户ID" json:"user_id"`
	Username       string       `gorm:"size:32;comment:用户账号" json:"username"`
	Amount         float64      `gorm:"default:0;comment:提现金额" json:"amount"`
	Method         string       `gorm:"size:16;default:alipay;comment:收款方式 alipay wechat bank" json:"method"`
	RealName       string       `gorm:"size:64;comment:收款真实姓名" json:"real_name"`
	AlipayAccount  string       `gorm:"size:128;comment:支付宝账号" json:"alipay_account"`
	AlipayQrcode   string       `gorm:"size:255;comment:支付宝二维码" json:"alipay_qrcode"`
	WechatAccount  string       `gorm:"size:128;comment:微信账号" json:"wechat_account"`
	WechatQrcode   string       `gorm:"size:255;comment:微信二维码" json:"wechat_qrcode"`
	BankCard       string       `gorm:"size:64;comment:银行卡号" json:"bank_card"`
	BankPhone      string       `gorm:"size:32;comment:银行预留手机号" json:"bank_phone"`
	Status         int          `gorm:"default:0;comment:0待审核 1通过 2拒绝 3已打款" json:"status"`
	RejectReason   string       `gorm:"size:255;comment:拒绝原因" json:"reject_reason"`
	ReviewTime     *utils.HTime `gorm:"comment:审核时间" json:"review_time"`
	CreateTime     utils.HTime  `gorm:"comment:申请时间" json:"create_time"`
}

// TableName 指定提现表名
func (Withdrawal) TableName() string { return "ginblog_withdrawal" }