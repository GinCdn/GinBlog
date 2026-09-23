package core

import (
	"errors"
	"fmt"
	"ginblog/config"
	"ginblog/constant"
	"ginblog/model"
	"ginblog/utils"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// AdminClaims 自定义JWT声明
type AdminClaims struct {
	model.AdminVo
	// TokenVersion 签发时的令牌版本号，与账号当前版本不一致即视为令牌已失效。
	TokenVersion int `json:"token_version"`
	jwt.RegisteredClaims
}

var (
	AdminTokenExpiredDuration time.Duration
	AdminSecret               []byte
	AdminIssuer               string
)

// InitAdminJWT 初始化JWT配置
func InitAdminJWT() error {
	if len(config.AppConfig.Token.AdminToken.Secret) < 32 {
		return errors.New("JWT密钥长度必须≥32字节")
	}

	AdminExpireHours := config.AppConfig.Token.AdminToken.ExpireTime
	if AdminExpireHours <= 0 {
		AdminExpireHours = 24
	}

	AdminTokenExpiredDuration = time.Duration(AdminExpireHours) * time.Hour
	AdminSecret = []byte(config.AppConfig.Token.AdminToken.Secret)
	AdminIssuer = config.AppConfig.Token.AdminToken.Issuer
	return nil
}

// GenerateAdminToken 生成管理员Token
func GenerateAdminToken(admin model.Admin) (string, error) {
	now := utils.Now()
	claims := AdminClaims{
		AdminVo: model.AdminVo{
			ID:       admin.ID,
			Username: admin.Username,
		},
		TokenVersion: admin.TokenVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(AdminTokenExpiredDuration)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    AdminIssuer,
			ID:        uuid.NewString(),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(AdminSecret)
}

// ValidateAdminToken 验证Token并返回用户信息（适配 v5）
func ValidateAdminToken(tokenString string) (*model.AdminVo, error) {
	tokenString = strings.TrimSpace(tokenString)
	if tokenString == "" {
		return nil, errors.New("令牌不能为空")
	}

	claims := &AdminClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("不支持的签名算法: %v", t.Header["alg"])
		}
		return AdminSecret, nil
	}, jwt.WithIssuer(AdminIssuer), jwt.WithLeeway(5*time.Second))

	if err != nil {
		// ✅ 使用 v5 中的标准错误判断
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, errors.New("令牌已过期")
		}

		// 判断格式错误
		if strings.Contains(err.Error(), "malformed token") ||
			strings.Contains(err.Error(), "invalid character") ||
			strings.Contains(err.Error(), "segment count") {
			return nil, errors.New("令牌格式错误")
		}

		// 判断尚未生效
		if strings.Contains(err.Error(), "token is not valid yet") {
			return nil, errors.New("令牌尚未生效")
		}

		// 其他错误
		return nil, fmt.Errorf("令牌验证失败: %w", err)
	}

	if !token.Valid {
		return nil, errors.New("无效令牌")
	}

	// 账号的用户名或密码变更后版本号会自增，历史令牌在此处被判定为失效。
	if err := verifyTokenVersion(model.Admin{}, claims.AdminVo.ID, claims.TokenVersion); err != nil {
		return nil, err
	}

	return &claims.AdminVo, nil
}

// GetAdminFromContext 从Gin上下文中获取管理员信息
func GetAdminFromContext(c *gin.Context) (*model.AdminVo, error) {
	val, exists := c.Get(constant.ContextKeyUserObj)
	if !exists {
		return nil, errors.New("上下文中未找到用户信息")
	}

	admin, ok := val.(*model.AdminVo)
	if !ok {
		return nil, errors.New("用户类型不匹配")
	}
	return admin, nil
}
