package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"

	. "ginblog/core"
	"ginblog/model"
	"ginblog/result"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const geetestValidateURL = "https://gcaptcha4.geetest.com/validate"

type antiBrushScene string

const (
	antiBrushEmail antiBrushScene = "email"
	antiBrushSMS   antiBrushScene = "sms"
)

type geetestValidateResponse struct {
	Result string `json:"result"`
	Reason string `json:"reason"`
}

// GetPublicAntiBrushConfig 获取前台验证码发送所需的防刷配置。
// 只返回极验CaptchaID和业务开关，不返回极验密钥。
func GetPublicAntiBrushConfig(c *gin.Context) {
	config, err := getAntiBrushConfig()
	if errors.Is(err, gorm.ErrRecordNotFound) {
		result.Success(c, model.PublicAntiBrushConfigVo{})
		return
	}
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "获取防刷配置失败")
		return
	}

	captchaID := ""
	if config.EmailAntiBrush || config.SmsAntiBrush {
		captchaID = config.CaptchaID
	}
	result.Success(c, model.PublicAntiBrushConfigVo{
		CaptchaID:      captchaID,
		EmailAntiBrush: config.EmailAntiBrush,
		SmsAntiBrush:   config.SmsAntiBrush,
	})
}

// VerifyAntiBrush 在邮件或短信验证码发送前校验极验V4结果。
// 当对应防刷开关关闭时直接放行，兼容原有请求格式和发送流程。
func VerifyAntiBrush(c *gin.Context, scene antiBrushScene) bool {
	config, err := getAntiBrushConfig()
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return true
	}
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "获取防刷配置失败")
		return false
	}

	enabled := (scene == antiBrushEmail && config.EmailAntiBrush) || (scene == antiBrushSMS && config.SmsAntiBrush)
	if !enabled {
		return true
	}
	if config.CaptchaID == "" || config.CaptchaKey == "" {
		result.FailedWithMsg(c, result.BadRequest, "防刷配置不完整，请联系管理员")
		return false
	}

	validate := model.GeetestValidateDto{
		LotNumber:     c.PostForm("lot_number"),
		CaptchaOutput: c.PostForm("captcha_output"),
		PassToken:     c.PostForm("pass_token"),
		GenTime:       c.PostForm("gen_time"),
	}
	if err := validateGeetest(config, validate); err != nil {
		result.FailedWithMsg(c, result.BadRequest, err.Error())
		return false
	}
	return true
}

// validateGeetest 向极验服务二次校验前端返回的行为验证结果。
func validateGeetest(config *model.AntiBrushConfig, validate model.GeetestValidateDto) error {
	if validate.LotNumber == "" || validate.CaptchaOutput == "" || validate.PassToken == "" || validate.GenTime == "" {
		return fmt.Errorf("请先完成行为验证")
	}

	mac := hmac.New(sha256.New, []byte(config.CaptchaKey))
	_, _ = mac.Write([]byte(validate.LotNumber))
	signToken := hex.EncodeToString(mac.Sum(nil))
	formData := url.Values{
		"lot_number":     {validate.LotNumber},
		"captcha_output": {validate.CaptchaOutput},
		"pass_token":     {validate.PassToken},
		"gen_time":       {validate.GenTime},
		"sign_token":     {signToken},
	}

	client := &http.Client{Timeout: 5 * time.Second}
	response, err := client.PostForm(geetestValidateURL+"?captcha_id="+url.QueryEscape(config.CaptchaID), formData)
	if err != nil {
		return fmt.Errorf("行为验证服务暂时不可用，请稍后重试")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("行为验证服务暂时不可用，请稍后重试")
	}

	var responseData geetestValidateResponse
	if err := json.NewDecoder(response.Body).Decode(&responseData); err != nil {
		return fmt.Errorf("行为验证服务返回异常，请稍后重试")
	}
	if responseData.Result != "success" {
		return fmt.Errorf("行为验证未通过，请重试")
	}
	return nil
}

// getAntiBrushConfig 获取当前生效的唯一防刷配置。
func getAntiBrushConfig() (*model.AntiBrushConfig, error) {
	var config model.AntiBrushConfig
	if err := Db.First(&config).Error; err != nil {
		return nil, err
	}
	return &config, nil
}
