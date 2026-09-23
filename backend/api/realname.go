package api

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	. "ginblog/core"
	"ginblog/global"
	"ginblog/model"
	"ginblog/result"
	"ginblog/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	realNameChannelAlipay = "alipay"
	realNameChannelGinAPI = "ginapi"
)

var (
	realNamePhonePattern  = regexp.MustCompile(`^1[3-9]\d{9}$`)
	realNameEmailPattern  = regexp.MustCompile(`^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$`)
	realNameIDCardPattern = regexp.MustCompile(`^\d{17}[\dXx]$`)
)

type realNameRequest struct {
	RealName string `form:"real_name"`
	IDCard   string `form:"id_card"`
	Account  string `form:"account"`
}

type ginAPIResponse struct {
	Code int            `json:"code"`
	Msg  string         `json:"msg"`
	Data map[string]any `json:"data"`
}

// GetUserRealNameInfo 返回当前用户的实名认证信息，认证状态以用户实名布尔字段为准。
func GetUserRealNameInfo(c *gin.Context) {
	user, ok := currentUser(c)
	if !ok {
		result.FailedWithMsg(c, result.NotFound, string(result.SubUserNotFound))
		return
	}

	var record model.UserRealNameAuth
	err := Db.Where("user_id = ?", user.ID).Order("id desc").First(&record).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		result.Success(c, gin.H{"verify_status": false})
		return
	}
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "获取实名信息失败")
		return
	}

	if record.Channel == realNameChannelGinAPI && !user.RealNameAuth && record.OutTradeNo != "" {
		updatedRecord, syncErr := syncGinAPIRealNameStatus(user.ID, record)
		if syncErr != nil {
			global.Log.Warnf("同步 GinApi 实名状态失败：%v", syncErr)
		} else {
			record = updatedRecord
			if record.VerifyStatus {
				user.RealNameAuth = true
			}
		}
	}

	verified := user.RealNameAuth && record.VerifyStatus
	verifyMessage := record.VerifyMessage
	if !verified && verifyMessage == "已提交" {
		verifyMessage = ""
	}
	result.Success(c, gin.H{
		"real_name":     utils.DesensitizeRealName(record.RealName),
		"id_card":       utils.DesensitizeIDCard(record.IDCard),
		"account":       utils.DesensitizeEmail(record.Account),
		"channel":       record.Channel,
		"verify_status": verified,
		"verify_msg":    verifyMessage,
		"create_time":   record.CreateTime,
		"update_time":   record.UpdateTime,
	})
}

// StartUserRealNameVerification 保存待认证记录并发起实名认证，不会直接将用户标记为已实名。
func StartUserRealNameVerification(c *gin.Context) {
	user, ok := currentUser(c)
	if !ok {
		result.FailedWithMsg(c, result.NotFound, string(result.SubUserNotFound))
		return
	}
	if user.RealNameAuth {
		result.FailedWithMsg(c, result.BadRequest, "已完成实名认证")
		return
	}

	request := realNameRequest{
		RealName: strings.TrimSpace(c.PostForm("real_name")),
		IDCard:   strings.ToUpper(strings.TrimSpace(c.PostForm("id_card"))),
		Account:  strings.TrimSpace(c.PostForm("account")),
	}
	if err := validateRealNameRequest(request); err != nil {
		result.FailedWithMsg(c, result.BadRequest, err.Error())
		return
	}

	config, err := getRealNameConfig()
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "获取实名配置失败")
		return
	}
	if !config.Status {
		result.FailedWithMsg(c, result.BadRequest, "实名认证服务未开启")
		return
	}

	providerType := strings.ToLower(strings.TrimSpace(config.ProviderType))
	if providerType == "" {
		providerType = "official"
	}
	switch providerType {
	case "official":
		if strings.ToLower(strings.TrimSpace(config.Channel)) != realNameChannelAlipay {
			result.FailedWithMsg(c, result.BadRequest, "当前实名认证渠道暂不支持用户自助认证")
			return
		}
		authURL, verifyID, err := startOfficialAlipayRealName(config, user, request)
		if err != nil {
			result.FailedWithMsg(c, result.BadRequest, err.Error())
			return
		}
		result.Success(c, gin.H{"verify_id": verifyID, "verify_status": false, "provider_type": providerType, "auth_url": authURL, "alipay_auth_url": authURL})
	case "ginapi":
		authURL, verifyID, err := startGinAPIRealName(config, user, request)
		if err != nil {
			result.FailedWithMsg(c, result.BadRequest, err.Error())
			return
		}
		result.Success(c, gin.H{"verify_id": verifyID, "verify_status": false, "provider_type": providerType, "auth_url": authURL, "alipay_auth_url": authURL})
	default:
		result.FailedWithMsg(c, result.BadRequest, "实名认证服务类型错误")
	}
}

// HandleAliPayRealNameCallback 接收支付宝实名认证回调，并在支付宝确认通过后同步用户实名布尔字段。
func HandleAliPayRealNameCallback(c *gin.Context) {
	verifyID := strings.TrimSpace(c.Query("cert_verify_id"))
	authCode := strings.TrimSpace(c.Query("auth_code"))
	if verifyID == "" || authCode == "" {
		renderRealNameCallback(c, false, "认证参数不完整", "请返回网站后重新发起支付宝实名认证。")
		return
	}

	var record model.UserRealNameAuth
	if err := Db.Where("out_trade_no = ? AND channel = ?", verifyID, realNameChannelAlipay).First(&record).Error; err != nil {
		renderRealNameCallback(c, false, "实名认证请求不存在", "请返回网站后重新发起实名认证。")
		return
	}
	if record.VerifyStatus {
		renderRealNameCallback(c, true, "实名认证成功", "该实名认证请求已经处理完成。")
		return
	}

	config, err := getRealNameConfig()
	if err != nil {
		renderRealNameCallback(c, false, "读取实名配置失败", "请稍后返回网站查询认证状态。")
		return
	}
	passed, verifyMessage, err := consultOfficialAlipayRealName(config, verifyID, authCode)
	if err != nil {
		global.Log.Errorf("支付宝实名认证回调处理失败：%v", err)
		renderRealNameCallback(c, false, "实名认证结果查询失败", "请稍后返回网站查询认证状态。")
		return
	}

	if err := finishUserRealNameVerification(record, passed, verifyMessage); err != nil {
		global.Log.Errorf("保存实名认证回调结果失败：%v", err)
		renderRealNameCallback(c, false, "保存认证结果失败", "请稍后返回网站查询认证状态。")
		return
	}
	if passed {
		renderRealNameCallback(c, true, "实名认证成功", "认证结果已同步，返回用户中心即可查看。")
		return
	}
	renderRealNameCallback(c, false, "实名认证未通过", verifyMessage)
}

// validateRealNameRequest 校验实名认证请求中用户可控的基础字段。
func validateRealNameRequest(request realNameRequest) error {
	if request.RealName == "" || request.IDCard == "" || request.Account == "" {
		return errors.New("请完整填写实名认证信息")
	}
	if !realNameIDCardPattern.MatchString(request.IDCard) {
		return errors.New("身份证号码格式不正确")
	}
	if strings.ContainsFunc(request.Account, func(r rune) bool { return r >= 0x4E00 && r <= 0x9FFF }) {
		return errors.New("支付宝账号不能输入中文")
	}
	if !realNamePhonePattern.MatchString(request.Account) && !realNameEmailPattern.MatchString(request.Account) {
		return errors.New("支付宝账号格式不正确")
	}
	return nil
}

// startOfficialAlipayRealName 调用支付宝预咨询接口并保存待认证记录。
func startOfficialAlipayRealName(config *model.RealNameConfig, user model.User, request realNameRequest) (string, string, error) {
	if strings.TrimSpace(config.AppID) == "" || strings.TrimSpace(config.PrivateKey) == "" || strings.TrimSpace(config.RedirectURI) == "" {
		return "", "", errors.New("支付宝实名认证配置不完整")
	}
	privateKey, err := parseAlipayPrivateKey(config.PrivateKey)
	if err != nil {
		return "", "", errors.New("支付宝应用私钥格式错误")
	}

	bizContent, _ := json.Marshal(map[string]string{
		"user_name": request.RealName,
		"cert_type": "IDENTITY_CARD",
		"cert_no":   request.IDCard,
		"logon_id":  request.Account,
	})
	params := map[string]string{
		"app_id":      config.AppID,
		"method":      "alipay.user.certdoc.certverify.preconsult",
		"format":      alipayFormat(config),
		"charset":     "utf-8",
		"sign_type":   "RSA2",
		"timestamp":   time.Now().Format("2006-01-02 15:04:05"),
		"version":     "1.0",
		"biz_content": string(bizContent),
	}
	if err := signAlipayParams(params, privateKey); err != nil {
		return "", "", errors.New("支付宝请求签名失败")
	}

	payload, err := postAlipayForm(alipayGatewayURL(config), params)
	if err != nil {
		return "", "", errors.New("请求支付宝实名认证服务失败")
	}
	response, ok := payload["alipay_user_certdoc_certverify_preconsult_response"].(map[string]any)
	if !ok || stringValue(response, "code") != "10000" {
		return "", "", errors.New("支付宝实名认证预咨询失败")
	}
	verifyID := stringValue(response, "verify_id")
	if verifyID == "" {
		return "", "", errors.New("支付宝实名认证预咨询未返回认证标识")
	}

	record := model.UserRealNameAuth{
		UserID:        user.ID,
		Channel:       realNameChannelAlipay,
		RealName:      request.RealName,
		IDCard:        request.IDCard,
		Account:       request.Account,
		VerifyStatus:  false,
		VerifyMessage: "",
		OutTradeNo:    verifyID,
		CreateTime:    utils.HTime{Time: utils.Now()},
	}
	if err := savePendingRealNameRecord(record); err != nil {
		return "", "", errors.New("保存实名认证请求失败")
	}
	if err := Db.Model(&model.User{}).Where("id = ?", user.ID).Update("real_name_auth", false).Error; err != nil {
		return "", "", errors.New("更新用户实名状态失败")
	}

	authURL := "https://openauth.alipay.com/oauth2/publicAppAuthorize.htm?app_id=" + url.QueryEscape(config.AppID) +
		"&scope=id_verify&redirect_uri=" + url.QueryEscape(config.RedirectURI) +
		"&cert_verify_id=" + url.QueryEscape(verifyID)
	return authURL, verifyID, nil
}

// startGinAPIRealName 调用 GinApi 开放实名认证接口并保存待认证记录。
func startGinAPIRealName(config *model.RealNameConfig, user model.User, request realNameRequest) (string, string, error) {
	if strings.TrimSpace(config.GinapiBaseURL) == "" || strings.TrimSpace(config.GinapiAppKey) == "" || strings.TrimSpace(config.GinapiAppSecret) == "" || strings.TrimSpace(config.GinapiAppSlug) == "" {
		return "", "", errors.New("GinApi 实名认证配置不完整")
	}
	form := url.Values{}
	form.Set("real_name", request.RealName)
	form.Set("id_card", request.IDCard)
	form.Set("alipay_account", request.Account)
	response, err := callGinAPI(config, http.MethodPost, "/verify", form)
	if err != nil {
		return "", "", err
	}
	if response.Code != http.StatusOK {
		return "", "", responseError(response, "GinApi 发起实名认证失败")
	}
	verifyID := stringValue(response.Data, "verify_id")
	authURL := stringValue(response.Data, "alipay_auth_url")
	if verifyID == "" || authURL == "" {
		return "", "", errors.New("GinApi 未返回认证跳转地址")
	}

	record := model.UserRealNameAuth{
		UserID:        user.ID,
		Channel:       realNameChannelGinAPI,
		RealName:      request.RealName,
		IDCard:        request.IDCard,
		Account:       request.Account,
		VerifyStatus:  false,
		VerifyMessage: "",
		OutTradeNo:    verifyID,
		CreateTime:    utils.HTime{Time: utils.Now()},
	}
	if err := savePendingRealNameRecord(record); err != nil {
		return "", "", errors.New("保存实名认证请求失败")
	}
	if err := Db.Model(&model.User{}).Where("id = ?", user.ID).Update("real_name_auth", false).Error; err != nil {
		return "", "", errors.New("更新用户实名状态失败")
	}
	return authURL, verifyID, nil
}

// syncGinAPIRealNameStatus 查询 GinApi 的实名认证结果，并把通过状态写回 GinBlog 用户字段。
func syncGinAPIRealNameStatus(userID uint, record model.UserRealNameAuth) (model.UserRealNameAuth, error) {
	config, err := getRealNameConfig()
	if err != nil {
		return record, err
	}
	if strings.ToLower(strings.TrimSpace(config.ProviderType)) != "ginapi" {
		return record, nil
	}
	response, err := callGinAPI(config, http.MethodGet, "/verify/status", url.Values{"verify_id": []string{record.OutTradeNo}})
	if err != nil {
		return record, err
	}
	if response.Code != http.StatusOK {
		return record, responseError(response, "GinApi 实名状态查询失败")
	}

	status := strings.ToLower(strings.TrimSpace(stringValue(response.Data, "status")))
	verifyMessage := strings.TrimSpace(stringValue(response.Data, "verify_message"))
	switch status {
	case "success":
		if err := Db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&model.UserRealNameAuth{}).Where("id = ?", record.ID).Updates(map[string]any{"verify_status": true, "verify_message": verifyMessage}).Error; err != nil {
				return err
			}
			return tx.Model(&model.User{}).Where("id = ?", userID).Update("real_name_auth", true).Error
		}); err != nil {
			return record, err
		}
		record.VerifyStatus = true
		record.VerifyMessage = verifyMessage
	case "failed":
		if verifyMessage == "" {
			verifyMessage = "实名认证未通过"
		}
		if err := Db.Model(&model.UserRealNameAuth{}).Where("id = ?", record.ID).Updates(map[string]any{"verify_status": false, "verify_message": verifyMessage}).Error; err != nil {
			return record, err
		}
		record.VerifyStatus = false
		record.VerifyMessage = verifyMessage
	}
	return record, nil
}

// savePendingRealNameRecord 使用用户唯一记录更新策略保存一次待认证请求。
func savePendingRealNameRecord(record model.UserRealNameAuth) error {
	var existing model.UserRealNameAuth
	err := Db.Where("user_id = ?", record.UserID).First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return Db.Create(&record).Error
	}
	if err != nil {
		return err
	}
	return Db.Model(&model.UserRealNameAuth{}).Where("id = ?", existing.ID).Updates(map[string]any{
		"channel":        record.Channel,
		"real_name":      record.RealName,
		"id_card":        record.IDCard,
		"account":        record.Account,
		"verify_status":  false,
		"verify_message": "",
		"out_trade_no":   record.OutTradeNo,
	}).Error
}

// finishUserRealNameVerification 在同一事务中更新实名记录和用户实名布尔字段。
func finishUserRealNameVerification(record model.UserRealNameAuth, passed bool, verifyMessage string) error {
	return Db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.UserRealNameAuth{}).Where("id = ?", record.ID).Updates(map[string]any{"verify_status": passed, "verify_message": verifyMessage}).Error; err != nil {
			return err
		}
		if !passed {
			return nil
		}
		return tx.Model(&model.User{}).Where("id = ?", record.UserID).Update("real_name_auth", true).Error
	})
}

// consultOfficialAlipayRealName 根据支付宝授权码查询实名认证结果。
func consultOfficialAlipayRealName(config *model.RealNameConfig, verifyID string, authCode string) (bool, string, error) {
	if !config.Status || strings.ToLower(strings.TrimSpace(config.ProviderType)) == "ginapi" || strings.TrimSpace(config.AppID) == "" || strings.TrimSpace(config.PrivateKey) == "" {
		return false, "", errors.New("支付宝实名认证服务未正确配置")
	}
	privateKey, err := parseAlipayPrivateKey(config.PrivateKey)
	if err != nil {
		return false, "", errors.New("支付宝应用私钥格式错误")
	}

	tokenParams := map[string]string{
		"app_id":     config.AppID,
		"method":     "alipay.system.oauth.token",
		"charset":    "utf-8",
		"sign_type":  "RSA2",
		"timestamp":  time.Now().Format("2006-01-02 15:04:05"),
		"version":    "1.0",
		"grant_type": "authorization_code",
		"code":       authCode,
	}
	if err := signAlipayParams(tokenParams, privateKey); err != nil {
		return false, "", errors.New("支付宝授权请求签名失败")
	}
	tokenPayload, err := postAlipayForm(alipayGatewayURL(config), tokenParams)
	if err != nil {
		return false, "", errors.New("请求支付宝授权服务失败")
	}
	tokenData, ok := tokenPayload["alipay_system_oauth_token_response"].(map[string]any)
	accessToken := stringValue(tokenData, "access_token")
	if !ok || accessToken == "" {
		return false, "", errors.New("支付宝授权失败")
	}

	bizContent, _ := json.Marshal(map[string]string{"verify_id": verifyID})
	consultParams := map[string]string{
		"app_id":      config.AppID,
		"method":      "alipay.user.certdoc.certverify.consult",
		"charset":     "utf-8",
		"sign_type":   "RSA2",
		"timestamp":   time.Now().Format("2006-01-02 15:04:05"),
		"version":     "1.0",
		"biz_content": string(bizContent),
		"auth_token":  accessToken,
	}
	if err := signAlipayParams(consultParams, privateKey); err != nil {
		return false, "", errors.New("支付宝结果查询签名失败")
	}
	consultPayload, err := postAlipayForm(alipayGatewayURL(config), consultParams)
	if err != nil {
		return false, "", errors.New("请求支付宝实名认证结果失败")
	}
	consultData, ok := consultPayload["alipay_user_certdoc_certverify_consult_response"].(map[string]any)
	if !ok || stringValue(consultData, "code") != "10000" {
		return false, "", errors.New("支付宝实名认证结果查询失败")
	}
	if stringValue(consultData, "passed") == "T" {
		return true, "实名认证成功", nil
	}
	verifyMessage := stringValue(consultData, "fail_reason")
	if verifyMessage == "" {
		verifyMessage = "实名认证未通过"
	}
	return false, verifyMessage, nil
}

// callGinAPI 调用 GinApi 的开放实名认证接口。
func callGinAPI(config *model.RealNameConfig, method string, path string, values url.Values) (ginAPIResponse, error) {
	if strings.TrimSpace(config.GinapiBaseURL) == "" || strings.TrimSpace(config.GinapiAppKey) == "" || strings.TrimSpace(config.GinapiAppSecret) == "" || strings.TrimSpace(config.GinapiAppSlug) == "" {
		return ginAPIResponse{}, errors.New("GinApi 实名认证配置不完整")
	}
	endpoint := strings.TrimRight(config.GinapiBaseURL, "/") + "/api/open/" + url.PathEscape(config.GinapiAppSlug) + path
	if method == http.MethodGet && len(values) > 0 {
		endpoint += "?" + values.Encode()
	}
	var body io.Reader
	if method != http.MethodGet {
		body = strings.NewReader(values.Encode())
	}
	request, err := http.NewRequest(method, endpoint, body)
	if err != nil {
		return ginAPIResponse{}, errors.New("GinApi 请求地址错误")
	}
	request.Header.Set("X-App-Key", config.GinapiAppKey)
	request.Header.Set("X-App-Secret", config.GinapiAppSecret)
	if method != http.MethodGet {
		request.Header.Set("Content-Type", "application/x-www-form-urlencoded; charset=utf-8")
	}
	response, err := (&http.Client{Timeout: 12 * time.Second}).Do(request)
	if err != nil {
		return ginAPIResponse{}, errors.New("请求 GinApi 实名认证服务失败")
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		return ginAPIResponse{}, errors.New("读取 GinApi 响应失败")
	}
	var payload ginAPIResponse
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		return ginAPIResponse{}, errors.New("GinApi 响应格式错误")
	}
	if payload.Code == 0 {
		payload.Code = response.StatusCode
	}
	return payload, nil
}

// responseError 将远端错误转换为可展示的安全提示。
func responseError(response ginAPIResponse, fallback string) error {
	message := strings.TrimSpace(response.Msg)
	if message == "" {
		message = fallback
	}
	return errors.New(message)
}

// alipayGatewayURL 返回当前实名配置对应的支付宝网关地址。
func alipayGatewayURL(config *model.RealNameConfig) string {
	return "https://openapi.alipay.com/gateway.do"
}

// alipayFormat 返回支付宝请求格式，兼容历史配置使用的大写 JSON 值。
func alipayFormat(config *model.RealNameConfig) string {
	return "JSON"
}

// postAlipayForm 发送支付宝表单请求并解析 JSON 响应。
func postAlipayForm(endpoint string, params map[string]string) (map[string]any, error) {
	form := url.Values{}
	for key, value := range params {
		form.Set(key, value)
	}
	request, err := http.NewRequest(http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded; charset=utf-8")
	response, err := (&http.Client{Timeout: 12 * time.Second}).Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, err
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

// parseAlipayPrivateKey 解析 PKCS1 或 PKCS8 格式的支付宝应用私钥。
func parseAlipayPrivateKey(value string) (*rsa.PrivateKey, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, errors.New("私钥为空")
	}
	if !strings.HasPrefix(value, "-----BEGIN") {
		value = "-----BEGIN RSA PRIVATE KEY-----\n" + value + "\n-----END RSA PRIVATE KEY-----"
	}
	block, _ := pem.Decode([]byte(value))
	if block == nil {
		return nil, errors.New("私钥 PEM 格式错误")
	}
	if privateKey, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		key, ok := privateKey.(*rsa.PrivateKey)
		if !ok {
			return nil, errors.New("私钥不是 RSA 私钥")
		}
		return key, nil
	}
	return x509.ParsePKCS1PrivateKey(block.Bytes)
}

// signAlipayParams 使用 RSA2 对支付宝参数按字典序签名。
func signAlipayParams(params map[string]string, privateKey *rsa.PrivateKey) error {
	keys := make([]string, 0, len(params))
	for key := range params {
		if key != "sign" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	pairs := make([]string, 0, len(keys))
	for _, key := range keys {
		pairs = append(pairs, key+"="+params[key])
	}
	hash := sha256.Sum256([]byte(strings.Join(pairs, "&")))
	signature, err := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, hash[:])
	if err != nil {
		return err
	}
	params["sign"] = base64.StdEncoding.EncodeToString(signature)
	return nil
}

// stringValue 从第三方响应中安全读取字符串字段。
func stringValue(values map[string]any, key string) string {
	if values == nil {
		return ""
	}
	value, ok := values[key]
	if !ok {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

// renderRealNameCallback 将实名认证结果返回 GinBlog 的用户实名认证页面。
func renderRealNameCallback(c *gin.Context, success bool, title string, description string) {
	status := "failed"
	if success {
		status = "success"
	}
	target := "/user/realname?realname_status=" + url.QueryEscape(status) + "&title=" + url.QueryEscape(title) + "&message=" + url.QueryEscape(description)
	c.Redirect(http.StatusFound, target)
}
