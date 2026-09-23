package controller

import (
	"encoding/json"
	"fmt"
	"ginblog/config"
	"ginblog/global"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// AuthResponse 统一授权响应结构体
type AuthResponse struct {
	Code int         `json:"code"`
	Msg  string      `json:"msg"`
	Data interface{} `json:"data"`
}

// checkIPAuth 调用新版 CheckIpsAuth 接口
func checkIPAuth(appKeys []string, authCode string) (*AuthResponse, error) {
	apiURL := "https://auth.shuha.cn/api/CheckIpsAuth"

	formData := url.Values{}
	for _, key := range appKeys {
		formData.Add("app_keys", key)
	}
	formData.Set("auth_code", authCode)

	req, err := http.NewRequest("POST", apiURL, strings.NewReader(formData.Encode()))
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %v", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求授权服务器失败: %v", err)
	}
	defer resp.Body.Close()

	// ✅ 限制最大读取 1MB，防止异常响应导致 OOM
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("授权服务器HTTP异常(%d): %s", resp.StatusCode, string(body))
	}

	var authResp AuthResponse
	if err := json.Unmarshal(body, &authResp); err != nil {
		return nil, fmt.Errorf("解析授权响应失败: %v, 原始内容: %s", err, string(body))
	}

	return &authResp, nil
}

// PreCheckAuth 启动前置授权检查（带重试）
func PreCheckAuth() {
	authCode := strings.TrimSpace(config.AppConfig.Auth.AuthCode)
	appKeys := []string{"ginblog"}

	if authCode == "" {
		global.Log.Fatal("❌ 授权码未配置，请在配置文件中设置 auth.authCode")
	}

	global.Log.Infof("🔐 正在验证IP授权，应用标识: %v", appKeys)

	// ✅ 避免变量名与包名 result 冲突
	var authResult *AuthResponse
	var err error

	// ✅ 启动检查增加 3 次重试，避免网络抖动导致服务无法启动
	maxRetries := 3
	for i := 0; i < maxRetries; i++ {
		authResult, err = checkIPAuth(appKeys, authCode)
		if err == nil && authResult.Code == 200 {
			break
		}
		if i < maxRetries-1 {
			global.Log.Warnf("⚠️ 授权验证第%d次失败: %v，%d秒后重试...", i+1, err, (i+1)*2)
			time.Sleep(time.Duration(i+1) * 2 * time.Second)
		}
	}

	if err != nil {
		global.Log.Fatalf("❌ 授权验证过程出错（已重试%d次）: %v", maxRetries, err)
	}

	if authResult.Code != 200 {
		global.Log.Fatalf("❌ IP授权验证失败: %s（错误码: %d）", authResult.Msg, authResult.Code)
	}

	global.Log.Info("✅ IP授权验证通过，继续启动系统...")
}
