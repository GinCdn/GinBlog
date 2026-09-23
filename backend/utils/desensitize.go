package utils

import (
	"strings"
	"unicode/utf8"
)

// DesensitizePhone 对手机号脱敏，保留前三位和后四位
func DesensitizePhone(phone string) string {
	if utf8.RuneCountInString(phone) < 7 {
		return phone
	}
	runes := []rune(phone)
	return string(runes[:3]) + "****" + string(runes[len(runes)-4:])
}

// DesensitizeIDCard 对证件号码脱敏，保留前六位和后四位
func DesensitizeIDCard(idCard string) string {
	if utf8.RuneCountInString(idCard) < 11 {
		return idCard
	}
	runes := []rune(idCard)
	return string(runes[:6]) + "********" + string(runes[len(runes)-4:])
}

// DesensitizeRealName 对真实姓名脱敏，仅保留第一个字符
func DesensitizeRealName(realName string) string {
	if realName == "" {
		return realName
	}
	runes := []rune(realName)
	return string(runes[:1]) + strings.Repeat("*", maxInt(len(runes)-1, 0))
}

// DesensitizeEmail 对邮箱脱敏，保留首字符和域名
func DesensitizeEmail(email string) string {
	at := strings.LastIndex(email, "@")
	if at <= 0 {
		return email
	}
	runes := []rune(email[:at])
	return string(runes[:1]) + "***" + email[at:]
}

// maxInt 返回较大的整数，用于计算掩码长度
func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}