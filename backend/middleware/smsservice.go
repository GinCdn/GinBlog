package middleware

import (
	"crypto/md5"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"ginblog/global"
	"ginblog/model"
	"ginblog/utils"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/aliyun/alibaba-cloud-sdk-go/services/dysmsapi"
	"gorm.io/gorm"
)

// SmsService 统一封装短信宝和阿里云短信发送能力。
type SmsService struct {
	db          *gorm.DB
	config      *model.SmsConfig
	rateLimiter *sync.Map
	phoneRegex  *regexp.Regexp
}

var smsRateLimiter = &sync.Map{}

// NewSmsService 创建短信服务实例。
func NewSmsService(db *gorm.DB, config *model.SmsConfig) *SmsService {
	return &SmsService{
		db:          db,
		config:      config,
		rateLimiter: smsRateLimiter,
		phoneRegex:  regexp.MustCompile(`^1[3-9]\d{9}$`),
	}
}

// SendCode 生成并发送手机验证码。
func (s *SmsService) SendCode(phone string) error {
	phone = strings.TrimSpace(phone)
	if !s.phoneRegex.MatchString(phone) {
		return fmt.Errorf("手机号格式错误")
	}
	if s.config == nil || !s.config.Status {
		return fmt.Errorf("短信服务未启用")
	}
	if err := s.validateConfig(); err != nil {
		return err
	}

	now := utils.Now()
	if raw, ok := s.rateLimiter.Load(phone); ok {
		if expiresAt, ok := raw.(time.Time); ok && now.Before(expiresAt) {
			return fmt.Errorf("操作频率限制：60秒内只能发送一次（剩余%.0f秒）", expiresAt.Sub(now).Seconds())
		}
		s.rateLimiter.Delete(phone)
	}

	code, err := generateSmsCode()
	if err != nil {
		return fmt.Errorf("验证码生成失败: %w", err)
	}
	if err := s.send(phone, code); err != nil {
		return err
	}

	if err := s.db.Where("phone = ?", phone).Delete(&model.SmsCode{}).Error; err != nil {
		return fmt.Errorf("清理旧验证码失败: %w", err)
	}
	if err := s.db.Create(&model.SmsCode{
		Phone:     phone,
		Code:      code,
		CreatedAt: now,
		ExpiresAt: now.Add(5 * time.Minute),
	}).Error; err != nil {
		return fmt.Errorf("验证码存储失败: %w", err)
	}
	s.rateLimiter.Store(phone, now.Add(60*time.Second))
	return nil
}

// ValidateConfig 校验当前短信服务商的必要配置。
func (s *SmsService) ValidateConfig() error {
	if s.config == nil {
		return fmt.Errorf("短信服务未配置")
	}
	return s.validateConfig()
}

func (s *SmsService) validateConfig() error {
	switch s.config.Provider {
	case "smsbao":
		if strings.TrimSpace(s.config.SmsBaoUser) == "" || strings.TrimSpace(s.config.SmsBaoPassword) == "" {
			return fmt.Errorf("短信宝配置不完整")
		}
	case "aliyun":
		if strings.TrimSpace(s.config.AliyunAccessKeyID) == "" || strings.TrimSpace(s.config.AliyunAccessKeySecret) == "" || strings.TrimSpace(s.config.AliyunSignName) == "" || strings.TrimSpace(s.config.AliyunTemplateCode) == "" {
			return fmt.Errorf("阿里云短信配置不完整")
		}
	default:
		return fmt.Errorf("不支持的短信服务商")
	}
	return nil
}

func (s *SmsService) send(phone, code string) error {
	content := fmt.Sprintf("您的注册验证码为：%s，5分钟内有效，请勿泄露给他人。", code)
	switch s.config.Provider {
	case "smsbao":
		return s.sendSmsBao(phone, content)
	case "aliyun":
		return s.sendAliyun(phone, code)
	default:
		return fmt.Errorf("不支持的短信服务商")
	}
}

func (s *SmsService) sendSmsBao(phone, content string) error {
	passwordHash := md5.Sum([]byte(s.config.SmsBaoPassword))
	query := url.Values{}
	query.Set("u", s.config.SmsBaoUser)
	query.Set("p", hex.EncodeToString(passwordHash[:]))
	query.Set("m", phone)
	query.Set("c", content)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get("http://api.smsbao.com/sms?" + query.Encode())
	if err != nil {
		return fmt.Errorf("短信宝请求失败: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("短信宝响应读取失败: %w", err)
	}
	if len(body) == 0 {
		return fmt.Errorf("短信宝返回为空")
	}
	response := strings.TrimSpace(string(body))
	if response != "0" {
		return fmt.Errorf("短信宝发送失败: %s", smsBaoStatusMessage(response))
	}
	return nil
}

func (s *SmsService) sendAliyun(phone, code string) error {
	regionID := strings.TrimSpace(s.config.AliyunRegionID)
	if regionID == "" {
		regionID = "cn-hangzhou"
	}
	client, err := dysmsapi.NewClientWithAccessKey(regionID, s.config.AliyunAccessKeyID, s.config.AliyunAccessKeySecret)
	if err != nil {
		return fmt.Errorf("阿里云短信客户端创建失败: %w", err)
	}
	request := dysmsapi.CreateSendSmsRequest()
	request.Scheme = "https"
	request.PhoneNumbers = phone
	request.SignName = s.config.AliyunSignName
	request.TemplateCode = s.config.AliyunTemplateCode
	params, _ := json.Marshal(map[string]string{"code": code})
	request.TemplateParam = string(params)
	response, err := client.SendSms(request)
	if err != nil {
		return fmt.Errorf("阿里云短信请求失败: %w", err)
	}
	if response == nil || response.Code != "OK" {
		if response == nil {
			return fmt.Errorf("阿里云短信返回为空")
		}
		return fmt.Errorf("阿里云短信发送失败: %s", response.Message)
	}
	return nil
}

func generateSmsCode() (string, error) {
	max := big.NewInt(1000000)
	number, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", number.Int64()), nil
}

func smsBaoStatusMessage(code string) string {
	messages := map[string]string{
		"-1": "参数不全",
		"-2": "服务器空间不支持，请确认支持curl或者fsocket",
		"30": "密码错误",
		"40": "账号不存在",
		"41": "余额不足",
		"42": "账号已过期",
		"43": "IP地址限制",
		"50": "内容含有敏感词",
	}
	if message, ok := messages[code]; ok {
		return message
	}
	return "未知返回码 " + code
}

// VerifyCode 校验手机验证码并在成功后删除验证码。
func (s *SmsService) VerifyCode(phone, code string) (bool, error) {
	phone = strings.TrimSpace(phone)
	code = strings.TrimSpace(code)
	var record model.SmsCode
	err := s.db.Where("phone = ? AND code = ? AND expires_at > ?", phone, code, utils.Now()).First(&record).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, fmt.Errorf("数据库查询失败: %w", err)
	}
	if err := s.db.Delete(&record).Error; err != nil {
		global.Log.Warnf("短信验证码验证后删除失败: %v", err)
	}
	return true, nil
}
