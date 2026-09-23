package utils

import (
	"fmt"
	"regexp"
)

// 预编译正则表达式（全局变量，程序启动时编译一次）
var (
	qqRegex       = regexp.MustCompile(`^\d{5,11}$`)
	phoneRegex    = regexp.MustCompile(`^1\d{10}$`)
	emailRegex    = regexp.MustCompile(`^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$`)
	usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]{5,20}$`)

	// 密码校验相关正则（拆分以兼容Go语法）
	lowercaseRegex      = regexp.MustCompile(`[a-z]`)
	uppercaseRegex      = regexp.MustCompile(`[A-Z]`)
	digitRegex          = regexp.MustCompile(`\d`)
	specialRegex        = regexp.MustCompile(`[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?` + "`" + `~]`)
	passwordLengthRegex = regexp.MustCompile(`^.{6,20}$`)

	// 常见弱密码列表
	weakPasswords = map[string]bool{
		"12345678":   true,
		"password":   true,
		"qwertyui":   true,
		"abc123456":  true,
		"11111111":   true,
		"123456789":  true,
		"1234567890": true,
		"88888888":   true,
	}

	// 修复连续字符正则：Go中需要使用双反斜杠转义反向引用
	consecutiveCharsRegex = regexp.MustCompile(`(.)\\1{3,}`)

	// 序列字符正则
	sequenceCharsRegex = regexp.MustCompile(`(0123|1234|2345|3456|4567|5678|6789|7890|abcde|fghij|klmno|pqrst|uvwxy|zabcde|ABCDE|FGHIJ|KLMNO|PQRST|UVWXY|ZABCDE)`)
)

// IsValidQQ 校验QQ号格式是否合法
func IsValidQQ(qq string) bool {
	return qqRegex.MatchString(qq)
}

// IsValidPhone 校验手机号格式是否合法
func IsValidPhone(phone string) bool {
	return phoneRegex.MatchString(phone)
}

// IsValidEmail 校验邮箱格式是否合法
func IsValidEmail(email string) bool {
	return emailRegex.MatchString(email)
}

// IsValidUsername 校验用户名格式是否合法
func IsValidUsername(username string) bool {
	return usernameRegex.MatchString(username)
}

// IsValidPassword 校验密码格式是否合法
func IsValidPassword(password string) bool {
	// 1. 检查长度
	if !passwordLengthRegex.MatchString(password) {
		return false
	}

	// 2. 检查字符类型组合（至少三种）
	typeCount := 0
	if lowercaseRegex.MatchString(password) {
		typeCount++
	}
	if uppercaseRegex.MatchString(password) {
		typeCount++
	}
	if digitRegex.MatchString(password) {
		typeCount++
	}
	if specialRegex.MatchString(password) {
		typeCount++
	}
	if typeCount < 3 {
		return false
	}

	// 3. 检查是否为常见弱密码
	if weakPasswords[password] {
		return false
	}

	// 4. 检查是否包含连续重复字符
	if consecutiveCharsRegex.MatchString(password) {
		return false
	}

	// 5. 检查是否包含常见序列
	if sequenceCharsRegex.MatchString(password) {
		return false
	}

	return true
}

// ValidatePasswordByRegisterRule 根据注册配置校验密码，并保留原有弱密码防护。
func ValidatePasswordByRegisterRule(password string, minLength int, maxLength int, rule int) (bool, string) {
	if minLength <= 0 {
		minLength = 6
	}
	if maxLength <= 0 {
		maxLength = 20
	}
	if maxLength < minLength {
		maxLength = minLength
	}

	passwordLength := len([]rune(password))
	if passwordLength < minLength || passwordLength > maxLength {
		return false, fmt.Sprintf("密码长度应为%d-%d位", minLength, maxLength)
	}
	if weakPasswords[password] {
		return false, "密码过于简单，容易被破解"
	}
	if consecutiveCharsRegex.MatchString(password) {
		return false, "密码不能包含连续4个以上相同字符"
	}
	if sequenceCharsRegex.MatchString(password) {
		return false, "密码不能包含常见连续序列（如123456、abcdef）"
	}

	switch rule {
	case 1:
		if (!lowercaseRegex.MatchString(password) && !uppercaseRegex.MatchString(password)) || !digitRegex.MatchString(password) {
			return false, fmt.Sprintf("密码为%d-%d位，需包含字母和数字", minLength, maxLength)
		}
	case 2:
		if !lowercaseRegex.MatchString(password) || !uppercaseRegex.MatchString(password) || !digitRegex.MatchString(password) {
			return false, fmt.Sprintf("密码为%d-%d位，需包含大小写字母和数字", minLength, maxLength)
		}
	default:
		if !IsValidPassword(password) {
			return false, GetPasswordErrorMsg(password)
		}
	}
	return true, ""
}

// GetPasswordErrorMsg 返回密码校验失败的具体原因
func GetPasswordErrorMsg(password string) string {
	if len(password) < 6 {
		return "密码长度不能少于6位"
	}
	if len(password) > 20 {
		return "密码长度不能超过20位"
	}

	// 检查字符类型组合
	typeCount := 0
	if lowercaseRegex.MatchString(password) {
		typeCount++
	}
	if uppercaseRegex.MatchString(password) {
		typeCount++
	}
	if digitRegex.MatchString(password) {
		typeCount++
	}
	if specialRegex.MatchString(password) {
		typeCount++
	}
	if typeCount < 3 {
		return "密码需包含大小写字母、数字和特殊字符中的至少三种"
	}

	if weakPasswords[password] {
		return "密码过于简单，容易被破解"
	}
	if consecutiveCharsRegex.MatchString(password) {
		return "密码不能包含连续4个以上相同字符"
	}
	if sequenceCharsRegex.MatchString(password) {
		return "密码不能包含常见连续序列（如123456、abcdef）"
	}
	return "密码格式不合法"
}
