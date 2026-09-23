package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"github.com/mojocn/base64Captcha"
)

// 所有常量放在同一区块（确保作用域正确）
const (
	CAPTCHA_WIDTH  = 240
	CAPTCHA_HEIGHT = 80
	CAPTCHA_LENGTH = 4
	SESSION_SECRET = "simple-ginblog-captcha-secret" // ≥8位，自定义
)

// GenerateCaptcha 生成图形验证码接口
// @Summary 生成图形验证码接口
// @Tags 验证码相关接口
// @Produce json
// @Description 生成图形验证码接口
// @Success 200 {object} result.Result{data=bool} "生成成功返回true"
// @router /api/captcha [get]
func GenerateCaptcha(c *gin.Context) {
	// 初始化驱动（v1.3.8兼容）
	driver := base64Captcha.NewDriverString(
		CAPTCHA_WIDTH,  // 宽
		CAPTCHA_HEIGHT, // 高
		30,             // 字体大小
		2,              // 噪声线数量
		CAPTCHA_LENGTH, // 字符长度
		"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
		nil, nil, nil, // v1.3.8必填空参数
	)

	// 创建验证码实例
	captcha := base64Captcha.NewCaptcha(driver, base64Captcha.DefaultMemStore)
	id, b64s, answer, err := captcha.Generate()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "msg": "验证码生成失败", "data": nil})
		return
	}

	// 存储答案到Session（key格式：captcha_+id）
	session := sessions.Default(c)
	session.Set("captcha_"+id, answer)
	if err := session.Save(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "msg": "会话存储失败", "data": nil})
		return
	}

	// 响应结果
	c.JSON(http.StatusOK, gin.H{
		"code": 200,
		"msg":  "success",
		"data": gin.H{
			"captchaId":    id,
			"captchaImage": b64s,
			"expireTime":   300, // 5分钟过期
		},
	})
}

// VerifyCaptcha 图形验证码验证接口（独立验证接口，供前端单独调用）
// @Summary 图形验证码验证接口
// @Tags 验证码相关接口
// @Produce json
// @Description 图形验证码验证接口
// @Param captcha_id formData string true "图形验证码ID"
// @Param code formData string true "验证码"
// @Success 200 {object} result.Result{data=bool} "验证成功返回true"
// @router /api/captcha/verify [post]
func VerifyCaptcha(c *gin.Context) {
	var req struct {
		CaptchaId string `form:"captcha_id" json:"captchaId" binding:"required"` // 支持form和JSON参数
		Code      string `form:"code" json:"code" binding:"required"`
	}

	// 修复1：用ShouldBind而非ShouldBindJSON，同时支持formData和JSON格式
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "msg": "参数错误：" + err.Error(), "data": nil})
		return
	}

	// 从session获取答案（先检查是否存在，避免panic）
	session := sessions.Default(c)
	answer, exists := session.Get("captcha_" + req.CaptchaId).(string)
	if !exists {
		c.JSON(http.StatusOK, gin.H{"code": 400, "msg": "验证码已过期，请刷新", "data": nil})
		return
	}

	// 比对（忽略大小写）
	if strings.ToLower(req.Code) == strings.ToLower(answer) {
		c.JSON(http.StatusOK, gin.H{"code": 200, "msg": "验证成功", "data": true})
	} else {
		c.JSON(http.StatusOK, gin.H{"code": 400, "msg": "验证码错误", "data": false})
	}
}

// CaptchaAuthMiddleware 验证码验证中间件（用于登录/注册等接口前置验证）
func CaptchaAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		var captchaReq struct {
			CaptchaId string `json:"captchaId" form:"captchaId" binding:"required"` // 验证码ID
			Code      string `json:"code" form:"code" binding:"required"`           // 用户输入的验证码
		}

		// 解析参数（支持form和JSON格式）
		if err := c.ShouldBind(&captchaReq); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"code": 400,
				"msg":  "验证码参数错误：" + err.Error(),
				"data": nil,
			})
			c.Abort() // 终止后续流程
			return
		}

		// 从Session获取正确答案（检查是否存在）
		session := sessions.Default(c)
		answer, exists := session.Get("captcha_" + captchaReq.CaptchaId).(string)
		if !exists {
			c.JSON(http.StatusOK, gin.H{
				"code": 400,
				"msg":  "验证码已过期，请刷新重试",
				"data": nil,
			})
			c.Abort()
			return
		}

		// 比对验证码（忽略大小写）
		if strings.ToLower(captchaReq.Code) != strings.ToLower(answer) {
			c.JSON(http.StatusOK, gin.H{
				"code": 400,
				"msg":  "验证码错误",
				"data": nil,
			})
			c.Abort()
			return
		}

		// 验证码通过，继续执行后续逻辑
		c.Next()
	}
}
