package utils

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/rand"
	"time"
)

// 生成32位唯一授权码的辅助函数
func GenerateUniqueApiCode(username string, authType int, createTime time.Time) (string, error) {
	// 增加随机数位数提升唯一性
	rand.Seed(createTime.UnixNano())
	randomNum := rand.Intn(100000000) // 8位随机数

	// 原始字符串包含更多唯一因子
	rawStr := fmt.Sprintf("%s_%d_%d_%d_%s",
		username,
		authType,
		createTime.UnixNano(),
		randomNum,
		createTime.Format("20060102150405")) // 增加时间字符串

	// SHA-256哈希后取前16字节（32个十六进制字符）
	hash := sha256.Sum256([]byte(rawStr))
	return hex.EncodeToString(hash[:16]), nil // 32位授权码
}
