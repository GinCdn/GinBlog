package model

import (
	"time"

	"ginblog/utils"

	"gorm.io/gorm"
)

// RegisterSetting 注册配置模型，固定读取 ID 为 1 的单行记录
type RegisterSetting struct {
	ID               int         `gorm:"primaryKey;autoIncrement:false;default:1" json:"id"`
	Status           bool        `gorm:"default:true;comment:是否允许注册" json:"status"`
	UsernameMinLen   int         `gorm:"default:5;comment:用户名最小长度" json:"usernameMinLen"`
	UsernameMaxLen   int         `gorm:"default:20;comment:用户名最大长度" json:"usernameMaxLen"`
	PasswordMinLen   int         `gorm:"default:6;comment:密码最小长度" json:"passwordMinLen"`
	PasswordMaxLen   int         `gorm:"default:20;comment:密码最大长度" json:"passwordMaxLen"`
	PasswordRule     int         `gorm:"default:1;comment:密码规则 1字母数字 2大小写数字" json:"passwordRule"`
	VerifyEmail      bool        `gorm:"default:true;comment:是否验证邮箱" json:"verifyEmail"`
	VerifyPhone      bool        `gorm:"default:false;comment:是否验证手机号" json:"verifyPhone"`
	RequiredUsername bool        `gorm:"default:true;comment:用户名必填" json:"requiredUsername"`
	RequiredEmail    bool        `gorm:"default:true;comment:邮箱必填" json:"requiredEmail"`
	RequiredPhone    bool        `gorm:"default:false;comment:手机号必填" json:"requiredPhone"`
	RequiredQQ       bool        `gorm:"default:false;comment:QQ必填" json:"requiredQQ"`
	UpdateTime       utils.HTime `gorm:"comment:更新时间;autoUpdateTime" json:"updateTime"`
}

// TableName 指定注册配置表名
func (RegisterSetting) TableName() string { return "ginblog_register_setting" }

// GetOrCreateRegisterSetting 获取注册配置，不存在时创建默认配置
func GetOrCreateRegisterSetting(db *gorm.DB) (*RegisterSetting, error) {
	var setting RegisterSetting
	err := db.First(&setting, 1).Error
	if err == nil {
		return &setting, nil
	}
	setting = RegisterSetting{ID: 1, Status: true, UsernameMinLen: 5, UsernameMaxLen: 20, PasswordMinLen: 6, PasswordMaxLen: 20, PasswordRule: 1, VerifyEmail: true, RequiredUsername: true, RequiredEmail: true}
	if err := db.Create(&setting).Error; err != nil {
		return nil, err
	}
	return &setting, nil
}

// RoleDiscount 角色折扣配置模型
type RoleDiscount struct {
	ID              uint        `gorm:"primaryKey;autoIncrement" json:"id"`
	RoleLevel       string      `gorm:"size:32;uniqueIndex;comment:角色等级" json:"roleLevel"`
	RoleName        string      `gorm:"size:64;comment:角色名称" json:"roleName"`
	DiscountRate    float64     `gorm:"default:100;comment:折扣率百分比" json:"discountRate"`
	UpgradeRecharge float64     `gorm:"default:0;comment:升级累计充值金额" json:"upgradeRecharge"`
	PackageRebate   float64     `gorm:"default:0;comment:套餐返佣比例" json:"packageRebate"`
	IsDefault       bool        `gorm:"default:false;comment:是否默认角色" json:"isDefault"`
	Status          bool        `gorm:"default:true;comment:是否启用" json:"status"`
	Remark          string      `gorm:"size:255;comment:备注" json:"remark"`
	CreateTime      utils.HTime `gorm:"comment:创建时间" json:"createTime"`
	UpdateTime      utils.HTime `gorm:"comment:更新时间;autoUpdateTime" json:"updateTime"`
}

// TableName 指定角色折扣表名
func (RoleDiscount) TableName() string { return "ginblog_user_role_config" }

// PaymentConfig 支付渠道配置模型，敏感字段返回时由 API 层处理保留策略
type PaymentConfig struct {
	ID               uint        `gorm:"primaryKey;autoIncrement" json:"id"`
	Name             string      `gorm:"size:64;comment:显示名称" json:"name"`
	Channel          string      `gorm:"size:32;uniqueIndex;comment:支付通道 alipay wxpay" json:"channel"`
	Method           string      `gorm:"size:32;default:epay;comment:支付方式 official epay" json:"method"`
	Scene            string      `gorm:"size:32;default:page;comment:支付场景" json:"scene"`
	Enabled          bool        `gorm:"default:false;comment:是否启用" json:"enabled"`
	EpayPayUrl       string      `gorm:"size:255;comment:易支付地址" json:"epay_pay_url"`
	EpayPid          string      `gorm:"size:64;comment:易支付商户ID" json:"epay_pid"`
	EpayPayKey       string      `gorm:"size:255;comment:易支付密钥" json:"epay_pay_key"`
	AlipayAppID      string      `gorm:"size:64;comment:支付宝应用ID" json:"alipay_app_id"`
	AlipayPrivateKey string      `gorm:"text;comment:支付宝私钥" json:"alipay_private_key"`
	AlipayPublicKey  string      `gorm:"text;comment:支付宝公钥" json:"alipay_public_key"`
	WxpayAppID       string      `gorm:"size:64;comment:微信应用ID" json:"wxpay_app_id"`
	WxpayMchID       string      `gorm:"size:64;comment:微信商户号" json:"wxpay_mch_id"`
	WxpayAPIKey      string      `gorm:"size:128;comment:微信API密钥" json:"wxpay_api_key"`
	NotifyURL        string      `gorm:"size:255;comment:异步通知地址" json:"notify_url"`
	ReturnURL        string      `gorm:"size:255;comment:同步跳转地址" json:"return_url"`
	CreateTime       utils.HTime `gorm:"comment:创建时间" json:"createTime"`
	UpdateTime       utils.HTime `gorm:"comment:更新时间;autoUpdateTime" json:"updateTime"`
}

// TableName 指定支付配置表名
func (PaymentConfig) TableName() string { return "ginblog_payment_configs" }

// SmsConfig 短信配置模型
type SmsConfig struct {
	ID                    uint        `gorm:"primaryKey;autoIncrement" json:"id"`
	Provider              string      `gorm:"size:32;default:smsbao;comment:短信服务商 smsbao aliyun" json:"provider"`
	Status                bool        `gorm:"default:false;comment:是否启用" json:"status"`
	SmsBaoUser            string      `gorm:"size:64;comment:短信宝账号" json:"smsBaoUser"`
	SmsBaoPassword        string      `gorm:"size:128" json:"-"`
	AliyunAccessKeyID     string      `gorm:"size:128;comment:阿里云AccessKeyID" json:"aliyunAccessKeyId"`
	AliyunAccessKeySecret string      `gorm:"size:255" json:"-"`
	AliyunSignName        string      `gorm:"size:64;comment:阿里云短信签名" json:"aliyunSignName"`
	AliyunTemplateCode    string      `gorm:"size:64;comment:阿里云模板编号" json:"aliyunTemplateCode"`
	AliyunRegionID        string      `gorm:"size:32;default:cn-hangzhou;comment:阿里云地域" json:"aliyunRegionId"`
	CreateTime            utils.HTime `gorm:"comment:创建时间" json:"createTime"`
	UpdateTime            utils.HTime `gorm:"comment:更新时间;autoUpdateTime" json:"updateTime"`
}

// TableName 指定短信配置表名
func (SmsConfig) TableName() string { return "ginblog_sms_configs" }

// SmsConfigVo 短信配置响应结构，只暴露密钥已配置状态
type SmsConfigVo struct {
	ID                              uint   `json:"id"`
	Provider                        string `json:"provider"`
	Status                          bool   `json:"status"`
	SmsBaoUser                      string `json:"smsBaoUser"`
	SmsBaoPasswordConfigured        bool   `json:"smsBaoPasswordConfigured"`
	AliyunAccessKeyID               string `json:"aliyunAccessKeyId"`
	AliyunAccessKeySecretConfigured bool   `json:"aliyunAccessKeySecretConfigured"`
	AliyunSignName                  string `json:"aliyunSignName"`
	AliyunTemplateCode              string `json:"aliyunTemplateCode"`
	AliyunRegionID                  string `json:"aliyunRegionId"`
}

// SmsCode 手机验证码模型
// SmsTestDto 管理员短信测试参数。
type SmsTestDto struct {
	Phone string `form:"phone" json:"phone" binding:"required"`
}

type SmsCode struct {
	ID        uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	Phone     string    `gorm:"size:16;index;comment:手机号" json:"phone"`
	Code      string    `gorm:"size:8;comment:验证码" json:"-"`
	CreatedAt time.Time `gorm:"comment:创建时间" json:"createdAt"`
	ExpiresAt time.Time `gorm:"comment:过期时间" json:"expiresAt"`
}

// TableName 指定短信验证码表名
func (SmsCode) TableName() string { return "ginblog_sms_codes" }

// AntiBrushConfig 防刷配置模型
type AntiBrushConfig struct {
	ID             uint        `gorm:"primaryKey;autoIncrement" json:"id"`
	CaptchaID      string      `gorm:"size:128;comment:极验验证ID" json:"captchaId"`
	CaptchaKey     string      `gorm:"size:255" json:"-"`
	EmailAntiBrush bool        `gorm:"default:false;comment:邮件防刷开关" json:"emailAntiBrush"`
	SmsAntiBrush   bool        `gorm:"default:false;comment:短信防刷开关" json:"smsAntiBrush"`
	CreateTime     utils.HTime `gorm:"comment:创建时间" json:"createTime"`
	UpdateTime     utils.HTime `gorm:"comment:更新时间;autoUpdateTime" json:"updateTime"`
}

// TableName 指定防刷配置表名
func (AntiBrushConfig) TableName() string { return "ginblog_anti_brush_config" }

// GeetestValidateDto 极验行为验证结果模型。
type GeetestValidateDto struct {
	LotNumber     string `form:"lot_number" json:"lot_number"`
	CaptchaOutput string `form:"captcha_output" json:"captcha_output"`
	PassToken     string `form:"pass_token" json:"pass_token"`
	GenTime       string `form:"gen_time" json:"gen_time"`
}

// PublicAntiBrushConfigVo 前台公开的防刷配置，不包含极验密钥。
type PublicAntiBrushConfigVo struct {
	CaptchaID      string `json:"captcha_id"`
	EmailAntiBrush bool   `json:"email_anti_brush"`
	SmsAntiBrush   bool   `json:"sms_anti_brush"`
}

// AlipayConfig 支付宝实名与支付基础配置模型
type AlipayConfig struct {
	ID           uint        `gorm:"primaryKey;autoIncrement" json:"id"`
	AppID        string      `gorm:"size:64;comment:支付宝应用ID" json:"app_id"`
	PrivateKey   string      `gorm:"text" json:"-"`
	AliPublicKey string      `gorm:"text;column:alipay_public_key;comment:支付宝公钥" json:"alipay_public_key_configured"`
	ServerURL    string      `gorm:"size:255;default:https://openapi.alipay.com/gateway.do;comment:网关地址" json:"server_url"`
	SignType     string      `gorm:"size:16;default:RSA2;comment:签名类型" json:"sign_type"`
	Charset      string      `gorm:"size:16;default:utf-8;comment:字符集" json:"charset"`
	Format       string      `gorm:"size:16;default:JSON;comment:数据格式" json:"format"`
	RedirectURI  string      `gorm:"size:255;comment:回调地址" json:"redirect_uri"`
	Status       bool        `gorm:"default:false;comment:是否启用" json:"status"`
	CreateTime   utils.HTime `gorm:"comment:创建时间" json:"createTime"`
	UpdateTime   utils.HTime `gorm:"comment:更新时间;autoUpdateTime" json:"updateTime"`
}

// TableName 指定支付宝配置表名
func (AlipayConfig) TableName() string { return "ginblog_alipay_config" }

// UserRealNameAuth 用户实名信息模型
type UserRealNameAuth struct {
	ID            uint        `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID        uint        `gorm:"uniqueIndex;not null;comment:用户ID" json:"userId"`
	Channel       string      `gorm:"size:32;default:alipay;comment:认证渠道" json:"channel"`
	RealName      string      `gorm:"size:64;comment:真实姓名" json:"real_name"`
	IDCard        string      `gorm:"size:32;comment:证件号码" json:"id_card"`
	Account       string      `gorm:"size:128;comment:支付宝账号" json:"account"`
	VerifyStatus  bool        `gorm:"default:false;comment:是否实名通过" json:"verify_status"`
	VerifyMessage string      `gorm:"size:255;comment:审核结果说明" json:"verify_message"`
	OutTradeNo    string      `gorm:"size:128;index;comment:第三方实名请求号" json:"-"`
	CreateTime    utils.HTime `gorm:"comment:创建时间" json:"create_time"`
	UpdateTime    utils.HTime `gorm:"comment:更新时间;autoUpdateTime" json:"update_time"`
}

// TableName 指定用户实名表名
func (UserRealNameAuth) TableName() string { return "ginblog_user_realname" }

// RealNameConfig 实名认证服务配置，固定使用 ID=1 保存当前生效配置。
type RealNameConfig struct {
	ID              uint        `gorm:"primaryKey;autoIncrement:false" json:"id" form:"id"`
	Channel         string      `gorm:"size:16;not null;comment:认证渠道 alipay/aliyun/tencent/mobile_three" json:"channel" form:"channel"`
	AppID           string      `gorm:"size:128;comment:AppID或SecretId" json:"app_id" form:"app_id"`
	Secret          string      `gorm:"size:256;comment:渠道密钥或SecretKey" json:"-" form:"secret"`
	PrivateKey      string      `gorm:"type:text;comment:支付宝应用私钥" json:"-" form:"private_key"`
	PublicKey       string      `gorm:"type:text;comment:支付宝公钥" json:"-" form:"public_key"`
	RedirectURI     string      `gorm:"size:255;comment:支付宝实名回调地址" json:"redirect_uri" form:"redirect_uri"`
	RuleID          string      `gorm:"size:64;comment:腾讯云场景ID" json:"rule_id" form:"rule_id"`
	Status          bool        `gorm:"default:false;comment:是否启用" json:"status" form:"status"`
	ProviderType    string      `gorm:"size:16;default:official;comment:认证服务 official/ginapi" json:"provider_type" form:"provider_type"`
	GinapiBaseURL   string      `gorm:"size:255;comment:GinApi服务地址" json:"ginapi_base_url" form:"ginapi_base_url"`
	GinapiAppKey    string      `gorm:"size:128;comment:GinApi应用AppKey" json:"ginapi_app_key" form:"ginapi_app_key"`
	GinapiAppSecret string      `gorm:"type:text;comment:GinApi应用AppSecret" json:"-" form:"ginapi_app_secret"`
	GinapiAppSlug   string      `gorm:"size:128;comment:GinApi应用标识" json:"ginapi_app_slug" form:"ginapi_app_slug"`
	UpdateTime      utils.HTime `gorm:"comment:更新时间;autoUpdateTime" json:"update_time" form:"-"`
}

// TableName 指定实名认证配置表名，避免与 GinCDN 项目共用数据表。
func (RealNameConfig) TableName() string { return "ginblog_realname_config" }
