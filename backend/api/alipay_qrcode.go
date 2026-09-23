package api

import (
	"net/url"
	"strings"

	"ginblog/result"

	"github.com/gin-gonic/gin"
	"github.com/skip2/go-qrcode"
)

// GenerateAlipayQRCode 为支付宝身份认证跳转地址生成二维码图片。
// 仅接受支付宝官方 HTTPS 域名，避免公共接口被用于生成任意内容二维码。
func GenerateAlipayQRCode(c *gin.Context) {
	rawURL := strings.TrimSpace(c.Query("url"))
	if rawURL == "" {
		result.FailedWithMsg(c, result.BadRequest, "认证链接不能为空")
		return
	}

	parsedURL, err := url.Parse(rawURL)
	if err != nil || parsedURL.Scheme != "https" || !isAlipayAuthHost(parsedURL.Hostname()) {
		result.FailedWithMsg(c, result.BadRequest, "认证链接无效")
		return
	}

	png, err := qrcode.Encode(rawURL, qrcode.Medium, 320)
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "生成认证二维码失败")
		return
	}

	c.Header("Cache-Control", "no-store")
	c.Data(200, "image/png", png)
}

// isAlipayAuthHost 校验身份认证链接是否属于支付宝官方域名。
func isAlipayAuthHost(host string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	return host == "alipay.com" || strings.HasSuffix(host, ".alipay.com")
}
