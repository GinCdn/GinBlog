package result

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Result 结构数据定义（不变）
type Result struct {
	Code int         `json:"code"`
	Msg  string      `json:"msg"`
	Data interface{} `json:"data"`
}

// Success 成功响应（使用重命名后的StatusSuccess）
func Success(c *gin.Context, data interface{}) {
	if data == nil {
		data = gin.H{}
	}
	result := Result{
		Code: StatusSuccess, // 这里使用重命名后的常量
		Msg:  GetMsg(StatusSuccess, SubDefault),
		Data: data,
	}
	c.JSON(http.StatusOK, result)
}

// Failed 失败响应（不变）
func Failed(c *gin.Context, code int, subCode SubCode) {
	msg := GetMsg(code, subCode)
	if msg == "" {
		msg = GetMsg(code, SubDefault)
	}
	result := Result{
		Code: code,
		Msg:  msg,
		Data: gin.H{},
	}
	c.JSON(http.StatusOK, result)
}

// FailedWithMsg 支持自定义消息的失败响应
func FailedWithMsg(c *gin.Context, code int, msg string) {
	result := Result{
		Code: code,
		Msg:  msg, // 直接使用自定义消息
		Data: gin.H{},
	}
	c.JSON(http.StatusOK, result)
}
