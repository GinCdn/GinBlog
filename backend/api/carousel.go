package api

import (
	"errors"
	"strings"

	. "ginblog/core"
	"ginblog/global"
	"ginblog/model"
	"ginblog/result"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GetCarouselConfigs 获取管理端首页轮播图配置，返回一至六个固定展示位中已保存的记录。
func GetCarouselConfigs(c *gin.Context) {
	var configs []model.CarouselConfig
	if err := Db.Order("sort asc, id asc").Find(&configs).Error; err != nil {
		global.Log.Errorf("获取轮播图配置失败: %v", err)
		result.Failed(c, result.InternalError, result.InfoDateError)
		return
	}
	result.Success(c, configs)
}

// GetPublicCarouselConfigs 获取前台启用的首页轮播图配置。
func GetPublicCarouselConfigs(c *gin.Context) {
	var configs []model.CarouselConfig
	if err := Db.Where("status = ? AND image <> ''", true).Order("sort asc, id asc").Find(&configs).Error; err != nil {
		global.Log.Errorf("获取前台轮播图失败: %v", err)
		result.Failed(c, result.InternalError, result.InfoDateError)
		return
	}
	result.Success(c, configs)
}

// UpdateCarouselConfig 更新单个轮播图展示位，图片为空时保留该展示位但不在前台显示。
func UpdateCarouselConfig(c *gin.Context) {
	var dto model.UpdateCarouselConfig
	if err := c.ShouldBind(&dto); err != nil {
		result.FailedWithMsg(c, result.BadRequest, "轮播图编号必须为1到6")
		return
	}

	dto.Image = strings.TrimSpace(dto.Image)
	dto.Link = strings.TrimSpace(dto.Link)
	if dto.Image == "" {
		dto.Status = boolPtr(false)
	}
	var config model.CarouselConfig
	err := Db.First(&config, dto.ID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		config = model.CarouselConfig{ID: dto.ID, Image: dto.Image, Link: dto.Link, Sort: dto.Sort, Status: dto.Image != ""}
		if dto.Status != nil && dto.Image != "" {
			config.Status = *dto.Status
		}
		if err := Db.Create(&config).Error; err != nil {
			global.Log.Errorf("创建轮播图配置失败: %v", err)
			result.Failed(c, result.InternalError, result.UpdateError)
			return
		}
		result.Success(c, config)
		return
	}
	if err != nil {
		global.Log.Errorf("查询轮播图配置失败: %v", err)
		result.Failed(c, result.InternalError, result.InfoDateError)
		return
	}

	updates := map[string]interface{}{"image": dto.Image, "link": dto.Link, "sort": dto.Sort}
	if dto.Status != nil {
		updates["status"] = *dto.Status && dto.Image != ""
	}
	if dto.Image == "" {
		updates["status"] = false
	}
	if err := Db.Model(&config).Where("id = ?", dto.ID).Updates(updates).Error; err != nil {
		global.Log.Errorf("更新轮播图配置失败: %v", err)
		result.Failed(c, result.InternalError, result.UpdateError)
		return
	}
	if err := Db.First(&config, dto.ID).Error; err != nil {
		result.Failed(c, result.InternalError, result.InfoDateError)
		return
	}
	result.Success(c, config)
}

// boolPtr 返回布尔指针，供更新请求区分未传入和明确传入的开关值。
func boolPtr(value bool) *bool { return &value }
