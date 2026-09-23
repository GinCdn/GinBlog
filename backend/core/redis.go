package core

import (
	"context"
	"fmt"
	"sync"

	"ginblog/config"
	"ginblog/global"

	"github.com/go-redis/redis/v8"
)

// Redis 全局 Redis 客户端
var Redis *redis.Client

// RedisCtx 全局上下文，所有 Redis 操作共用
var RedisCtx = context.Background()

// redisOnce 关闭锁，确保连接只关闭一次
var redisOnce sync.Once

// RedisInit 从配置文件初始化 Redis 连接
func RedisInit() error {
	addr := fmt.Sprintf("%s:%d", config.AppConfig.Redis.Host, config.AppConfig.Redis.Port)
	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: config.AppConfig.Redis.Password,
		DB:       config.AppConfig.Redis.DB,
	})
	if _, err := client.Ping(RedisCtx).Result(); err != nil {
		_ = client.Close()
		global.Log.Errorf("[Redis] 连接失败 %s: %v", addr, err)
		return err
	}
	Redis = client
	global.Log.Infof("[Redis] 连接成功 %s", addr)
	return nil
}

// CloseRedis 程序退出时安全关闭 Redis 连接
func CloseRedis() {
	if Redis != nil {
		redisOnce.Do(func() {
			_ = Redis.Close()
			global.Log.Info("[Redis] 连接已关闭")
		})
	}
}