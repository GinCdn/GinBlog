package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Cors 返回一个 Gin 中间件，用于处理跨域请求（完全开放）
func Cors() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 完全开放：允许所有来源
		origin := c.Request.Header.Get("Origin")
		if origin == "" {
			// 非跨域请求也放行
			c.Next()
			return
		}

		// 核心：允许所有来源（* 表示通配所有域名）
		c.Header("Access-Control-Allow-Origin", "*")
		// 允许所有 HTTP 方法
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
		// 允许所有请求头（* 通配所有头信息）
		c.Header("Access-Control-Allow-Headers", "*")
		// 允许暴露所有响应头
		c.Header("Access-Control-Expose-Headers", "*")
		// 预检请求缓存时间（24小时，减少重复预检）
		c.Header("Access-Control-Max-Age", "86400")

		// 处理预检请求（OPTIONS 方法直接返回成功）
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
