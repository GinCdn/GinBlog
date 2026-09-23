package middleware

import (
	"bytes"
	"encoding/json"
	"strconv"
	"strings"

	"ginblog/utils"

	"github.com/gin-gonic/gin"
)

// desensitizeFields 定义需要统一脱敏的字段及处理函数。
var desensitizeFields = map[string]func(string) string{
	"phone":     utils.DesensitizePhone,
	"id_card":   utils.DesensitizeIDCard,
	"real_name": utils.DesensitizeRealName,
	"account":   func(value string) string { return utils.DesensitizeEmail(value) },
}

// DesensitizeMiddleware 拦截 JSON 响应并递归脱敏敏感字段。
func DesensitizeMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == "HEAD" || c.Writer.Written() {
			c.Next()
			return
		}

		writer := newResponseCapture(c.Writer)
		c.Writer = writer
		c.Next()

		if writer.body.Len() == 0 {
			return
		}

		contentType := writer.Header().Get("Content-Type")
		if !strings.Contains(contentType, "application/json") {
			writer.writeResponse(writer.body.Bytes())
			return
		}

		var payload any
		if err := json.Unmarshal(writer.body.Bytes(), &payload); err != nil {
			writer.writeResponse(writer.body.Bytes())
			return
		}

		desensitizeValue(payload)
		output, err := json.Marshal(payload)
		if err != nil {
			writer.writeResponse(writer.body.Bytes())
			return
		}
		writer.writeResponse(output)
	}
}

// desensitizeValue 递归遍历响应对象并替换敏感字段值。
func desensitizeValue(value any) {
	switch current := value.(type) {
	case map[string]any:
		for key, item := range current {
			if handler, ok := desensitizeFields[key]; ok {
				if text, ok := item.(string); ok && text != "" {
					current[key] = handler(text)
					continue
				}
			}
			desensitizeValue(item)
		}
	case []any:
		for _, item := range current {
			desensitizeValue(item)
		}
	}
}

// responseCapture 缓存下游响应，避免脱敏前的原始内容提前写入客户端。
type responseCapture struct {
	gin.ResponseWriter
	body        *bytes.Buffer
	status      int
	wroteHeader bool
}

// newResponseCapture 创建用于缓存响应正文的写入器。
func newResponseCapture(writer gin.ResponseWriter) *responseCapture {
	return &responseCapture{
		ResponseWriter: writer,
		body:           bytes.NewBuffer(nil),
		status:         writer.Status(),
	}
}

// WriteHeader 仅记录响应状态，统一在脱敏完成后再写回客户端。
func (writer *responseCapture) WriteHeader(code int) {
	if !writer.wroteHeader {
		writer.status = code
	}
}

// WriteHeaderNow 标记响应头已准备完成，但不立即输出原始响应。
func (writer *responseCapture) WriteHeaderNow() {
	if !writer.wroteHeader {
		writer.wroteHeader = true
	}
}

// Status 返回缓存响应的状态码。
func (writer *responseCapture) Status() int {
	if writer.status > 0 {
		return writer.status
	}
	return writer.ResponseWriter.Status()
}

// Size 返回已缓存的响应正文长度。
func (writer *responseCapture) Size() int {
	return writer.body.Len()
}

// Written 返回响应头是否已由下游处理器写入。
func (writer *responseCapture) Written() bool {
	return writer.wroteHeader
}

// Write 缓存响应正文，防止原始 JSON 与脱敏后的 JSON 重复输出。
func (writer *responseCapture) Write(data []byte) (int, error) {
	writer.WriteHeaderNow()
	return writer.body.Write(data)
}

// WriteString 缓存字符串响应正文。
func (writer *responseCapture) WriteString(value string) (int, error) {
	writer.WriteHeaderNow()
	return writer.body.WriteString(value)
}

// writeResponse 将最终响应一次性写回原始写入器。
func (writer *responseCapture) writeResponse(data []byte) {
	writer.ResponseWriter.Header().Set("Content-Length", strconv.Itoa(len(data)))
	writer.ResponseWriter.WriteHeader(writer.Status())
	writer.ResponseWriter.WriteHeaderNow()
	_, _ = writer.ResponseWriter.Write(data)
}
