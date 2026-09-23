package api

import (
	"errors"
	"fmt"
	"time"

	"ginblog/core"

	"github.com/go-redis/redis/v8"
)

// loginLimitConfig 登录失败保护配置。
type loginLimitConfig struct {
	KeyPrefix    string
	MaxUserFails int64
	MaxIPFails   int64
	LockDuration time.Duration
}

var (
	// adminLoginLimitConfig 管理员登录失败保护配置。
	adminLoginLimitConfig = loginLimitConfig{
		KeyPrefix:    "ginblog:admin:login:",
		MaxUserFails: 5,
		MaxIPFails:   50,
		LockDuration: time.Hour,
	}
	// userLoginLimitConfig 用户登录失败保护配置。
	userLoginLimitConfig = loginLimitConfig{
		KeyPrefix:    "ginblog:user:login:",
		MaxUserFails: 5,
		MaxIPFails:   50,
		LockDuration: time.Hour,
	}
)

// loginLimitType 登录失败保护触发维度。
type loginLimitType uint8

const (
	loginLimitNone loginLimitType = iota
	loginLimitByIP
	loginLimitByUsername
)

// checkLoginLimit 检查当前 IP 和账号是否已达到登录失败限制。
func checkLoginLimit(config loginLimitConfig, username, clientIP string) (loginLimitType, int64, error) {
	if core.Redis == nil {
		return loginLimitNone, 0, errors.New("Redis客户端未初始化")
	}

	ipKey := config.KeyPrefix + "ip_limit:" + clientIP
	ipCount, err := core.Redis.Get(core.RedisCtx, ipKey).Int64()
	if err != nil && !errors.Is(err, redis.Nil) {
		return loginLimitNone, 0, fmt.Errorf("获取IP登录失败次数失败: %w", err)
	}
	if ipCount >= config.MaxIPFails {
		return loginLimitByIP, 0, nil
	}

	usernameKey := config.KeyPrefix + "fail:" + username
	usernameCount, err := core.Redis.Get(core.RedisCtx, usernameKey).Int64()
	if err != nil && !errors.Is(err, redis.Nil) {
		return loginLimitNone, 0, fmt.Errorf("获取账号登录失败次数失败: %w", err)
	}
	if usernameCount >= config.MaxUserFails {
		return loginLimitByUsername, 0, nil
	}

	return loginLimitNone, config.MaxUserFails - usernameCount, nil
}

// recordLoginFail 原子记录 IP 和账号两个维度的登录失败次数。
func recordLoginFail(config loginLimitConfig, username, clientIP string) error {
	if core.Redis == nil {
		return errors.New("Redis客户端未初始化")
	}

	const luaScript = `
		local key = KEYS[1]
		local ttl = tonumber(ARGV[1])
		local count = redis.call('INCR', key)
		if count == 1 then
			redis.call('EXPIRE', key, ttl)
		end
		return count
	`
	ttlSeconds := int(config.LockDuration.Seconds())

	if _, err := core.Redis.Eval(core.RedisCtx, luaScript, []string{config.KeyPrefix + "ip_limit:" + clientIP}, ttlSeconds).Result(); err != nil {
		return fmt.Errorf("记录IP登录失败次数失败: %w", err)
	}
	if _, err := core.Redis.Eval(core.RedisCtx, luaScript, []string{config.KeyPrefix + "fail:" + username}, ttlSeconds).Result(); err != nil {
		return fmt.Errorf("记录账号登录失败次数失败: %w", err)
	}
	return nil
}

// clearLoginFail 登录成功后清除账号维度的失败次数，保留 IP 维度统计。
func clearLoginFail(config loginLimitConfig, username string) error {
	if core.Redis == nil {
		return errors.New("Redis客户端未初始化")
	}
	if err := core.Redis.Del(core.RedisCtx, config.KeyPrefix+"fail:"+username).Err(); err != nil {
		return fmt.Errorf("清除账号登录失败次数失败: %w", err)
	}
	return nil
}
