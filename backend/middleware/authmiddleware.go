package middleware

import (
	"ginblog/config"
	"ginblog/constant"
	"ginblog/core"
	"ginblog/global"
	"ginblog/result"
	"strings"

	"github.com/gin-gonic/gin"
)

// AdminAuthMiddleware 鉴权中间件
func AdminAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		//1.从Header提取Authorization
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			global.Log.Infof("Authorization header missing") // 添加日志记录
			result.Failed(c, result.Unauthorized, result.SubDefault)
			c.Abort()
			return
		}
		// 2. 验证Bearer格式
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != config.AppConfig.Token.AdminToken.Header {
			global.Log.Infof("Invalid Authorization format: %s\n", authHeader) // 添加日志记录
			result.Failed(c, result.Unauthorized, result.SubNoAuthInfo)
			c.Abort()
			return
		}
		// 3. 验证Token有效性
		token, err := core.ValidateAdminToken(parts[1])
		if err != nil {
			global.Log.Infof("Token parsing error: %v\n", err) // 添加日志记录
			result.Failed(c, result.Unauthorized, result.SubInvalidToken)
			c.Abort()
			return
		}
		username := token.Username //单独提取username

		// 4. 存储用户信息并放行
		c.Set(constant.ContextKeyUserObj, token)
		c.Set("username", username) //单独存储username
		c.Next()
	}
}

// UsreAuthMiddleware 鉴权中间件
func UsreAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		//1.从Header提取Authorization
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			global.Log.Infof("Authorization header missing") // 添加日志记录
			result.Failed(c, result.Unauthorized, result.SubDefault)
			c.Abort()
			return
		}
		// 2. 验证Bearer格式
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != config.AppConfig.Token.UserToken.Header {
			global.Log.Infof("Invalid Authorization format: %s\n", authHeader) // 添加日志记录
			result.Failed(c, result.Unauthorized, result.SubNoAuthInfo)
			c.Abort()
			return
		}
		// 3. 验证Token有效性
		token, err := core.ValidateUserToken(parts[1])
		if err != nil {
			global.Log.Infof("Token parsing error: %v\n", err) // 添加日志记录
			result.Failed(c, result.Unauthorized, result.SubInvalidToken)
			c.Abort()
			return
		}
		username := token.Username //单独提取username

		// 4. 存储用户信息并放行
		c.Set(constant.ContextKeyUserObj, token)
		c.Set("username", username) //单独存储username
		c.Next()
	}
}

// OptionalUserAuthMiddleware 可选用户鉴权，携带合法令牌时解析身份，未携带则匿名放行。
func OptionalUserAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && parts[0] == config.AppConfig.Token.UserToken.Header {
				if token, err := core.ValidateUserToken(parts[1]); err == nil {
					c.Set(constant.ContextKeyUserObj, token)
					c.Set("username", token.Username)
				}
			}
		}
		c.Next()
	}
}
