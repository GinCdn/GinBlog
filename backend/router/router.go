package router

import (
	"ginblog/api"
	"ginblog/config"
	_ "ginblog/docs"
	"ginblog/middleware"
	"ginblog/utils"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

// RouterInit 初始化 GinBlog 的接口、静态资源和前端路由。
func RouterInit() *gin.Engine {
	gin.SetMode(config.AppConfig.System.Env)
	router := gin.Default()
	if err := router.SetTrustedProxies([]string{"127.0.0.1"}); err != nil {
		return nil
	}

	router.Use(gin.Recovery())
	router.Use(middleware.Cors())

	// 上传配置
	router.StaticFS("/uploads", utils.NoListingFS{Fs: http.Dir(config.AppConfig.Upload.UploadDir)})

	regRouter(router)
	return router
}

// regRouter 注册业务接口，保持现有接口地址、鉴权方式和请求契约不变。
func regRouter(router *gin.Engine) {
	publicApi := router.Group("/api", middleware.OptionalUserAuthMiddleware())
	{
		publicApi.GET("/success", api.Success)
		publicApi.GET("/failed", api.Failed)
		publicApi.POST("/admin/login", api.AdminLogin)
		publicApi.POST("/SendCode", api.SendCode)
		publicApi.POST("/VerifyCode", api.VerifyCode)
		publicApi.POST("/user/register", api.CreateUser)
		publicApi.POST("/user/login", api.UserLogin)
		publicApi.POST("/CreateComment", api.CreateComment)
		publicApi.POST("/article/like", api.ToggleArticleLike)
		publicApi.POST("/article/favorite", api.ToggleArticleFavorite)
		publicApi.POST("/comment/like", api.ToggleCommentLike)
		publicApi.GET("/GetCommentInfo", api.GetCommentInfo)
		publicApi.GET("/GetSiteConfigInfo", api.GetSiteConfig)
		publicApi.GET("/carousel/list", api.GetPublicCarouselConfigs)
		publicApi.GET("/captcha", middleware.GenerateCaptcha)
		publicApi.POST("/captcha/verify", middleware.VerifyCaptcha)
		publicApi.GET("/GetSearch", api.GetSearch)
		publicApi.GET("/GetTagSearch", api.GetTagSearch)
		publicApi.GET("/GetProvinceAccess", api.GetProvinceAccess)
		publicApi.POST("/user/UpdateEmailPwd", api.UpdateEmailPwd)
		publicApi.GET("/GetCategoryChildrenInfo", api.GetCategoryChildrenInfo)
		publicApi.GET("/article/list", api.GetArticleList)
		publicApi.GET("/user/article/access", api.GetArticleAccess)
		publicApi.GET("/register/info", api.GetRegisterConfigPublic)
		publicApi.GET("/anti-brush/config", api.GetPublicAntiBrushConfig)
		publicApi.POST("/SendPhoneCode", api.SendPhoneCode)
		publicApi.POST("/VerifyPhoneCode", api.VerifyPhoneCode)
		// 支付平台无法携带站内登录令牌，回调接口仅依赖第三方签名进行验签。
		publicApi.Any("/pay/notify", api.HandleEpayNotify)
		publicApi.Any("/pay/return", api.HandleEpayReturn)
		publicApi.GET("/qrcode/alipay", api.GenerateAlipayQRCode)
		publicApi.GET("/user/alipay/realname/callback", api.HandleAliPayRealNameCallback)
	}
	jwtAdmin := router.Group("/api/admin", middleware.AdminAuthMiddleware())
	{
		jwtAdmin.POST("/updateAdminPwd", api.UpdateAdminPwd)
		jwtAdmin.POST("/update", api.UpdateAdmin)
		jwtAdmin.GET("/getAdminInfo", api.GetAdmin)
		jwtAdmin.POST("/CreateEmail", api.CreateEmail)
		jwtAdmin.POST("/UpdateEmail", api.UpdateEmail)
		jwtAdmin.GET("/getEmailInfo", api.GetEmail)
		jwtAdmin.POST("/CreateCategory", api.CreateCategory)
		jwtAdmin.POST("/UpdateCategory", api.UpdateCategory)
		jwtAdmin.PUT("/DeleteCategory", api.DeleteCategory)
		jwtAdmin.GET("/GetCategoryChildrenInfo", api.GetCategoryChildrenInfo)
		jwtAdmin.POST("/CreateArticle", api.CreateArticle)
		jwtAdmin.POST("/UpdateArticle", api.UpdateArticle)
		jwtAdmin.PUT("/DeleteArticle", api.DeleteArticle)
		jwtAdmin.GET("/GetArticleInfo", api.GetArticleInfo)
		jwtAdmin.POST("/CreateTag", api.CreateTag)
		jwtAdmin.POST("/UpdateTag", api.UpdateTag)
		jwtAdmin.PUT("/DeleteTag", api.DeleteTag)
		jwtAdmin.GET("/GetTagList", api.GetTagList)
		jwtAdmin.POST("/upload", api.Upload)
		jwtAdmin.POST("/CreateComment", api.CreateComment)
		jwtAdmin.PUT("/DeleteComment", api.DeleteComment)
		jwtAdmin.GET("/GetCommentInfo", api.GetCommentInfo)
		jwtAdmin.POST("/UpdateComment", api.UpdateComment)
		jwtAdmin.POST("/updateSiteConfig", api.UpdateSiteConfig)
		jwtAdmin.GET("/carousel/list", api.GetCarouselConfigs)
		jwtAdmin.POST("/carousel/update", api.UpdateCarouselConfig)
		jwtAdmin.GET("/GetUserInfo", api.GetUserInfo)
		jwtAdmin.POST("/CreateUser", api.CreateUserInfo)
		jwtAdmin.POST("/UpdateUser", api.UpdateUserInfo)
		jwtAdmin.PUT("/DeleteUser", api.DeleteUserInfo)
		jwtAdmin.GET("/user/stat", api.AdminUserStat)
		jwtAdmin.GET("/dashboard/stat", api.AdminDashboardStat)
		jwtAdmin.POST("/register/update", api.UpdateRegisterConfig)
		jwtAdmin.GET("/role/discount/list", api.GetRoleDiscountList)
		jwtAdmin.POST("/role/discount/update", api.UpdateRoleDiscount)
		jwtAdmin.GET("/payment/config/list", api.GetPaymentConfigs)
		jwtAdmin.POST("/payment/config/update", api.UpdatePaymentConfig)
		jwtAdmin.GET("/alipay/info", api.GetAlipayConfig)
		jwtAdmin.POST("/alipay/update", api.UpdateAlipayConfig)
		jwtAdmin.GET("/realname/config", api.GetRealNameConfig)
		jwtAdmin.POST("/realname/config/update", api.UpdateRealNameConfig)
		jwtAdmin.GET("/sms/config", api.GetSmsConfig)
		jwtAdmin.POST("/sms/config/update", api.UpdateSmsConfig)
		jwtAdmin.POST("/sms/test", api.TestSendSms)
		jwtAdmin.GET("/anti-brush/config", api.GetAntiBrushConfig)
		jwtAdmin.POST("/anti-brush/config/update", api.UpdateAntiBrushConfig)
		jwtAdmin.GET("/recharge/order", api.AdminRechargeOrders)
		jwtAdmin.GET("/pay/order/list", api.AdminPayOrders)
		jwtAdmin.GET("/promotion/config", api.GetPromotionConfigAdmin)
		jwtAdmin.POST("/promotion/config", api.UpdatePromotionConfig)
		jwtAdmin.GET("/promotion/userList", api.AdminPromotionUsers)
		jwtAdmin.GET("/promotion/inviteList", api.AdminInviteRelations)
		jwtAdmin.GET("/promotion/commissionList", api.AdminCommissionList)
		jwtAdmin.GET("/withdrawal/list", api.AdminWithdrawals)
		jwtAdmin.POST("/withdrawal/review", api.ReviewWithdrawal)
	}

	jwtUser := router.Group("/api/user", middleware.UsreAuthMiddleware())
	{
		jwtUser.POST("/update", api.UpdateUser)
		jwtUser.POST("/updatePwd", api.UpdateUserPwd)
		jwtUser.GET("/getUserInfo", middleware.DesensitizeMiddleware(), api.GetUser)
		jwtUser.GET("/getUser", middleware.DesensitizeMiddleware(), api.GetUser)
		jwtUser.POST("/update/email", api.UpdateUserEmail)
		jwtUser.GET("/role/discount/list", api.GetRoleDiscountList)
		jwtUser.GET("/realname/info", middleware.DesensitizeMiddleware(), api.GetRealNameInfo)
		jwtUser.POST("/alipay/realname/verify", middleware.DesensitizeMiddleware(), api.VerifyRealName)
		jwtUser.POST("/recharge/create", api.CreateRecharge)
		jwtUser.GET("/pay/order/list", api.GetUserOrders)
		jwtUser.POST("/promotion/apply", api.ApplyPromotion)
		jwtUser.GET("/promotion/status", api.GetPromotionStatus)
		jwtUser.GET("/promotion/stats", api.GetPromotionStats)
		jwtUser.GET("/promotion/inviteeList", api.GetInviteeList)
		jwtUser.GET("/commission/list", api.GetUserCommissionList)
		jwtUser.POST("/withdrawal/apply", api.ApplyWithdrawal)
		jwtUser.GET("/withdrawal/list", api.GetUserWithdrawals)
		jwtUser.POST("/article/purchase", api.PurchaseArticle)
		jwtUser.POST("/CreateArticle", api.CreateArticle)
		jwtUser.POST("/UpdateArticle", api.UpdateArticle)
		jwtUser.PUT("/DeleteArticle", api.DeleteArticle)
		jwtUser.GET("/GetArticleInfo", api.GetArticleInfo)
		jwtUser.POST("/CreateTag", api.CreateTag)
		jwtUser.POST("/UpdateTag", api.UpdateTag)
		jwtUser.PUT("/DeleteTag", api.DeleteTag)
		jwtUser.GET("/GetTagList", api.GetTagList)
		jwtUser.POST("/upload", api.UserUpload)
		jwtUser.POST("/CreateComment", api.CreateComment)
		jwtUser.PUT("/DeleteComment", api.DeleteComment)
		jwtUser.GET("/GetCommentInfo", api.GetCommentInfo)
		jwtUser.GET("/GetCategoryChildrenInfo", api.GetCategoryChildrenInfo)
	}

	router.GET("/doc/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	// 静态资源挂载：物理目录改为 ./web，URL 前缀仍为 /web
	// 静态资源挂载：物理目录改为 ./web，URL 前缀仍为 /web
	router.Static("/assets", "./web/assets")

	// 根路径直接返回前端入口，前端使用浏览器路由。
	router.GET("/", func(c *gin.Context) {
		c.File(filepath.Join("./web", "index.html"))
	})
	router.GET("/index.html", func(c *gin.Context) {
		c.File(filepath.Join("./web", "index.html"))
	})

	// 管理员和用户快捷入口。
	router.GET("/admin", func(c *gin.Context) {
		c.Redirect(http.StatusPermanentRedirect, "/admin/login")
	})
	router.GET("/admin/index.html", func(c *gin.Context) {
		c.Redirect(http.StatusPermanentRedirect, "/admin/login")
	})
	router.GET("/admin/login.html", func(c *gin.Context) {
		c.Redirect(http.StatusPermanentRedirect, "/admin/login")
	})
	router.GET("/user", func(c *gin.Context) {
		// 由前端路由根据登录状态跳转到用户中心或登录页。
		c.File(filepath.Join("./web", "index.html"))
	})
	router.GET("/user/index.html", func(c *gin.Context) {
		c.File(filepath.Join("./web", "index.html"))
	})
	router.GET("/user/login.html", func(c *gin.Context) {
		c.Redirect(http.StatusPermanentRedirect, "/user/login")
	})

	// 浏览器路由刷新或直达前端页面时返回入口文件，接口不存在仍返回 404 页面。
	router.NoRoute(func(c *gin.Context) {
		if c.Request.Method == http.MethodGet && !strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.File(filepath.Join("./web", "index.html"))
			return
		}
		c.File(filepath.Join("./web", "404.html"))
	})
}
