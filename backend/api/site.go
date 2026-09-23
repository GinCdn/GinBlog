package api

import (
	"errors"
	. "ginblog/core"
	"ginblog/global"
	"ginblog/model"
	"ginblog/result"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// UpdateSiteConfig 更新站点配置。
// @Summary 更新站点配置
// @Tags 站点配置相关接口
// @Produce json
// @Param title formData string false "站点标题"
// @Param sub_title formData string false "副标题"
// @Param keywords formData string false "关键词"
// @Param logo formData string false "Logo URL"
// @Param favicon formData string false "Favicon URL"
// @Param admin_email formData string false "管理员邮箱"
// @Param admin_kf_qq formData string false "客服QQ"
// @Param description formData string false "站点描述"
// @Param icp_record formData string false "ICP备案号"
// @Param comment_moderation formData bool false "是否开启评论审核"
// @Param copyright formData string false "版权信息"
// @Success 200 {object} result.Result{data=model.SiteConfig}
// @Failure 400 {object} result.Result
// @Failure 401 {object} result.Result
// @Failure 500 {object} result.Result
// @router /api/admin/updateSiteConfig [post]
// @Security ApiKeyAuth
func UpdateSiteConfig(c *gin.Context) {
	var dto model.UpdateSiteConfig
	if err := c.ShouldBind(&dto); err != nil {
		global.Log.Warnf("站点配置参数校验失败: %v, dto=%+v", err, dto)
		result.FailedWithMsg(c, result.BadRequest, "参数校验失败，logo/favicon 必须为合法的 URL 地址")
		return
	}

	var currentConfig model.SiteConfig
	if err := Db.First(&currentConfig, 1).Error; err != nil {
		global.Log.Errorf("查询站点配置失败: %v", err)
		result.FailedWithMsg(c, result.InternalError, "站点配置读取失败")
		return
	}

	updateData := make(map[string]interface{})
	if dto.Title != "" {
		updateData["title"] = dto.Title
	}
	if dto.SubTitle != "" {
		updateData["sub_title"] = dto.SubTitle
	}
	if dto.Keywords != "" {
		updateData["keywords"] = dto.Keywords
	}
	if dto.Logo != "" {
		updateData["logo"] = dto.Logo
	}
	if dto.Favicon != "" {
		updateData["favicon"] = dto.Favicon
	}
	if dto.AdminEmail != "" {
		updateData["admin_email"] = dto.AdminEmail
	}
	if dto.AdminKfQQ != "" {
		updateData["admin_kf_qq"] = dto.AdminKfQQ
	}
	if dto.Description != "" {
		updateData["description"] = dto.Description
	}
	if dto.IcpRecord != "" {
		updateData["icp_record"] = dto.IcpRecord
	}
	if c.PostForm("comment_moderation") != "" {
		updateData["comment_moderation"] = dto.CommentModeration
	}
	if _, exists := c.Request.PostForm["comment_email_notify"]; exists {
		updateData["comment_email_notify"] = dto.CommentEmailNotify
	}
	if dto.Copyright != "" {
		updateData["copyright"] = dto.Copyright
	}

	if err := Db.Model(&currentConfig).Where("id = ?", 1).Updates(updateData).Error; err != nil {
		global.Log.Errorf("更新站点配置失败: %v", err)
		result.Failed(c, result.ServiceUnavail, result.UpdateError)
		return
	}

	result.Success(c, true)
}

// GetSiteConfig 获取站点配置。
// @Summary 获取站点配置
// @Tags 站点配置相关接口
// @Produce json
// @Success 200 {object} result.Result
// @router /api/GetSiteConfigInfo [get]
func GetSiteConfig(c *gin.Context) {
	var dto model.SiteConfig
	if err := Db.First(&dto).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			result.FailedWithMsg(c, result.NotFound, "站点配置尚未初始化")
		} else {
			result.Failed(c, result.InternalError, result.InfoDateError)
		}
		return
	}
	result.Success(c, dto)
}
