package utils

import "golang.org/x/crypto/bcrypt"

// EncryptPassword 使用bcrypt加密(推荐)
func EncryptPassword(password string) (string, error) {
	hashed, err := bcrypt.GenerateFromPassword(
		[]byte(password),
		bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashed), nil
}

// VerifyPassword 安全验证
func VerifyPassword(hashed, input string) bool {
	return bcrypt.CompareHashAndPassword(
		[]byte(hashed),
		[]byte(input)) == nil
}
