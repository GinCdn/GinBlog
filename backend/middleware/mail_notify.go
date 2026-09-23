package middleware

import (
	"crypto/tls"
	"fmt"
	"net/smtp"
	"strings"
)

// SendNotificationEmail 发送评论审核通过后的通知邮件。
func (s *MailService) SendNotificationEmail(to, subject, body string) error {
	if s == nil || s.smtpConfig == nil {
		return fmt.Errorf("邮件配置不存在")
	}
	to = strings.TrimSpace(to)
	if to == "" {
		return fmt.Errorf("收件人邮箱为空")
	}
	cleanUsername := strings.NewReplacer("<", "", ">", "", "\r", "", "\n", "").Replace(strings.TrimSpace(s.smtpConfig.Username))
	subject = strings.NewReplacer("\r", "", "\n", "").Replace(strings.TrimSpace(subject))
	from := cleanUsername
	if s.smtpConfig.FromName != "" {
		from = fmt.Sprintf("%s <%s>", strings.NewReplacer("<", "", ">", "", "\r", "", "\n", "").Replace(s.smtpConfig.FromName), cleanUsername)
	}
	message := []byte("To: " + to + "\r\n" +
		"From: " + from + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"MIME-version: 1.0\r\n" +
		"Content-Type: text/html; charset=\"UTF-8\"\r\n\r\n" + body)
	address := fmt.Sprintf("%s:%d", s.smtpConfig.Host, s.smtpConfig.Port)
	tlsConfig := &tls.Config{InsecureSkipVerify: s.smtpConfig.SkipTLSVerify, ServerName: s.smtpConfig.Host}
	conn, err := tls.Dial("tcp", address, tlsConfig)
	if err != nil {
		return fmt.Errorf("TLS连接失败: %w", err)
	}
	defer conn.Close()
	client, err := smtp.NewClient(conn, s.smtpConfig.Host)
	if err != nil {
		return fmt.Errorf("创建SMTP客户端失败: %w", err)
	}
	defer client.Quit()
	if err = client.Auth(smtp.PlainAuth("", cleanUsername, s.smtpConfig.Password, s.smtpConfig.Host)); err != nil {
		return fmt.Errorf("SMTP认证失败: %w", err)
	}
	if err = client.Mail(cleanUsername); err != nil {
		return fmt.Errorf("设置发件人失败: %w", err)
	}
	if err = client.Rcpt(to); err != nil {
		return fmt.Errorf("设置收件人失败: %w", err)
	}
	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("准备发送数据失败: %w", err)
	}
	if _, err = writer.Write(message); err != nil {
		_ = writer.Close()
		return fmt.Errorf("写入邮件内容失败: %w", err)
	}
	if err = writer.Close(); err != nil {
		return fmt.Errorf("发送邮件失败: %w", err)
	}
	return nil
}
