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

// UserClaims 自定义JWT声明
type UserClaims struct {
	model.UserVo
	// TokenVersion 签发时的令牌版本号，与账号当前版本不一致即视为令牌已失效。
	TokenVersion int `json:"token_version"`
	jwt.RegisteredClaims
}

var (
	UserTokenExpiredDuration time.Duration
	UserSecret               []byte
	UserIssuer               string
)

// InitUserJWT 初始化JWT配置
func InitUserJWT() error {
	if len(config.AppConfig.Token.UserToken.Secret) < 32 {
		return errors.New("JWT密钥长度必须≥32字节")
	}

	UserExpireHours := config.AppConfig.Token.UserToken.ExpireTime
	if UserExpireHours <= 0 {
		UserExpireHours = 24
	}

	UserTokenExpiredDuration = time.Duration(UserExpireHours) * time.Hour
	UserSecret = []byte(config.AppConfig.Token.UserToken.Secret)
	UserIssuer = config.AppConfig.Token.UserToken.Issuer
	return nil
}

// GenerateUserToken 生成管理员Token
func GenerateUserToken(user *model.User) (string, error) {
	now := utils.Now()
	claims := UserClaims{
		UserVo: model.UserVo{
			ID:       user.ID,
			Username: user.Username,
		},
		TokenVersion: user.TokenVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(UserTokenExpiredDuration)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    UserIssuer,
			ID:        uuid.NewString(),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(UserSecret)
}

// ValidateUserToken 验证Token并返回用户信息（适配 v5）
func ValidateUserToken(tokenString string) (*model.UserVo, error) {
	tokenString = strings.TrimSpace(tokenString)
	if tokenString == "" {
		return nil, errors.New("令牌不能为空")
	}

	claims := &UserClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("不支持的签名算法: %v", t.Header["alg"])
		}
		return UserSecret, nil
	}, jwt.WithIssuer(UserIssuer), jwt.WithLeeway(5*time.Second))

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
	if err := verifyTokenVersion(model.User{}, claims.UserVo.ID, claims.TokenVersion); err != nil {
		return nil, err
	}

	return &claims.UserVo, nil
}

// GetUserFromContext 从Gin上下文中获取用户信息
func GetUserFromContext(c *gin.Context) (*model.UserVo, error) {
	val, exists := c.Get(constant.ContextKeyUserObj)
	if !exists {
		return nil, errors.New("上下文中未找到用户信息")
	}

	user, ok := val.(*model.UserVo)
	if !ok {
		return nil, errors.New("用户类型不匹配")
	}
	return user, nil
}
