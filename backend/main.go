package main

import (
	"fmt"
	"ginblog/config"
	"ginblog/controller"
	"ginblog/core"
	"ginblog/global"
	"ginblog/model"
	"ginblog/router"
	"ginblog/service"
)

// @title GinBlog博客系统
// @version 1.0.1
// @description GinBlog博客系统API接口文档
// @securityDefinitions.apikey ApiKeyAuth
// @in header
// @name Authorization
func main() {
	// 初始化系统配置
	config.Init()
	// 初始化日志系统
	global.Log = core.InitLogger(config.AppConfig.Logger)
	// 添加 IP 授权前置检查
	controller.PreCheckAuth()
	// 初始化数据库
	if err := core.MysqlInit(); err != nil {
		global.Log.Errorf("[MySQL] 初始化失败：%v", err)
	}
	// 初始化 Redis
	if err := core.RedisInit(); err != nil {
		global.Log.Errorf("[Redis] 初始化失败：%v", err)
	}

	// 迁移数据库模型；管理员表此前未纳入迁移，其令牌版本号字段依赖此次迁移创建。
	if err := core.Db.AutoMigrate(&model.SiteConfig{}, &model.RegisterSetting{}, &model.RoleDiscount{}, &model.PaymentConfig{}, &model.SmsConfig{}, &model.SmsCode{}, &model.AntiBrushConfig{}, &model.AlipayConfig{}, &model.RealNameConfig{}, &model.UserRealNameAuth{}, &model.PromotionConfig{}, &model.Promotion{}, &model.InviteRelation{}, &model.Commission{}, &model.Withdrawal{}, &model.RechargeOrder{}, &model.PayOrder{}, &model.Article{}, &model.ArticlePurchase{}, &model.TagSearch{}, &model.Comment{}, &model.ArticleLike{}, &model.CommentLike{}, &model.ArticleFavorite{}, &model.CarouselConfig{}, &model.User{}, &model.Admin{}); err != nil {
		global.Log.Errorf("数据库模型迁移失败：%v", err)
	}
	// 将已有评论表转换为 utf8mb4，保证四字节表情可以保存。
	if err := core.Db.Exec("ALTER TABLE ginblog_comment CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci").Error; err != nil {
		global.Log.Warnf("评论表 utf8mb4 转换失败：%v", err)
	}

	// 初始化用户模型 ID 自增
	if err := model.Auto(core.Db); err != nil {
		global.Log.Errorf("用户模型 ID 自增初始化失败：%v", err)
	}
	// 初始化 JWT
	if err := core.InitAdminJWT(); err != nil {
		global.Log.Errorf("管理员 JWT 初始化失败：%v", err)
	}
	if err := core.InitUserJWT(); err != nil {
		global.Log.Errorf("用户 JWT 初始化失败：%v", err)
	}

	// 启动路由前开启推广佣金延迟结算任务，不改变文章购买主流程。
	go service.StartCommissionSettlementTask()

	router2 := router.RouterInit()
	// 构建启动地址
	address := fmt.Sprintf("%s:%s",
		config.AppConfig.System.Host,
		config.AppConfig.System.Port)
	global.Log.Infof("系统启动成功，运行在：%s", address)
	if err := router2.Run(address); err != nil {
		global.Log.Errorf("系统启动失败：%v", err)
	}
}
