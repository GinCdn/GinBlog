package utils

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// 本地缓存（缓存IP地区解析结果，有效期2小时）
var ipCache = NewSimpleCache()

// SimpleCache 简单本地缓存
type SimpleCache struct {
	data sync.Map
}

func NewSimpleCache() *SimpleCache {
	return &SimpleCache{}
}

func (c *SimpleCache) Set(key string, value interface{}, expire time.Duration) {
	c.data.Store(key, value)
	time.AfterFunc(expire, func() { c.data.Delete(key) })
}

func (c *SimpleCache) Get(key string) (interface{}, bool) {
	return c.data.Load(key)
}

// GetRealIP 获取用户真实IP（支持反向代理，且仅取单个IP）
func GetRealIP(c *gin.Context) string {
	// 处理 X-Forwarded-For（可能包含多个IP，逗号分隔）
	if ipStr := c.Request.Header.Get("X-Forwarded-For"); ipStr != "" {
		ips := strings.Split(ipStr, ",")
		for _, ip := range ips {
			trimmed := strings.TrimSpace(ip)
			if trimmed != "" {
				return trimmed // 取第一个非空IP
			}
		}
	}
	// 处理 X-Real-IP
	if ip := c.Request.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	//  fallback 到 ClientIP
	return c.ClientIP()
}

// GetIPRegion 通过ip138解析IP地区（格式：广东-深圳 / 北京）
// GetIPRegion 通过 ip-api 解析IP地区（格式：广东-深圳 / 北京）
func GetIPRegion(ip string) string {
	cacheKey := fmt.Sprintf("ip_region_%s", ip)
	if region, exists := ipCache.Get(cacheKey); exists {
		return region.(string)
	}

	// 调用 ip-api 接口（免费、稳定、支持中文）
	url := fmt.Sprintf("http://ip-api.com/json/%s?lang=zh-CN", ip)
	client := &http.Client{
		Timeout: 3 * time.Second,
	}
	resp, err := client.Get(url)
	if err != nil || resp.StatusCode != 200 {
		return "未知地区"
	}
	defer resp.Body.Close()

	var data struct {
		Status     string `json:"status"`
		RegionName string `json:"regionName"` // 省份
		City       string `json:"city"`       // 城市
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "未知地区"
	}

	if data.Status != "success" {
		return "未知地区"
	}

	// 组装地区格式
	region := fmt.Sprintf("%s-%s", data.RegionName, data.City)
	if data.RegionName == data.City {
		region = data.RegionName // 如“北京-北京”简化为“北京”
	}

	// 缓存2小时
	ipCache.Set(cacheKey, region, 7200*time.Second)
	return region
}
