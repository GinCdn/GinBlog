package api

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"

	. "ginblog/core"
	"ginblog/global"
	"ginblog/middleware"
	"ginblog/model"
	"ginblog/result"
	"ginblog/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// pageParams 解析通用分页参数，默认第一页每页二十条
func pageParams(c *gin.Context) (page, pageSize int) {
	page, _ = strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ = strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return
}

// pageData 包装前端 DataTable 兼容的分页结构
func pageData[T any](list []T, total int64, page, pageSize int) gin.H {
	return gin.H{"list": list, "total": total, "page": page, "page_size": pageSize}
}

// currentUser 根据登录用户名查询用户信息
func currentUser(c *gin.Context) (model.User, bool) {
	usernameValue, exists := c.Get("username")
	if !exists {
		return model.User{}, false
	}
	username, _ := usernameValue.(string)
	var user model.User
	if err := Db.Where("username = ?", username).First(&user).Error; err != nil || user.ID == 0 {
		return model.User{}, false
	}
	user.Password = ""
	return user, true
}

// currentAdmin 校验当前登录账号是否为管理员
func currentAdmin(c *gin.Context) bool {
	usernameValue, exists := c.Get("username")
	if !exists {
		return false
	}
	admin := CheckAdmin(fmt.Sprint(usernameValue))
	return admin.ID > 0
}

// paymentConfigResponse 是支付配置的安全响应结构，密钥仅返回是否已配置。
type paymentConfigResponse struct {
	ID                         uint   `json:"id"`
	Name                       string `json:"name"`
	Channel                    string `json:"channel"`
	Method                     string `json:"method"`
	Scene                      string `json:"scene"`
	Enabled                    bool   `json:"enabled"`
	EpayPayURL                 string `json:"epay_pay_url"`
	EpayPID                    string `json:"epay_pid"`
	EpayPayKeyConfigured       bool   `json:"epay_pay_key_configured"`
	AlipayAppID                string `json:"alipay_app_id"`
	AlipayPrivateKeyConfigured bool   `json:"alipay_private_key_configured"`
	AlipayPublicKeyConfigured  bool   `json:"alipay_public_key_configured"`
	WxpayAppID                 string `json:"wxpay_app_id"`
	WxpayMchID                 string `json:"wxpay_mch_id"`
	WxpayAPIKeyConfigured      bool   `json:"wxpay_api_key_configured"`
	NotifyURL                  string `json:"notify_url"`
	ReturnURL                  string `json:"return_url"`
}

// newPaymentConfigResponse 将支付配置转为不包含密钥明文的响应数据。
func newPaymentConfigResponse(config model.PaymentConfig) paymentConfigResponse {
	return paymentConfigResponse{
		ID:                         config.ID,
		Name:                       config.Name,
		Channel:                    config.Channel,
		Method:                     config.Method,
		Scene:                      config.Scene,
		Enabled:                    config.Enabled,
		EpayPayURL:                 config.EpayPayUrl,
		EpayPID:                    config.EpayPid,
		EpayPayKeyConfigured:       config.EpayPayKey != "",
		AlipayAppID:                config.AlipayAppID,
		AlipayPrivateKeyConfigured: config.AlipayPrivateKey != "",
		AlipayPublicKeyConfigured:  config.AlipayPublicKey != "",
		WxpayAppID:                 config.WxpayAppID,
		WxpayMchID:                 config.WxpayMchID,
		WxpayAPIKeyConfigured:      config.WxpayAPIKey != "",
		NotifyURL:                  config.NotifyURL,
		ReturnURL:                  config.ReturnURL,
	}
}

// GetRegisterConfigPublic 获取公开注册配置，不存在时返回默认配置
func GetRegisterConfigPublic(c *gin.Context) {
	setting, err := model.GetOrCreateRegisterSetting(Db)
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "获取注册配置失败")
		return
	}
	result.Success(c, setting)
}

// UpdateRegisterConfig 管理端更新注册配置，未传字段保持原值
func UpdateRegisterConfig(c *gin.Context) {
	setting, err := model.GetOrCreateRegisterSetting(Db)
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "获取注册配置失败")
		return
	}
	updates := map[string]any{}
	if c.PostForm("status") != "" {
		updates["status"] = c.PostForm("status") == "true"
	}
	for name, target := range map[string]*int{"username_min_len": &setting.UsernameMinLen, "username_max_len": &setting.UsernameMaxLen, "password_min_len": &setting.PasswordMinLen, "password_max_len": &setting.PasswordMaxLen, "password_rule": &setting.PasswordRule} {
		if text := c.PostForm(name); text != "" {
			value, _ := strconv.Atoi(text)
			*target = value
			updates[name] = value
		}
	}
	for _, name := range []string{"verify_email", "verify_phone", "required_username", "required_email", "required_phone", "required_qq"} {
		if text := c.PostForm(name); text != "" {
			updates[name] = text == "true"
		}
	}
	if len(updates) > 0 && Db.Model(setting).Updates(updates).Error != nil {
		result.FailedWithMsg(c, result.InternalError, string(result.UpdateError))
		return
	}
	result.Success(c, true)
}

// GetRoleDiscountList 查询角色折扣；管理端可查看全部，普通用户只看启用角色
func GetRoleDiscountList(c *gin.Context) {
	page, pageSize := pageParams(c)
	db := Db.Model(&model.RoleDiscount{})
	if !currentAdmin(c) {
		db = db.Where("status = ?", true)
	}
	if roleLevel := c.Query("role_level"); roleLevel != "" {
		db = db.Where("role_level = ?", roleLevel)
	}
	var total int64
	var list []model.RoleDiscount
	if db.Count(&total).Error != nil || db.Order("id asc").Offset((page-1)*pageSize).Limit(pageSize).Find(&list).Error != nil {
		result.FailedWithMsg(c, result.InternalError, "获取角色列表失败")
		return
	}
	result.Success(c, pageData(list, total, page, pageSize))
}

// UpdateRoleDiscount 更新角色折扣配置
func UpdateRoleDiscount(c *gin.Context) {
	id, _ := strconv.Atoi(c.PostForm("id"))
	var role model.RoleDiscount
	if id <= 0 || Db.First(&role, id).Error != nil {
		result.FailedWithMsg(c, result.BadRequest, "角色配置不存在")
		return
	}
	updates := map[string]any{}
	for name, column := range map[string]string{"role_name": "role_name", "remark": "remark"} {
		if text := c.PostForm(name); text != "" {
			updates[column] = text
		}
	}
	for name, limit := range map[string]float64{"discount_rate": 100, "package_rebate": 100} {
		if text := c.PostForm(name); text != "" {
			value, _ := strconv.ParseFloat(text, 64)
			if value < 0 || value > limit {
				result.FailedWithMsg(c, result.BadRequest, "比例必须在0到100之间")
				return
			}
			updates[name] = value
		}
	}
	if text := c.PostForm("upgrade_recharge"); text != "" {
		value, _ := strconv.ParseFloat(text, 64)
		if value < 0 {
			result.FailedWithMsg(c, result.BadRequest, "升级金额不能小于0")
			return
		}
		updates["upgrade_recharge"] = value
	}
	if text := c.PostForm("status"); text != "" {
		updates["status"] = text == "true"
	}
	if len(updates) > 0 && Db.Model(&role).Updates(updates).Error != nil {
		result.FailedWithMsg(c, result.InternalError, string(result.UpdateError))
		return
	}
	result.Success(c, true)
}

// seedPaymentConfigs 初始化支付宝、微信两个支付渠道配置
func seedPaymentConfigs() error {
	for _, channel := range []string{"alipay", "wxpay"} {
		var count int64
		if err := Db.Model(&model.PaymentConfig{}).Where("channel = ?", channel).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			continue
		}
		config := model.PaymentConfig{Name: channel + "支付", Channel: channel, Method: "epay", Scene: "page", CreateTime: utils.HTime{Time: utils.Now()}, UpdateTime: utils.HTime{Time: utils.Now()}}
		if err := Db.Create(&config).Error; err != nil {
			return err
		}
	}
	return nil
}

// GetPaymentConfigs 获取全部支付渠道配置
func GetPaymentConfigs(c *gin.Context) {
	if err := seedPaymentConfigs(); err != nil {
		result.FailedWithMsg(c, result.InternalError, "初始化支付渠道失败")
		return
	}
	list := []model.PaymentConfig{}
	if Db.Where("channel IN ?", []string{"alipay", "wxpay"}).Order("id asc").Find(&list).Error != nil {
		result.FailedWithMsg(c, result.InternalError, "获取支付配置失败")
		return
	}
	response := make([]paymentConfigResponse, 0, len(list))
	for _, config := range list {
		response = append(response, newPaymentConfigResponse(config))
	}
	result.Success(c, response)
}

// UpdatePaymentConfig 更新支付配置，密钥留空表示保留原值
func UpdatePaymentConfig(c *gin.Context) {
	id, _ := strconv.Atoi(c.PostForm("id"))
	var config model.PaymentConfig
	if id <= 0 || Db.First(&config, id).Error != nil || (config.Channel != "alipay" && config.Channel != "wxpay") {
		result.FailedWithMsg(c, result.BadRequest, "支付配置不存在")
		return
	}

	if text := strings.TrimSpace(c.PostForm("name")); text != "" {
		config.Name = text
	}
	if method, exists := c.GetPostForm("method"); exists {
		method = strings.TrimSpace(method)
		if method != "official" && method != "epay" {
			result.FailedWithMsg(c, result.BadRequest, "支付方式参数无效")
			return
		}
		config.Method = method
	}
	if scene, exists := c.GetPostForm("scene"); exists {
		config.Scene = strings.TrimSpace(scene)
	}
	if enabled, exists := c.GetPostForm("enabled"); exists {
		switch strings.ToLower(strings.TrimSpace(enabled)) {
		case "true", "1":
			config.Enabled = true
		case "false", "0":
			config.Enabled = false
		default:
			result.FailedWithMsg(c, result.BadRequest, "支付通道状态参数无效")
			return
		}
	}

	// 普通字段支持空值清空，但密钥字段保持留空不修改的兼容行为。
	for name, target := range map[string]*string{
		"epay_pay_url":  &config.EpayPayUrl,
		"epay_pid":      &config.EpayPid,
		"notify_url":    &config.NotifyURL,
		"return_url":    &config.ReturnURL,
		"alipay_app_id": &config.AlipayAppID,
		"wxpay_app_id":  &config.WxpayAppID,
		"wxpay_mch_id":  &config.WxpayMchID,
	} {
		if text, exists := c.GetPostForm(name); exists {
			*target = strings.TrimSpace(text)
		}
	}
	for name, target := range map[string]*string{
		"epay_pay_key":       &config.EpayPayKey,
		"alipay_private_key": &config.AlipayPrivateKey,
		"alipay_public_key":  &config.AlipayPublicKey,
		"wxpay_api_key":      &config.WxpayAPIKey,
	} {
		if text := c.PostForm(name); text != "" {
			*target = text
		}
	}
	config.UpdateTime = utils.HTime{Time: utils.Now()}
	if Db.Save(&config).Error != nil {
		result.FailedWithMsg(c, result.InternalError, string(result.UpdateError))
		return
	}
	result.Success(c, true)
}

// GetAlipayConfig 获取支付宝实名基础配置，敏感值仅返回是否已设置
func GetAlipayConfig(c *gin.Context) {
	var config model.AlipayConfig
	if errors.Is(Db.First(&config).Error, gorm.ErrRecordNotFound) {
		config.Status = false
		config.ServerURL = "https://openapi.alipay.com/gateway.do"
		config.SignType = "RSA2"
		config.Charset = "utf-8"
		config.Format = "JSON"
	}
	result.Success(c, gin.H{"id": config.ID, "app_id": config.AppID, "server_url": config.ServerURL, "sign_type": config.SignType, "charset": config.Charset, "format": config.Format, "redirect_uri": config.RedirectURI, "status": config.Status, "private_key_configured": config.PrivateKey != "", "alipay_public_key_configured": config.AliPublicKey != ""})
}

// UpdateAlipayConfig 更新支付宝实名基础配置，私钥和公钥留空保留原值
func UpdateAlipayConfig(c *gin.Context) {
	var config model.AlipayConfig
	if errors.Is(Db.First(&config).Error, gorm.ErrRecordNotFound) {
		config.ServerURL = "https://openapi.alipay.com/gateway.do"
		config.SignType = "RSA2"
		config.Charset = "utf-8"
		config.Format = "JSON"
		if err := Db.Create(&config).Error; err != nil {
			result.FailedWithMsg(c, result.InternalError, "保存支付宝配置失败")
			return
		}
	}
	for name, target := range map[string]*string{"app_id": &config.AppID, "server_url": &config.ServerURL, "sign_type": &config.SignType, "charset": &config.Charset, "format": &config.Format} {
		if text := c.PostForm(name); text != "" {
			*target = text
		}
	}
	if value, exists := c.GetPostForm("redirect_uri"); exists {
		config.RedirectURI = value
	}
	if text := c.PostForm("private_key"); text != "" {
		config.PrivateKey = text
	}
	if text := c.PostForm("alipay_public_key"); text != "" {
		config.AliPublicKey = text
	}
	if text := c.PostForm("status"); text != "" {
		config.Status = text == "true"
	}
	config.UpdateTime = utils.HTime{Time: utils.Now()}
	if Db.Save(&config).Error != nil {
		result.FailedWithMsg(c, result.InternalError, string(result.UpdateError))
		return
	}
	result.Success(c, true)
}

// getSmsConfig 获取短信配置，首次访问自动创建默认关闭记录
func getSmsConfig() (*model.SmsConfig, error) {
	var config model.SmsConfig
	if err := Db.First(&config).Error; err == nil {
		return &config, nil
	}
	config.Provider = "smsbao"
	config.AliyunRegionID = "cn-hangzhou"
	config.CreateTime = utils.HTime{Time: utils.Now()}
	config.UpdateTime = utils.HTime{Time: utils.Now()}
	if err := Db.Create(&config).Error; err != nil {
		return nil, err
	}
	return &config, nil
}

// toSmsConfigVo 将短信配置转换为不含密钥的展示结构
func toSmsConfigVo(config *model.SmsConfig) model.SmsConfigVo {
	return model.SmsConfigVo{ID: config.ID, Provider: config.Provider, Status: config.Status, SmsBaoUser: config.SmsBaoUser, SmsBaoPasswordConfigured: config.SmsBaoPassword != "", AliyunAccessKeyID: config.AliyunAccessKeyID, AliyunAccessKeySecretConfigured: config.AliyunAccessKeySecret != "", AliyunSignName: config.AliyunSignName, AliyunTemplateCode: config.AliyunTemplateCode, AliyunRegionID: config.AliyunRegionID}
}

// GetSmsConfig 获取短信配置信息
func GetSmsConfig(c *gin.Context) {
	config, err := getSmsConfig()
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "获取短信配置失败")
		return
	}
	result.Success(c, toSmsConfigVo(config))
}

// UpdateSmsConfig 更新短信配置，密钥留空保留原值
func UpdateSmsConfig(c *gin.Context) {
	config, err := getSmsConfig()
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "获取短信配置失败")
		return
	}
	if text := c.PostForm("provider"); text == "smsbao" || text == "aliyun" {
		config.Provider = text
	}
	if value, exists := c.GetPostForm("status"); exists {
		config.Status = value == "true"
	}
	for name, target := range map[string]*string{"sms_bao_user": &config.SmsBaoUser, "aliyun_access_key_id": &config.AliyunAccessKeyID, "aliyun_sign_name": &config.AliyunSignName, "aliyun_template_code": &config.AliyunTemplateCode, "aliyun_region_id": &config.AliyunRegionID} {
		if text := c.PostForm(name); text != "" {
			*target = text
		}
	}
	for name, target := range map[string]*string{"sms_bao_password": &config.SmsBaoPassword, "aliyun_access_key_secret": &config.AliyunAccessKeySecret} {
		if text := c.PostForm(name); text != "" {
			*target = text
		}
	}
	config.UpdateTime = utils.HTime{Time: utils.Now()}
	if config.Status && (config.Provider == "smsbao" && (config.SmsBaoUser == "" || config.SmsBaoPassword == "") || config.Provider == "aliyun" && (config.AliyunAccessKeyID == "" || config.AliyunAccessKeySecret == "")) {
		result.FailedWithMsg(c, result.BadRequest, "启用短信服务前必须填写完整密钥")
		return
	}
	if Db.Save(config).Error != nil {
		result.FailedWithMsg(c, result.InternalError, string(result.UpdateError))
		return
	}
	result.Success(c, true)
}

// TestSendSms 使用当前保存的短信配置向指定手机号发送测试验证码。
func TestSendSms(c *gin.Context) {
	var dto model.SmsTestDto
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}
	dto.Phone = strings.TrimSpace(dto.Phone)
	if !utils.IsValidPhone(dto.Phone) {
		result.FailedWithMsg(c, result.BadRequest, "手机号格式错误")
		return
	}
	config, err := getSmsConfig()
	if err != nil {
		result.FailedWithMsg(c, result.BadRequest, "获取短信配置失败")
		return
	}
	if err := middleware.NewSmsService(Db, config).SendCode(dto.Phone); err != nil {
		result.FailedWithMsg(c, result.ServiceUnavail, err.Error())
		return
	}
	result.Success(c, true)
}

func SendPhoneCode(c *gin.Context) {
	phone := strings.TrimSpace(c.PostForm("phone"))
	if !utils.IsValidPhone(phone) {
		result.FailedWithMsg(c, result.BadRequest, "手机号格式错误")
		return
	}
	if !VerifyAntiBrush(c, antiBrushSMS) {
		return
	}

	var recent int64
	if Db.Model(&model.SmsCode{}).Where("phone = ? and created_at > ?", phone, utils.Now().Add(-time.Minute)).Count(&recent).Error != nil {
		result.FailedWithMsg(c, result.InternalError, "验证码发送失败")
		return
	}
	if recent > 0 {
		result.FailedWithMsg(c, result.ServiceUnavail, "操作过于频繁，请60秒后重试")
		return
	}
	code := randomDigits(6)
	expires := utils.Now().Add(5 * time.Minute)
	record := model.SmsCode{Phone: phone, Code: code, CreatedAt: utils.Now(), ExpiresAt: expires}
	if Db.Create(&record).Error != nil {
		result.FailedWithMsg(c, result.InternalError, "验证码发送失败")
		return
	}
	global.Log.Infof("[SMS] 手机验证码已生成 %s", phone)
	result.Success(c, map[string]string{"expires_at": expires.Format(time.RFC3339)})
}

// VerifyPhoneCode 公开校验手机验证码
func VerifyPhoneCode(c *gin.Context) {
	if verifySmsCodeRecord(c.PostForm("phone"), c.PostForm("code")) {
		result.Success(c, true)
	} else {
		result.FailedWithMsg(c, result.BadRequest, "验证码无效或已过期")
	}
}

// verifySmsCodeRecord 内部校验并消费手机验证码
func verifySmsCodeRecord(phone, code string) bool {
	if phone == "" || code == "" {
		return false
	}
	var record model.SmsCode
	if Db.Where("phone = ? and code = ? and expires_at > ?", phone, code, utils.Now()).First(&record).Error != nil {
		return false
	}
	Db.Delete(&record)
	return true
}

// randomDigits 生成指定长度的数字验证码
func randomDigits(length int) string {
	output := make([]byte, length)
	for index := range output {
		number, _ := rand.Int(rand.Reader, big.NewInt(10))
		output[index] = byte(48 + number.Int64())
	}
	return string(output)
}

// GetAntiBrushConfig 获取防刷配置，极验密钥不回显明文
func GetAntiBrushConfig(c *gin.Context) {
	var config model.AntiBrushConfig
	if errors.Is(Db.First(&config).Error, gorm.ErrRecordNotFound) {
		config.EmailAntiBrush = false
		config.SmsAntiBrush = false
	}
	result.Success(c, gin.H{"id": config.ID, "captcha_id": config.CaptchaID, "captcha_key_configured": config.CaptchaKey != "", "email_anti_brush": config.EmailAntiBrush, "sms_anti_brush": config.SmsAntiBrush})
}

// UpdateAntiBrushConfig 更新防刷配置，密钥留空保留原值
func UpdateAntiBrushConfig(c *gin.Context) {
	var config model.AntiBrushConfig
	if errors.Is(Db.First(&config).Error, gorm.ErrRecordNotFound) {
		if err := Db.Create(&config).Error; err != nil {
			result.FailedWithMsg(c, result.InternalError, "保存防刷配置失败")
			return
		}
	}
	if value, exists := c.GetPostForm("captcha_id"); exists {
		config.CaptchaID = value
	}
	if text := c.PostForm("captcha_key"); text != "" {
		config.CaptchaKey = text
	}
	if text := c.PostForm("email_anti_brush"); text != "" {
		config.EmailAntiBrush = text == "true"
	}
	if text := c.PostForm("sms_anti_brush"); text != "" {
		config.SmsAntiBrush = text == "true"
	}
	if (config.EmailAntiBrush || config.SmsAntiBrush) && (config.CaptchaID == "" || config.CaptchaKey == "") {
		result.FailedWithMsg(c, result.BadRequest, "开启防刷前必须配置验证ID和通信密钥")
		return
	}
	config.UpdateTime = utils.HTime{Time: utils.Now()}
	if Db.Save(&config).Error != nil {
		result.FailedWithMsg(c, result.InternalError, string(result.UpdateError))
		return
	}
	result.Success(c, true)
}

// GetRealNameInfo 获取当前用户实名认证信息，保留既有接口名称和路由。
func GetRealNameInfo(c *gin.Context) {
	GetUserRealNameInfo(c)
}

// VerifyRealName 发起当前用户实名认证，保留既有接口名称和路由。
func VerifyRealName(c *gin.Context) {
	StartUserRealNameVerification(c)
}

// CreateRecharge 创建在线充值订单并返回支付跳转地址，余额仅在支付平台异步通知验签成功后入账。
func CreateRecharge(c *gin.Context) {
	user, ok := currentUser(c)
	if !ok {
		result.FailedWithMsg(c, result.NotFound, string(result.SubUserNotFound))
		return
	}
	amount, _ := strconv.ParseFloat(c.PostForm("amount"), 64)
	payWay := strings.ToLower(strings.TrimSpace(c.PostForm("pay_way")))
	if amount <= 0 || (payWay != "alipay" && payWay != "wxpay") {
		result.FailedWithMsg(c, result.BadRequest, "充值金额或支付方式错误")
		return
	}
	config, err := loadEnabledEpayConfig(payWay)
	if err != nil {
		result.FailedWithMsg(c, result.BadRequest, err.Error())
		return
	}
	tradeNo := generateTradeNo()
	payment, err := buildEpayPaymentInfo(config, tradeNo, payWay, "GinBlog 余额充值", amount)
	if err != nil {
		result.FailedWithMsg(c, result.BadRequest, err.Error())
		return
	}
	now := utils.HTime{Time: utils.Now()}
	order := model.RechargeOrder{
		Username:   user.Username,
		UserID:     user.ID,
		TradeNo:    tradeNo,
		Amount:     amount,
		PayType:    payWay,
		PayMethod:  config.Method,
		PayURL:     payment.URL,
		CreateTime: now,
	}
	payOrder := model.PayOrder{
		TradeNo:    tradeNo,
		Type:       "recharge",
		Name:       "余额充值",
		Money:      amount,
		Username:   user.Username,
		Status:     false,
		PayType:    payWay,
		CreateTime: now,
	}
	if err := Db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&order).Error; err != nil {
			return err
		}
		return tx.Create(&payOrder).Error
	}); err != nil {
		result.FailedWithMsg(c, result.InternalError, "创建充值订单失败")
		return
	}
	result.Success(c, gin.H{
		"order_no":    tradeNo,
		"amount":      amount,
		"pay_way":     payWay,
		"scene":       config.Scene,
		"create_time": now,
		"pay_info":    payment,
	})
}

// userPayOrderResponse 统一用户支付订单返回字段，并保留旧充值接口使用的金额和支付方式别名。
type userPayOrderResponse struct {
	model.PayOrder
	Amount float64 `json:"amount"`
	PayWay string  `json:"pay_way"`
}

// GetUserOrders 用户查询自己的支付订单，包含充值和文章购买订单。
func GetUserOrders(c *gin.Context) {
	user, ok := currentUser(c)
	if !ok {
		result.FailedWithMsg(c, result.NotFound, string(result.SubUserNotFound))
		return
	}
	page, pageSize := pageParams(c)
	query := Db.Model(&model.PayOrder{}).Where("username = ?", user.Username)
	var total int64
	var orders []model.PayOrder
	if query.Count(&total).Error != nil || query.Order("id desc").Offset((page-1)*pageSize).Limit(pageSize).Find(&orders).Error != nil {
		result.FailedWithMsg(c, result.InternalError, "获取支付订单失败")
		return
	}
	list := make([]userPayOrderResponse, 0, len(orders))
	for _, order := range orders {
		list = append(list, userPayOrderResponse{PayOrder: order, Amount: order.Money, PayWay: order.PayType})
	}
	result.Success(c, pageData(list, total, page, pageSize))
}

// AdminRechargeOrders 管理员分页查询充值订单
func AdminRechargeOrders(c *gin.Context) {
	page, pageSize := pageParams(c)
	query := Db.Model(&model.RechargeOrder{})
	if username := c.Query("username"); username != "" {
		query = query.Where("username like ?", "%"+username+"%")
	}
	if tradeNo := c.Query("trade_no"); tradeNo != "" {
		query = query.Where("trade_no like ?", "%"+tradeNo+"%")
	}
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status == "true")
	}
	var total int64
	var list []model.RechargeOrder
	if query.Count(&total).Error != nil || query.Order("id desc").Offset((page-1)*pageSize).Limit(pageSize).Find(&list).Error != nil {
		result.FailedWithMsg(c, result.InternalError, "获取充值订单失败")
		return
	}
	result.Success(c, pageData(list, total, page, pageSize))
}

// AdminPayOrders 管理员分页查询支付流水
func AdminPayOrders(c *gin.Context) {
	page, pageSize := pageParams(c)
	query := Db.Model(&model.PayOrder{})
	if username := c.Query("username"); username != "" {
		query = query.Where("username like ?", "%"+username+"%")
	}
	if tradeNo := c.Query("trade_no"); tradeNo != "" {
		query = query.Where("trade_no like ?", "%"+tradeNo+"%")
	}
	var total int64
	var list []model.PayOrder
	if query.Count(&total).Error != nil || query.Order("id desc").Offset((page-1)*pageSize).Limit(pageSize).Find(&list).Error != nil {
		result.FailedWithMsg(c, result.InternalError, "获取支付流水失败")
		return
	}
	result.Success(c, pageData(list, total, page, pageSize))
}

// generateTradeNo 生成本地唯一订单号
func generateTradeNo() string {
	raw := make([]byte, 6)
	_, _ = rand.Read(raw)
	return "GB" + utils.Now().Format("20060102150405") + hex.EncodeToString(raw)
}

// GetPromotionConfigAdmin 获取推广返佣全局配置
func GetPromotionConfigAdmin(c *gin.Context) {
	config, err := model.GetOrCreatePromotionConfig(Db)
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "获取推广配置失败")
		return
	}
	result.Success(c, config)
}

// UpdatePromotionConfig 更新推广返佣全局配置
func UpdatePromotionConfig(c *gin.Context) {
	config, err := model.GetOrCreatePromotionConfig(Db)
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "获取推广配置失败")
		return
	}
	updates := map[string]any{}
	if value, exists := c.GetPostForm("require_real_name"); exists {
		updates["require_real_name"] = value == "true"
	}
	if value, exists := c.GetPostForm("status"); exists {
		updates["status"] = value == "true"
	}
	if text := c.PostForm("min_withdrawal"); text != "" {
		minAmount, _ := strconv.ParseFloat(text, 64)
		if minAmount < 0 {
			minAmount = 0
		}
		updates["min_withdrawal"] = minAmount
	}
	if text := c.PostForm("commission_settle_days"); text != "" {
		days, _ := strconv.Atoi(text)
		updates["commission_settle_days"] = days
	}
	if len(updates) > 0 && Db.Model(config).Updates(updates).Error != nil {
		result.FailedWithMsg(c, result.InternalError, string(result.UpdateError))
		return
	}
	result.Success(c, true)
}

// ApplyPromotion 用户申请开通推广资格
func ApplyPromotion(c *gin.Context) {
	user, ok := currentUser(c)
	if !ok {
		result.FailedWithMsg(c, result.NotFound, string(result.SubUserNotFound))
		return
	}
	config, err := model.GetOrCreatePromotionConfig(Db)
	if err != nil || !config.Status {
		result.FailedWithMsg(c, result.Forbidden, "推广功能未开启")
		return
	}
	var existing model.Promotion
	if Db.Where("user_id = ?", user.ID).First(&existing).Error == nil {
		result.FailedWithMsg(c, result.BadRequest, "已提交过推广申请")
		return
	}
	if config.RequireRealName && !user.RealNameAuth {
		result.FailedWithMsg(c, result.Forbidden, "请先完成实名认证")
		return
	}
	var count int64
	Db.Model(&model.Promotion{}).Count(&count)
	promo := model.Promotion{UserID: user.ID, PromoCode: fmt.Sprintf("GB%04d%s", count+1, randomDigits(4)), Status: 0, CreateTime: utils.HTime{Time: utils.Now()}, UpdateTime: utils.HTime{Time: utils.Now()}}
	if Db.Create(&promo).Error != nil {
		result.FailedWithMsg(c, result.InternalError, "推广申请提交失败")
		return
	}
	result.Success(c, promo)
}

// GetPromotionStatus 用户查询推广申请状态
func GetPromotionStatus(c *gin.Context) {
	user, ok := currentUser(c)
	if !ok {
		result.FailedWithMsg(c, result.NotFound, string(result.SubUserNotFound))
		return
	}
	var promo model.Promotion
	if errors.Is(Db.Where("user_id = ?", user.ID).First(&promo).Error, gorm.ErrRecordNotFound) {
		result.Success(c, gin.H{"applied": false, "status": -1})
		return
	}
	result.Success(c, gin.H{"applied": true, "status": promo.Status, "promo_code": promo.PromoCode, "reject_reason": promo.RejectReason})
}

// GetPromotionStats 用户查询邀请与佣金汇总
func GetPromotionStats(c *gin.Context) {
	user, ok := currentUser(c)
	if !ok {
		result.FailedWithMsg(c, result.NotFound, string(result.SubUserNotFound))
		return
	}
	type sumRow struct{ Total float64 }
	var settled, pending, withdrawn sumRow
	var invitees int64
	Db.Model(&model.InviteRelation{}).Where("inviter_id = ?", user.ID).Count(&invitees)
	Db.Model(&model.Commission{}).Where("inviter_id = ? and status = ?", user.ID, 1).Select("coalesce(sum(amount),0)").Scan(&settled)
	Db.Model(&model.Commission{}).Where("inviter_id = ? and status = ?", user.ID, 0).Select("coalesce(sum(amount),0)").Scan(&pending)
	Db.Model(&model.Withdrawal{}).Where("user_id = ? and status in ?", user.ID, []int{0, 1, 3}).Select("coalesce(sum(amount),0)").Scan(&withdrawn)
	result.Success(c, gin.H{"total_invitee": invitees, "total_commission": settled.Total + pending.Total, "settled_commission": settled.Total, "pending_commission": pending.Total, "withdrawn_amount": withdrawn.Total, "balance_amount": settled.Total - withdrawn.Total})
}

// GetInviteeList 用户分页查询被邀请人
func GetInviteeList(c *gin.Context) {
	user, ok := currentUser(c)
	if !ok {
		result.FailedWithMsg(c, result.NotFound, string(result.SubUserNotFound))
		return
	}
	page, pageSize := pageParams(c)
	query := Db.Model(&model.InviteRelation{}).Where("inviter_id = ?", user.ID)
	var total int64
	var list []model.InviteRelation
	if query.Count(&total).Error != nil || query.Order("id desc").Offset((page-1)*pageSize).Limit(pageSize).Find(&list).Error != nil {
		result.FailedWithMsg(c, result.InternalError, "获取邀请记录失败")
		return
	}
	result.Success(c, pageData(list, total, page, pageSize))
}

// GetUserCommissionList 用户分页查询佣金记录
func GetUserCommissionList(c *gin.Context) {
	user, ok := currentUser(c)
	if !ok {
		result.FailedWithMsg(c, result.NotFound, string(result.SubUserNotFound))
		return
	}
	page, pageSize := pageParams(c)
	query := Db.Model(&model.Commission{}).Where("inviter_id = ?", user.ID)
	var total int64
	var list []model.Commission
	if query.Count(&total).Error != nil || query.Order("id desc").Offset((page-1)*pageSize).Limit(pageSize).Find(&list).Error != nil {
		result.FailedWithMsg(c, result.InternalError, "获取佣金记录失败")
		return
	}
	result.Success(c, pageData(list, total, page, pageSize))
}

// ApplyWithdrawal 用户提交提现申请
func ApplyWithdrawal(c *gin.Context) {
	user, ok := currentUser(c)
	if !ok {
		result.FailedWithMsg(c, result.NotFound, string(result.SubUserNotFound))
		return
	}
	config, err := model.GetOrCreatePromotionConfig(Db)
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "推广配置读取失败")
		return
	}
	amount, _ := strconv.ParseFloat(c.PostForm("amount"), 64)
	method := c.PostForm("method")
	realName := c.PostForm("real_name")
	if amount <= 0 || amount < config.MinWithdrawal {
		result.FailedWithMsg(c, result.BadRequest, "提现金额低于最低要求")
		return
	}
	if (method != "alipay" && method != "wechat" && method != "bank") || realName == "" {
		result.FailedWithMsg(c, result.BadRequest, "提现方式或收款人错误")
		return
	}
	var totals struct{ Settled, Withdrawn float64 }
	Db.Model(&model.Commission{}).Where("inviter_id = ? and status = ?", user.ID, 1).Select("coalesce(sum(amount),0)").Scan(&totals.Settled)
	Db.Model(&model.Withdrawal{}).Where("user_id = ? and status in ?", user.ID, []int{0, 1, 3}).Select("coalesce(sum(amount),0)").Scan(&totals.Withdrawn)
	if totals.Settled-totals.Withdrawn < amount {
		result.FailedWithMsg(c, result.BadRequest, "可提现余额不足")
		return
	}
	withdrawal := model.Withdrawal{UserID: user.ID, Username: user.Username, Amount: amount, Method: method, RealName: realName, AlipayAccount: c.PostForm("alipay_account"), AlipayQrcode: c.PostForm("alipay_qrcode"), WechatAccount: c.PostForm("wechat_account"), WechatQrcode: c.PostForm("wechat_qrcode"), BankCard: c.PostForm("bank_card"), BankPhone: c.PostForm("bank_phone"), CreateTime: utils.HTime{Time: utils.Now()}}
	if Db.Create(&withdrawal).Error != nil {
		result.FailedWithMsg(c, result.InternalError, "提现申请提交失败")
		return
	}
	result.Success(c, withdrawal)
}

// GetUserWithdrawals 用户分页查询提现记录
func GetUserWithdrawals(c *gin.Context) {
	user, ok := currentUser(c)
	if !ok {
		result.FailedWithMsg(c, result.NotFound, string(result.SubUserNotFound))
		return
	}
	page, pageSize := pageParams(c)
	query := Db.Model(&model.Withdrawal{}).Where("user_id = ?", user.ID)
	var total int64
	var list []model.Withdrawal
	if query.Count(&total).Error != nil || query.Order("id desc").Offset((page-1)*pageSize).Limit(pageSize).Find(&list).Error != nil {
		result.FailedWithMsg(c, result.InternalError, "获取提现记录失败")
		return
	}
	result.Success(c, pageData(list, total, page, pageSize))
}

// AdminInviteRelations 管理员分页查看邀请关系
func AdminInviteRelations(c *gin.Context) {
	page, pageSize := pageParams(c)
	query := Db.Model(&model.InviteRelation{})
	if username := c.Query("inviter_name"); username != "" {
		query = query.Where("inviter_name like ?", "%"+username+"%")
	}
	var total int64
	var list []model.InviteRelation
	if query.Count(&total).Error != nil || query.Order("id desc").Offset((page-1)*pageSize).Limit(pageSize).Find(&list).Error != nil {
		result.FailedWithMsg(c, result.InternalError, "获取邀请关系失败")
		return
	}
	result.Success(c, pageData(list, total, page, pageSize))
}

// AdminCommissionList 管理员分页查看佣金记录
func AdminCommissionList(c *gin.Context) {
	page, pageSize := pageParams(c)
	query := Db.Model(&model.Commission{})
	if status := c.Query("status"); status != "" {
		statusValue, _ := strconv.Atoi(status)
		query = query.Where("status = ?", statusValue)
	}
	var total int64
	var list []model.Commission
	if query.Count(&total).Error != nil || query.Order("id desc").Offset((page-1)*pageSize).Limit(pageSize).Find(&list).Error != nil {
		result.FailedWithMsg(c, result.InternalError, "获取佣金记录失败")
		return
	}
	result.Success(c, pageData(list, total, page, pageSize))
}

// AdminWithdrawals 管理员分页查看提现申请
func AdminWithdrawals(c *gin.Context) {
	page, pageSize := pageParams(c)
	query := Db.Model(&model.Withdrawal{})
	if status := c.Query("status"); status != "" {
		statusValue, _ := strconv.Atoi(status)
		query = query.Where("status = ?", statusValue)
	}
	if username := c.Query("username"); username != "" {
		query = query.Where("username like ?", "%"+username+"%")
	}
	var total int64
	var list []model.Withdrawal
	if query.Count(&total).Error != nil || query.Order("id desc").Offset((page-1)*pageSize).Limit(pageSize).Find(&list).Error != nil {
		result.FailedWithMsg(c, result.InternalError, "获取提现申请失败")
		return
	}
	result.Success(c, pageData(list, total, page, pageSize))
}

// AdminPromotionUsers 管理员分页查看推广申请
func AdminPromotionUsers(c *gin.Context) {
	page, pageSize := pageParams(c)
	query := Db.Model(&model.Promotion{})
	if status := c.Query("status"); status != "" {
		statusValue, _ := strconv.Atoi(status)
		query = query.Where("status = ?", statusValue)
	}
	var total int64
	var list []model.Promotion
	if query.Count(&total).Error != nil || query.Order("id desc").Offset((page-1)*pageSize).Limit(pageSize).Find(&list).Error != nil {
		result.FailedWithMsg(c, result.InternalError, "获取推广用户失败")
		return
	}
	result.Success(c, pageData(list, total, page, pageSize))
}

// ReviewWithdrawal 管理员审核提现申请，状态按待审通过或拒绝流转
func ReviewWithdrawal(c *gin.Context) {
	id, _ := strconv.Atoi(c.PostForm("id"))
	action := c.PostForm("action")
	reason := c.PostForm("reason")
	if id <= 0 || (action != "approve" && action != "reject" && action != "paid") {
		result.FailedWithMsg(c, result.BadRequest, string(result.SubMissingParam))
		return
	}
	var withdrawal model.Withdrawal
	if Db.First(&withdrawal, id).Error != nil {
		result.FailedWithMsg(c, result.NotFound, "提现申请不存在")
		return
	}
	nextStatus := map[string]int{"approve": 1, "reject": 2, "paid": 3}[action]
	if nextStatus == 3 && withdrawal.Status != 1 || withdrawal.Status >= nextStatus {
		result.FailedWithMsg(c, result.BadRequest, "当前状态不允许审核")
		return
	}
	updates := map[string]any{"status": nextStatus, "review_time": utils.HTime{Time: utils.Now()}}
	if reason != "" {
		updates["reject_reason"] = reason
	}
	if Db.Model(&model.Withdrawal{}).Where("id = ?", id).Updates(updates).Error != nil {
		result.FailedWithMsg(c, result.InternalError, string(result.UpdateError))
		return
	}
	result.Success(c, true)
}

// AdminUserStat 输出用户统计信息
func AdminUserStat(c *gin.Context) {
	var total, active, banned int64
	Db.Model(&model.User{}).Count(&total)
	Db.Model(&model.User{}).Where("status = ?", 1).Count(&active)
	Db.Model(&model.User{}).Where("status = ?", 2).Count(&banned)
	result.Success(c, gin.H{"total": total, "active": active, "banned": banned})
}

// UpdateUserEmail 用户使用邮箱验证码更换绑定邮箱
func UpdateUserEmail(c *gin.Context) {
	user, ok := currentUser(c)
	if !ok {
		result.FailedWithMsg(c, result.NotFound, string(result.SubUserNotFound))
		return
	}
	oldEmail := c.PostForm("email")
	newEmail := c.PostForm("new_email")
	code := c.PostForm("code")
	if oldEmail != user.Email || !utils.IsValidEmail(newEmail) {
		result.FailedWithMsg(c, result.BadRequest, "邮箱信息错误")
		return
	}
	if !VerifyEmailCode(c, Db, oldEmail, code) {
		return
	}
	if Db.Model(&model.User{}).Where("id = ?", user.ID).Update("email", newEmail).Error != nil {
		result.FailedWithMsg(c, result.InternalError, string(result.UpdateError))
		return
	}
	result.Success(c, true)
}

// getRealNameConfig 获取实名认证配置，首次访问时固定创建 ID=1 的配置记录。
func getRealNameConfig() (*model.RealNameConfig, error) {
	var config model.RealNameConfig
	if err := Db.First(&config, 1).Error; err == nil {
		return &config, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	config = model.RealNameConfig{ID: 1, Channel: "alipay", ProviderType: "official", Status: false}
	// 兼容原有支付宝实名配置：首次迁移时自动复制旧表数据，不改变原有认证流程。
	var legacy model.AlipayConfig
	if err := Db.First(&legacy, 1).Error; err == nil {
		config.AppID = legacy.AppID
		config.PrivateKey = legacy.PrivateKey
		config.PublicKey = legacy.AliPublicKey
		config.RedirectURI = legacy.RedirectURI
		config.Status = legacy.Status
	}
	if err := Db.Create(&config).Error; err != nil {
		return nil, err
	}
	return &config, nil
}

// realNameConfigView 返回实名认证配置展示数据，敏感内容只返回是否已配置。
func realNameConfigView(config *model.RealNameConfig) gin.H {
	return gin.H{
		"id":                           config.ID,
		"channel":                      config.Channel,
		"app_id":                       config.AppID,
		"secret_configured":            config.Secret != "",
		"private_key_configured":       config.PrivateKey != "",
		"public_key_configured":        config.PublicKey != "",
		"redirect_uri":                 config.RedirectURI,
		"rule_id":                      config.RuleID,
		"status":                       config.Status,
		"provider_type":                config.ProviderType,
		"ginapi_base_url":              config.GinapiBaseURL,
		"ginapi_app_key":               config.GinapiAppKey,
		"ginapi_app_secret_configured": config.GinapiAppSecret != "",
		"ginapi_app_slug":              config.GinapiAppSlug,
	}
}

// GetRealNameConfig 获取管理员实名认证配置。
func GetRealNameConfig(c *gin.Context) {
	config, err := getRealNameConfig()
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "获取实名配置失败")
		return
	}
	result.Success(c, realNameConfigView(config))
}

// UpdateRealNameConfig 更新管理员实名认证配置，敏感字段留空时保留数据库原值。
func UpdateRealNameConfig(c *gin.Context) {
	config, err := getRealNameConfig()
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "获取实名配置失败")
		return
	}

	var dto model.RealNameConfig
	if err := c.ShouldBind(&dto); err != nil {
		result.FailedWithMsg(c, result.BadRequest, "实名配置参数错误")
		return
	}

	channel := strings.ToLower(strings.TrimSpace(dto.Channel))
	if channel == "" {
		channel = config.Channel
	}
	switch channel {
	case "alipay", "aliyun", "tencent", "mobile_three":
	default:
		result.FailedWithMsg(c, result.BadRequest, "实名认证渠道错误")
		return
	}

	providerType := strings.ToLower(strings.TrimSpace(dto.ProviderType))
	if providerType == "" {
		providerType = config.ProviderType
	}
	if providerType == "" {
		providerType = "official"
	}
	if providerType != "official" && providerType != "ginapi" {
		result.FailedWithMsg(c, result.BadRequest, "实名认证服务类型错误")
		return
	}

	updates := map[string]any{
		"channel":       channel,
		"provider_type": providerType,
	}
	if value := strings.TrimSpace(dto.AppID); value != "" {
		updates["app_id"] = value
	}
	if value := strings.TrimSpace(dto.Secret); value != "" {
		updates["secret"] = value
	}
	if value := strings.TrimSpace(dto.PrivateKey); value != "" {
		updates["private_key"] = value
	}
	if value := strings.TrimSpace(dto.PublicKey); value != "" {
		updates["public_key"] = value
	}
	if value, exists := c.GetPostForm("redirect_uri"); exists {
		updates["redirect_uri"] = strings.TrimSpace(value)
	}
	if value, exists := c.GetPostForm("rule_id"); exists {
		updates["rule_id"] = strings.TrimSpace(value)
	}
	if value := strings.TrimSpace(dto.GinapiBaseURL); value != "" {
		updates["ginapi_base_url"] = strings.TrimRight(value, "/")
	}
	if value := strings.TrimSpace(dto.GinapiAppKey); value != "" {
		updates["ginapi_app_key"] = value
	}
	if value := strings.TrimSpace(dto.GinapiAppSecret); value != "" {
		updates["ginapi_app_secret"] = value
	}
	if value := strings.TrimSpace(dto.GinapiAppSlug); value != "" {
		updates["ginapi_app_slug"] = value
	}
	if _, exists := c.GetPostForm("status"); exists {
		updates["status"] = dto.Status
	}

	if err := Db.Model(&model.RealNameConfig{}).Where("id = ?", 1).Updates(updates).Error; err != nil {
		result.FailedWithMsg(c, result.InternalError, "实名配置保存失败")
		return
	}

	// 支付宝官方认证仍沿用原有支付宝表和认证流程，统一配置只作为管理入口。
	if channel == "alipay" && providerType == "official" {
		var legacy model.AlipayConfig
		if err := Db.First(&legacy, 1).Error; errors.Is(err, gorm.ErrRecordNotFound) {
			legacy = model.AlipayConfig{ID: 1, ServerURL: "https://openapi.alipay.com/gateway.do", SignType: "RSA2", Charset: "utf-8", Format: "JSON"}
			if err := Db.Create(&legacy).Error; err != nil {
				result.FailedWithMsg(c, result.InternalError, "支付宝配置保存失败")
				return
			}
		} else if err != nil {
			result.FailedWithMsg(c, result.InternalError, "支付宝配置读取失败")
			return
		}
		legacyUpdates := map[string]any{}
		if _, exists := c.GetPostForm("status"); exists {
			legacyUpdates["status"] = dto.Status
		}
		if value := strings.TrimSpace(dto.AppID); value != "" {
			legacyUpdates["app_id"] = value
		}
		if value := strings.TrimSpace(dto.PrivateKey); value != "" {
			legacyUpdates["private_key"] = value
		}
		if value := strings.TrimSpace(dto.PublicKey); value != "" {
			legacyUpdates["alipay_public_key"] = value
		}
		if value, exists := c.GetPostForm("redirect_uri"); exists {
			legacyUpdates["redirect_uri"] = strings.TrimSpace(value)
		}
		if err := Db.Model(&model.AlipayConfig{}).Where("id = ?", 1).Updates(legacyUpdates).Error; err != nil {
			result.FailedWithMsg(c, result.InternalError, "支付宝配置同步失败")
			return
		}
	}

	result.Success(c, true)
}
