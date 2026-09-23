package controller

import (
	"ginblog/constant"
	"ginblog/model"
	"ginblog/result"

	"github.com/gin-gonic/gin"
)

// GetCurrentAdmin 从Gin上下文中安全获取当前登录管理员信息
// 返回 nil 表示已自动向客户端写入错误响应，调用方应直接 return
func GetCurrentAdmin(c *gin.Context) *model.AdminVo {
	tokenVo, exists := c.Get(constant.ContextKeyUserObj)
	if !exists {
		result.Failed(c, result.Unauthorized, "请先登录")
		return nil
	}
	vo, ok := tokenVo.(*model.AdminVo)
	if !ok || vo == nil {
		result.Failed(c, result.Unauthorized, "用户信息异常")
		return nil
	}
	return vo
}

// GetCurrentUser 从Gin上下文中安全获取当前登录用户信息
// 返回 nil 表示已自动向客户端写入错误响应，调用方应直接 return
func GetCurrentUser(c *gin.Context) *model.UserVo {
	tokenVo, exists := c.Get(constant.ContextKeyUserObj)
	if !exists {
		result.Failed(c, result.Unauthorized, "请先登录")
		return nil
	}
	vo, ok := tokenVo.(*model.UserVo)
	if !ok || vo == nil {
		result.Failed(c, result.Unauthorized, "用户信息异常")
		return nil
	}
	return vo
}
