package api

import (
	"time"

	. "ginblog/core"
	"ginblog/model"
	"ginblog/result"
	"ginblog/utils"

	"github.com/gin-gonic/gin"
)

// dashboardDailyCount 表示控制台按北京时间聚合后的单日数量。
type dashboardDailyCount struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

// dashboardDailyCounts 查询指定表在当前月份内的每日新增数量。
func dashboardDailyCounts(table string, start, end time.Time) ([]dashboardDailyCount, error) {
	items := make([]dashboardDailyCount, 0)
	err := Db.Table(table).
		Select("DATE(create_time) AS date, COUNT(*) AS count").
		Where("create_time >= ? AND create_time < ?", start, end).
		Group("DATE(create_time)").
		Order("date ASC").
		Scan(&items).Error
	return items, err
}

// AdminDashboardStat 返回管理员控制台所需的完整统计数据。
// 统计总数和待审核数量直接使用数据库聚合，避免受分页条数限制。
func AdminDashboardStat(c *gin.Context) {
	now := utils.Now()
	start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, utils.BeijingLocation)
	end := start.AddDate(0, 1, 0)

	var totalUsers, totalArticles, totalComments, totalTags, totalCategories int64
	var pendingComments, pendingArticles int64
	queries := []struct {
		query *int64
		model any
	}{
		{&totalUsers, &model.User{}},
		{&totalArticles, &model.Article{}},
		{&totalComments, &model.Comment{}},
		{&totalTags, &model.Tag{}},
		{&totalCategories, &model.Category{}},
	}
	for _, item := range queries {
		if err := Db.Model(item.model).Count(item.query).Error; err != nil {
			result.FailedWithMsg(c, result.InternalError, "获取控制台统计数据失败")
			return
		}
	}
	if err := Db.Model(&model.Comment{}).Where("status = ?", 0).Count(&pendingComments).Error; err != nil {
		result.FailedWithMsg(c, result.InternalError, "获取待审核评论数量失败")
		return
	}
	if err := Db.Model(&model.Article{}).Where("is_published = ?", false).Count(&pendingArticles).Error; err != nil {
		result.FailedWithMsg(c, result.InternalError, "获取待审核文章数量失败")
		return
	}

	users, err := dashboardDailyCounts("ginblog_user", start, end)
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "获取用户统计数据失败")
		return
	}
	articles, err := dashboardDailyCounts("ginblog_article", start, end)
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "获取文章统计数据失败")
		return
	}
	comments, err := dashboardDailyCounts("ginblog_comment", start, end)
	if err != nil {
		result.FailedWithMsg(c, result.InternalError, "获取评论统计数据失败")
		return
	}

	result.Success(c, gin.H{
		"total_users":         totalUsers,
		"total_articles":      totalArticles,
		"total_comments":      totalComments,
		"pending_comments":    pendingComments,
		"pending_articles":    pendingArticles,
		"total_tags":          totalTags,
		"total_categories":    totalCategories,
		"user_registration":   users,
		"article_publication": articles,
		"comment_creation":    comments,
		// 同时保留驼峰字段，兼容可能已经接入的前端调用方。
		"totalUsers":         totalUsers,
		"totalArticles":      totalArticles,
		"totalComments":      totalComments,
		"pendingComments":    pendingComments,
		"pendingArticles":    pendingArticles,
		"totalTags":          totalTags,
		"totalCategories":    totalCategories,
		"userRegistration":   users,
		"articlePublication": articles,
		"commentCreation":    comments,
		"month_start":        start.Format(utils.FormatTime),
		"month_end":          end.Format(utils.FormatTime),
	})
}
