package middleware

import (
	"crypto/rand"
	"crypto/tls"
	"fmt"
	"ginblog/global"
	"ginblog/model"
	"ginblog/utils"
	"math/big"
	"net/smtp"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/pkg/errors"

	"gorm.io/gorm"
)

// 带过期时间的存储结构
type timedValue struct {
	value     time.Time
	expiresAt time.Time
}

// 1. 全局唯一的限流器（所有实例共享）
var globalRateLimiter = &sync.Map{}

type MailService struct {
	db          *gorm.DB
	rateLimiter *sync.Map // 指向全局限流器
	smtpConfig  *model.Email
	emailRegex  *regexp.Regexp
	maxRand     *big.Int
}

// 2. 单例模式确保全局只有一个实例
var (
	instance *MailService
	once     sync.Once
)

// NewMailService 获取单例实例
func NewMailService(db *gorm.DB, config *model.Email) *MailService {
	once.Do(func() {
		const charset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
		instance = &MailService{
			db:          db,
			rateLimiter: globalRateLimiter, // 绑定到全局限流器
			smtpConfig:  config,
			emailRegex:  regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`),
			maxRand:     big.NewInt(int64(len(charset))),
		}
		// 启动清理过期记录的协程
		go instance.cleanupExpiredRecords()
		global.Log.Info("邮件服务单例初始化完成")
	})

	// 更新配置（如果有变化）
	if instance.smtpConfig != config {
		instance.smtpConfig = config
	}
	return instance
}

// 定时清理过期的限制记录
func (s *MailService) cleanupExpiredRecords() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			now := utils.Now()
			count := 0
			s.rateLimiter.Range(func(key, value interface{}) bool {
				val, ok := value.(timedValue)
				if !ok || now.After(val.expiresAt) {
					s.rateLimiter.Delete(key)
					count++
				}
				return true
			})
			global.Log.Debugf("清理过期限制记录: %d 条", count)
		case <-time.After(24 * time.Hour):
			return
		}
	}
}

// SendCode 完整的发送验证码方法（含生效的频率限制）
func (s *MailService) SendCode(toEmail string) error {
	// 1. 验证收件人邮箱格式
	if err := s.validateEmail(toEmail); err != nil {
		return err
	}

	// 2. 频率限制检查（使用全局共享的限流器）
	now := utils.Now()
	if raw, ok := s.rateLimiter.Load(toEmail); ok {
		last, ok := raw.(timedValue)
		if !ok {
			s.rateLimiter.Delete(toEmail) // 清理无效记录
		} else if now.Before(last.expiresAt) {
			remaining := last.expiresAt.Sub(now).Seconds()
			return fmt.Errorf("操作频率限制：60秒内只能发送一次（剩余%.0f秒）", remaining)
		}
	}

	// 3. 记录发送时间（全局共享）
	s.rateLimiter.Store(toEmail, timedValue{
		value:     now,
		expiresAt: now.Add(60 * time.Second),
	})

	// 4. 异常恢复机制
	defer func() {
		if r := recover(); r != nil {
			s.rateLimiter.Delete(toEmail)
			global.Log.Errorf("发送验证码发生恐慌: %v", r)
		}
	}()

	// 5. 生成6位安全验证码
	code, err := s.generateSecureCode()
	if err != nil {
		s.rateLimiter.Delete(toEmail)
		return fmt.Errorf("验证码生成失败: %w", err)
	}

	// 6. 保存验证码到数据库
	if err := s.db.Create(&model.EmailCode{
		Email:     toEmail,
		Code:      code,
		ExpiresAt: utils.HTime{Time: now.Add(5 * time.Minute)},
	}).Error; err != nil {
		s.rateLimiter.Delete(toEmail)
		return fmt.Errorf("数据库存储失败: %w", err)
	}

	// 7. 构建邮件内容
	// 彻底清理发件人地址
	cleanUsername := strings.TrimSpace(s.smtpConfig.Username)
	cleanUsername = strings.ReplaceAll(cleanUsername, "<", "")
	cleanUsername = strings.ReplaceAll(cleanUsername, ">", "")

	// 构建发件人信息
	var from string
	if s.smtpConfig.FromName != "" {
		from = fmt.Sprintf("%s <%s>", s.smtpConfig.FromName, cleanUsername)
	} else {
		from = cleanUsername
	}

	// 8. 发送邮件（使用标准库）
	auth := smtp.PlainAuth("", cleanUsername, s.smtpConfig.Password, s.smtpConfig.Host)
	addr := fmt.Sprintf("%s:%d", s.smtpConfig.Host, s.smtpConfig.Port)

	// 构建邮件内容
	msg := []byte("To: " + toEmail + "\r\n" +
		"From: " + from + "\r\n" +
		"Subject: 验证码通知\r\n" +
		"MIME-version: 1.0\r\n" +
		"Content-Type: text/html; charset=\"UTF-8\"\r\n\r\n" +
		fmt.Sprintf(`
		<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
			<h2 style="color: #1890ff;">您的验证码</h2>
			<p>验证码：<strong style="font-size: 18px; letter-spacing: 2px;">%s</strong></p>
			<p style="color: #666; font-size: 14px;">该验证码5分钟内有效，请勿泄露给他人</p>
		</div>
	`, code))

	// 配置TLS
	tlsConfig := &tls.Config{
		InsecureSkipVerify: s.smtpConfig.SkipTLSVerify,
		ServerName:         s.smtpConfig.Host,
	}

	// 建立TLS连接
	conn, err := tls.Dial("tcp", addr, tlsConfig)
	if err != nil {
		s.rateLimiter.Delete(toEmail)
		return fmt.Errorf("TLS连接失败: %w", err)
	}
	defer conn.Close()

	// 创建SMTP客户端
	client, err := smtp.NewClient(conn, s.smtpConfig.Host)
	if err != nil {
		s.rateLimiter.Delete(toEmail)
		return fmt.Errorf("创建SMTP客户端失败: %w", err)
	}
	defer client.Quit()

	// 认证
	if err := client.Auth(auth); err != nil {
		s.rateLimiter.Delete(toEmail)
		return fmt.Errorf("SMTP认证失败: %w", err)
	}

	// 设置发件人
	if err := client.Mail(cleanUsername); err != nil {
		s.rateLimiter.Delete(toEmail)
		return fmt.Errorf("设置发件人失败: %w", err)
	}

	// 设置收件人
	if err := client.Rcpt(toEmail); err != nil {
		s.rateLimiter.Delete(toEmail)
		return fmt.Errorf("设置收件人失败: %w", err)
	}

	// 发送邮件内容
	w, err := client.Data()
	if err != nil {
		s.rateLimiter.Delete(toEmail)
		return fmt.Errorf("准备发送数据失败: %w", err)
	}

	_, err = w.Write(msg)
	if err != nil {
		s.rateLimiter.Delete(toEmail)
		return fmt.Errorf("写入邮件内容失败: %w", err)
	}

	// 完成发送
	if err := w.Close(); err != nil {
		s.rateLimiter.Delete(toEmail)
		return fmt.Errorf("发送邮件失败: %w", err)
	}

	global.Log.Infof("邮件发送成功，发件人: %s，收件人: %s", cleanUsername, toEmail)
	return nil
}

// 验证邮箱格式
func (s *MailService) validateEmail(email string) error {
	if !strings.Contains(email, "@") {
		return errors.New("邮箱地址必须包含@符号")
	}
	if strings.Count(email, "@") > 1 {
		return errors.New("邮箱地址只能包含一个@符号")
	}
	if !s.emailRegex.MatchString(email) {
		return errors.New("邮箱格式不正确")
	}
	return nil
}

// 生成验证码
func (s *MailService) generateSecureCode() (string, error) {
	const charset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
	b := make([]byte, 6)
	for i := range b {
		n, err := rand.Int(rand.Reader, s.maxRand)
		if err != nil {
			return "", fmt.Errorf("随机数生成失败: %w", err)
		}
		b[i] = charset[n.Int64()]
	}
	return string(b), nil
}

// 验证验证码
func (s *MailService) VerifyEmailCode(email, code string) (bool, error) {
	var record model.EmailCode
	err := s.db.Where("email = ? AND code = ? AND expires_at > ?",
		email, code, utils.HTime{Time: utils.Now()}).First(&record).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, fmt.Errorf("数据库查询失败: %w", err)
	}

	if delErr := s.db.Delete(&record).Error; delErr != nil {
		global.Log.Warnf("验证码验证后删除失败: %v", delErr)
	}
	return true, nil
}
