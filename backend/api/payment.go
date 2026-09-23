package api

import (
	"crypto/md5"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"

	. "ginblog/core"
	"ginblog/model"
	"ginblog/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// paymentInfo 是返回给前端的在线支付跳转信息。
type paymentInfo struct {
	Method string `json:"method"`
	PayURL string `json:"payurl"`
	URL    string `json:"url"`
}

// loadEnabledEpayConfig 读取指定支付渠道已启用的易支付配置。
func loadEnabledEpayConfig(channel string) (model.PaymentConfig, error) {
	var config model.PaymentConfig
	if channel != "alipay" && channel != "wxpay" {
		return config, errors.New("不支持的支付方式")
	}
	if err := Db.Where("channel = ? AND enabled = ?", channel, true).First(&config).Error; err != nil {
		return config, errors.New("支付通道暂不可用")
	}
	if config.Method != "epay" {
		return config, errors.New("当前支付通道仅支持易支付接入，请在管理员支付配置中选择易支付并填写商户信息")
	}
	if strings.TrimSpace(config.EpayPayUrl) == "" || strings.TrimSpace(config.EpayPid) == "" || strings.TrimSpace(config.EpayPayKey) == "" {
		return config, errors.New("支付通道尚未完成易支付商户配置")
	}
	if strings.TrimSpace(config.NotifyURL) == "" || strings.TrimSpace(config.ReturnURL) == "" {
		return config, errors.New("请在管理员支付配置中填写公网可访问的异步通知地址和同步跳转地址")
	}
	return config, nil
}

// buildEpayPaymentInfo 按易支付协议生成浏览器可打开的支付地址。
func buildEpayPaymentInfo(config model.PaymentConfig, tradeNo, payWay, name string, amount float64) (paymentInfo, error) {
	params := map[string]string{
		"pid":          strings.TrimSpace(config.EpayPid),
		"type":         payWay,
		"out_trade_no": tradeNo,
		"notify_url":   strings.TrimSpace(config.NotifyURL),
		"return_url":   strings.TrimSpace(config.ReturnURL),
		"name":         name,
		"money":        fmt.Sprintf("%.2f", amount),
		"sign_type":    "MD5",
	}
	params["sign"] = calculateEpaySign(params, config.EpayPayKey)
	payURL, err := buildEpaySubmitURL(config.EpayPayUrl, params)
	if err != nil {
		return paymentInfo{}, err
	}
	return paymentInfo{Method: "GET", PayURL: payURL, URL: payURL}, nil
}

// buildEpaySubmitURL 统一将易支付基础地址转换为 submit.php 页面支付地址。
func buildEpaySubmitURL(baseURL string, params map[string]string) (string, error) {
	endpoint, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil || endpoint.Scheme == "" || endpoint.Host == "" || (endpoint.Scheme != "http" && endpoint.Scheme != "https") {
		return "", errors.New("易支付接口地址格式不正确")
	}
	path := strings.TrimRight(endpoint.Path, "/")
	lowerPath := strings.ToLower(path)
	for _, suffix := range []string{"/submit.php", "/mapi.php", "/api.php"} {
		if strings.HasSuffix(lowerPath, suffix) {
			path = path[:len(path)-len(suffix)]
			break
		}
	}
	endpoint.Path = strings.TrimRight(path, "/") + "/submit.php"
	endpoint.RawPath = ""
	endpoint.RawQuery = ""
	endpoint.Fragment = ""
	query := url.Values{}
	for key, value := range params {
		query.Set(key, value)
	}
	endpoint.RawQuery = query.Encode()
	return endpoint.String(), nil
}

// calculateEpaySign 生成或校验易支付 MD5 签名。
func calculateEpaySign(params map[string]string, key string) string {
	keys := make([]string, 0, len(params))
	for name, value := range params {
		if name != "sign" && name != "sign_type" && value != "" {
			keys = append(keys, name)
		}
	}
	sort.Strings(keys)
	items := make([]string, 0, len(keys))
	for _, name := range keys {
		items = append(items, name+"="+params[name])
	}
	digest := md5.Sum([]byte(strings.Join(items, "&") + key))
	return hex.EncodeToString(digest[:])
}

// readPaymentParams 同时兼容易支付的 GET 回跳和 POST 异步通知参数。
func readPaymentParams(c *gin.Context) map[string]string {
	_ = c.Request.ParseForm()
	params := make(map[string]string, len(c.Request.Form))
	for name, values := range c.Request.Form {
		if len(values) > 0 {
			params[name] = values[0]
		}
	}
	return params
}

// settleEpayPayment 校验回调后以事务方式完成余额充值或文章解锁。
func settleEpayPayment(params map[string]string) error {
	tradeNo := strings.TrimSpace(params["out_trade_no"])
	payWay := strings.TrimSpace(params["type"])
	if tradeNo == "" || (payWay != "alipay" && payWay != "wxpay") || strings.TrimSpace(params["sign"]) == "" {
		return errors.New("支付回调参数不完整")
	}

	var payOrder model.PayOrder
	if err := Db.Where("trade_no = ?", tradeNo).First(&payOrder).Error; err != nil {
		return errors.New("支付订单不存在")
	}
	if payOrder.PayType != payWay {
		return errors.New("支付渠道与订单不一致")
	}

	var config model.PaymentConfig
	if err := Db.Where("channel = ? AND method = ?", payWay, "epay").First(&config).Error; err != nil {
		return errors.New("支付配置不存在")
	}
	if pid := strings.TrimSpace(params["pid"]); pid == "" || pid != strings.TrimSpace(config.EpayPid) {
		return errors.New("支付商户信息不匹配")
	}
	if calculateEpaySign(params, config.EpayPayKey) != strings.ToLower(strings.TrimSpace(params["sign"])) {
		return errors.New("支付签名校验失败")
	}
	amount, err := strconv.ParseFloat(strings.TrimSpace(params["money"]), 64)
	if err != nil || amount <= 0 || math.Abs(amount-payOrder.Money) > 0.001 {
		return errors.New("支付金额校验失败")
	}

	return Db.Transaction(func(tx *gorm.DB) error {
		var lockedOrder model.PayOrder
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("trade_no = ?", tradeNo).First(&lockedOrder).Error; err != nil {
			return err
		}
		if lockedOrder.Status {
			return nil
		}
		now := utils.HTime{Time: utils.Now()}
		thirdTradeNo := strings.TrimSpace(params["trade_no"])
		switch lockedOrder.Type {
		case "recharge":
			if err := settleRechargeOrder(tx, lockedOrder, thirdTradeNo, now); err != nil {
				return err
			}
		case "article":
			if err := settleArticlePurchase(tx, lockedOrder, now); err != nil {
				return err
			}
		default:
			return errors.New("暂不支持该支付订单类型")
		}
		return tx.Model(&model.PayOrder{}).Where("id = ?", lockedOrder.ID).Updates(map[string]any{"status": true, "pay_time": now}).Error
	})
}

// settleRechargeOrder 将已验签的充值订单金额计入用户余额。
func settleRechargeOrder(tx *gorm.DB, payOrder model.PayOrder, thirdTradeNo string, now utils.HTime) error {
	var order model.RechargeOrder
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("trade_no = ?", payOrder.TradeNo).First(&order).Error; err != nil {
		return err
	}
	if order.Status {
		return nil
	}
	var user model.User
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, order.UserID).Error; err != nil {
		return err
	}
	user.Money = roundArticleMoney(user.Money + order.Amount)
	if err := tx.Model(&model.User{}).Where("id = ?", user.ID).Update("money", user.Money).Error; err != nil {
		return err
	}
	return tx.Model(&model.RechargeOrder{}).Where("id = ?", order.ID).Updates(map[string]any{"status": true, "third_trade_no": thirdTradeNo, "pay_time": now}).Error
}

// settleArticlePurchase 将已验签的文章订单解锁，并按推广配置创建返佣记录。
func settleArticlePurchase(tx *gorm.DB, payOrder model.PayOrder, now utils.HTime) error {
	var purchase model.ArticlePurchase
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("trade_no = ?", payOrder.TradeNo).First(&purchase).Error; err != nil {
		return err
	}
	if purchase.Status {
		return nil
	}
	var user model.User
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, purchase.UserID).Error; err != nil {
		return err
	}
	if err := tx.Model(&model.ArticlePurchase{}).Where("id = ?", purchase.ID).Updates(map[string]any{"status": true, "pay_time": now}).Error; err != nil {
		return err
	}

	promotionConfig, err := model.GetOrCreatePromotionConfig(tx)
	if err != nil || !promotionConfig.Status || purchase.Amount <= 0 {
		return err
	}
	var relation model.InviteRelation
	if err := tx.Where("invitee_id = ? AND inviter_id <> ?", user.ID, user.ID).First(&relation).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	rebateRate := articleRoleRebateRate(tx, relation.InviterID)
	commissionAmount := roundArticleMoney(purchase.Amount * rebateRate / 100)
	if rebateRate <= 0 || commissionAmount <= 0 {
		return nil
	}
	commissionStatus := 0
	var settleTime *utils.HTime
	if promotionConfig.CommissionSettleDays <= 0 {
		commissionStatus = 1
		settledAt := now
		settleTime = &settledAt
	}
	commission := model.Commission{
		InviterID:   relation.InviterID,
		InviterName: relation.InviterName,
		InviteeID:   user.ID,
		InviteeName: user.Username,
		OrderNo:     payOrder.TradeNo,
		OrderAmount: purchase.Amount,
		RebateRate:  rebateRate,
		Amount:      commissionAmount,
		Status:      commissionStatus,
		SettleTime:  settleTime,
		CreateTime:  now,
	}
	return tx.Create(&commission).Error
}

// HandleEpayNotify 接收易支付服务器异步通知，并返回约定的 success 或 fail。
func HandleEpayNotify(c *gin.Context) {
	if err := settleEpayPayment(readPaymentParams(c)); err != nil {
		c.String(http.StatusBadRequest, "fail")
		return
	}
	c.String(http.StatusOK, "success")
}

// buildPaymentFrontendRedirect 根据支付订单类型生成前端回跳地址。
func buildPaymentFrontendRedirect(tradeNo string, success bool, message string) (string, error) {
	targetPath := "/user/recharge"
	var payOrder model.PayOrder
	if err := Db.Where("trade_no = ?", tradeNo).First(&payOrder).Error; err == nil {
		switch payOrder.Type {
		case "article":
			var purchase model.ArticlePurchase
			if err := Db.Where("trade_no = ?", tradeNo).First(&purchase).Error; err != nil {
				return "", fmt.Errorf("查询文章购买订单失败: %w", err)
			}
			targetPath = fmt.Sprintf("/articles/%d", purchase.ArticleID)
		case "recharge":
			targetPath = "/user/recharge"
		}
	}

	query := url.Values{}
	if success {
		query.Set("payment", "success")
	} else {
		query.Set("payment", "failed")
	}
	if tradeNo != "" {
		query.Set("trade_no", tradeNo)
	}
	if !success && strings.TrimSpace(message) != "" {
		query.Set("message", message)
	}
	return targetPath + "?" + query.Encode(), nil
}

// HandleEpayReturn 处理易支付浏览器同步回跳、并跳转到对应的前端业务页面。
func HandleEpayReturn(c *gin.Context) {
	params := readPaymentParams(c)
	tradeNo := strings.TrimSpace(params["out_trade_no"])
	if err := settleEpayPayment(params); err != nil {
		target, targetErr := buildPaymentFrontendRedirect(tradeNo, false, "支付校验失败："+err.Error())
		if targetErr == nil {
			c.Redirect(http.StatusFound, target)
			return
		}
		c.String(http.StatusBadRequest, "支付校验失败，请返回网站查看订单状态。")
		return
	}
	target, err := buildPaymentFrontendRedirect(tradeNo, true, "")
	if err != nil {
		c.String(http.StatusInternalServerError, "支付成功，但前端回跳地址配置不正确。")
		return
	}
	c.Redirect(http.StatusFound, target)
}
