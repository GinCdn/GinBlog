package api

import (
	"fmt"
	. "ginblog/core"
	"ginblog/model"
	"ginblog/result"
	"ginblog/utils"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"strconv"
	"strings"
)

// GetSearch 搜索文章（修复标签搜索+精准统计）
// @Summary 搜索文章（单关键词/多维度+分页+精准统计）
// @Tags 搜索统计相关接口
// @Produce json
// @Description 1. IP统计：仅访问单篇文章ID时触发；2. 标签统计：仅单搜索框搜标签/多字段传tag_names时触发；3. 浏览量：仅访问单篇ID时+1
// @Param page query int false "页码（默认1，最小1）"
// @Param page_size query int false "每页条数（默认20，最大100）"
// @Param keyword query string false "单搜索框关键词（数字=ID，文本=标题/描述/内容/标签名）"
// @Param id query uint false "文章ID（精确搜索，浏览量+1，IP统计触发）"
// @Param title query string false "文章标题（模糊搜索）"
// @Param content query string false "文章内容（模糊搜索）"
// @Param description query string false "文章描述（模糊搜索）"
// @Param tag_names query []string false "标签名列表（多字段标签搜索，标签统计触发）"
// @Success 200 {object} result.Result{data=model.PageResponse} "搜索成功"
// @Failure 400 {object} result.Result "参数错误（含标签不存在）"
// @Failure 500 {object} result.Result "服务器错误"
// @router /api/GetSearch [get]
func GetSearch(c *gin.Context) {
	// 1. 参数绑定与XSS净化（重点：标签名仅去空格，保留原始中文）
	var dto model.ArticleSearch
	if err := c.ShouldBindQuery(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}
	sanitizer := utils.GetSanitizer()
	// 文本字段XSS净化（保留中文）
	dto.Keyword = sanitizer.Sanitize(dto.Keyword)
	dto.Title = sanitizer.Sanitize(dto.Title)
	dto.Description = sanitizer.Sanitize(dto.Description)
	dto.Content = sanitizer.Sanitize(dto.Content)
	// 标签名处理：仅去前后空格，不做额外净化（避免中文被误处理）
	var rawTagNames []string
	for _, name := range dto.TagNames {
		trimmed := strings.TrimSpace(name) // 去除用户输入的空格
		if trimmed != "" {
			rawTagNames = append(rawTagNames, trimmed)
			println(fmt.Sprintf("接收标签名（去空格后）：%s", trimmed)) // 新增日志
		}
	}
	dto.TagNames = rawTagNames

	// 2. 分页参数初始化
	page := dto.Page
	if page == 0 {
		page = 1
	}
	pageSize := dto.PageSize
	if pageSize == 0 {
		pageSize = 20
	} else if pageSize > 100 { // 限制最大页大小，避免性能问题
		pageSize = 100
	}
	offset := (page - 1) * pageSize

	// 3. 标签名去重（多字段标签搜索用，避免重复查询）
	var multiTagNames []string
	if len(dto.TagNames) > 0 {
		tagMap := make(map[string]struct{})
		for _, name := range dto.TagNames {
			if name != "" {
				tagMap[name] = struct{}{}
			}
		}
		multiTagNames = make([]string, 0, len(tagMap))
		for name := range tagMap {
			multiTagNames = append(multiTagNames, name)
		}
	}
	// 新增日志：确认最终用于查询的标签名
	println(fmt.Sprintf("最终用于查询的标签名列表：%v，长度：%d", multiTagNames, len(multiTagNames)))

	// 4. 构建搜索查询（核心修复：SQL逻辑连接问题）
	db := Db.Model(&model.Article{}).
		Preload("Category").
		Preload("Author").
		Preload("Tags").                // 预加载标签，方便返回结果查看
		Where("is_published = ?", true) // 基础条件：只查已发布的文章

	var (
		isIDSearch        bool          // 是否为ID搜索（单搜索框）
		singleTagKeywords []uint        // 单搜索框文本匹配的标签ID（用于标签统计）
		searchConditions  []string      // 搜索条件容器（存储所有搜索条件）
		searchArgs        []interface{} // 搜索参数容器
	)

	// 4.1 单搜索框逻辑（拆分ID/文本）
	if dto.Keyword != "" {
		keyword := "%" + dto.Keyword + "%"
		// 判断是否为ID搜索
		if parsedID, err := strconv.ParseUint(dto.Keyword, 10, 64); err == nil {
			isIDSearch = true
			// ID精确匹配：加入搜索条件容器
			searchConditions = append(searchConditions, "id = ?")
			searchArgs = append(searchArgs, uint(parsedID))
		} else {
			// 文本搜索：匹配标题/描述/内容+标签名（标签名兼容空格）
			searchConditions = append(searchConditions,
				"title LIKE ?",
				"description LIKE ?",
				"content LIKE ?",
				"EXISTS (SELECT 1 FROM ginblog_article_tag at JOIN ginblog_tag t ON at.tag_id = t.id WHERE at.article_id = ginblog_article.id AND TRIM(t.name) LIKE ?)",
			)
			searchArgs = append(searchArgs, keyword, keyword, keyword, keyword)

			// 预查询单搜索框匹配的标签ID（用于标签统计，兼容空格）
			if err := Db.Model(&model.Tag{}).
				Where("TRIM(name) LIKE ?", keyword). // 数据库标签名去空格后模糊匹配
				Pluck("id", &singleTagKeywords).Error; err != nil {
				println(fmt.Sprintf("单搜索框标签匹配失败: err=%v", err))
			}
		}
	}

	// 4.2 多字段逻辑（ID/标题/内容+标签搜索）
	if !isIDSearch && dto.ID > 0 { // 避免与单搜索框ID搜索重复
		searchConditions = append(searchConditions, "id = ?")
		searchArgs = append(searchArgs, dto.ID)
	}
	if dto.Title != "" {
		searchConditions = append(searchConditions, "title LIKE ?")
		searchArgs = append(searchArgs, "%"+dto.Title+"%")
	}
	if dto.Description != "" {
		searchConditions = append(searchConditions, "description LIKE ?")
		searchArgs = append(searchArgs, "%"+dto.Description+"%")
	}
	if dto.Content != "" {
		searchConditions = append(searchConditions, "content LIKE ?")
		searchArgs = append(searchArgs, "%"+dto.Content+"%")
	}

	// 核心修复：将所有搜索条件用 AND 连接到基础条件（is_published = true）
	if len(searchConditions) > 0 {
		// 用括号包裹所有搜索条件，内部用 OR 组合，外部用 AND 连接基础条件
		conditionStr := "(" + strings.Join(searchConditions, " OR ") + ")"
		db = db.Where(conditionStr, searchArgs...)
	}

	// 核心修复：多字段标签搜索（兼容标签名空格/编码/特殊字符）
	var validTagIDs []uint
	if len(multiTagNames) > 0 {
		println("=== 进入多字段标签搜索逻辑 ===") // 新增日志
		// 步骤1：校验标签是否存在（放宽匹配条件：模糊匹配+TRIM，兼容特殊字符）
		conditions := make([]string, 0, len(multiTagNames))
		args := make([]interface{}, 0, len(multiTagNames))
		for _, name := range multiTagNames {
			// 修复：从精确匹配改为模糊匹配，兼容空格、全角字符、隐藏字符
			conditions = append(conditions, "TRIM(name) LIKE ?")
			args = append(args, "%"+name+"%")                               // 前后加%，支持部分匹配
			println(fmt.Sprintf("标签查询条件：TRIM(name) LIKE %s", "%"+name+"%")) // 新增日志
		}

		// 查询有效标签ID
		if err := Db.Model(&model.Tag{}).
			Where(strings.Join(conditions, " OR "), args...).
			Pluck("id", &validTagIDs).Error; err != nil {
			result.Failed(c, result.InternalError, "标签查询失败")
			return
		}

		// 新增日志：打印查询结果
		println(fmt.Sprintf("标签查询结果：匹配到标签ID=%v，数量=%d", validTagIDs, len(validTagIDs)))

		// 步骤2：处理无效标签（强制触发错误，避免返回200）
		if len(validTagIDs) == 0 {
			println("=== 标签不存在，返回400错误 ===") // 新增日志
			result.FailedWithMsg(c, result.BadRequest, "标签不存在："+strings.Join(multiTagNames, ","))
			return
		}

		// 检查部分无效标签
		if len(validTagIDs) < len(multiTagNames) {
			var existTagNames []string
			Db.Model(&model.Tag{}).
				Where("id IN (?)", validTagIDs).
				Pluck("TRIM(name)", &existTagNames) // 取去空格后的标签名
			invalidTags := []string{}
			for _, t := range multiTagNames {
				found := false
				for _, exist := range existTagNames {
					// 模糊匹配判断，避免因字符集问题误判
					if strings.Contains(exist, t) {
						found = true
						break
					}
				}
				if !found {
					invalidTags = append(invalidTags, t)
				}
			}
			if len(invalidTags) > 0 {
				println(fmt.Sprintf("=== 存在无效标签，返回400错误：%v ===", invalidTags)) // 新增日志
				result.FailedWithMsg(c, result.BadRequest, "无效标签："+strings.Join(invalidTags, ","))
				return
			}
		}

		// 步骤3：关联查询（用ID匹配，避免名称问题；默认交集逻辑）
		db = db.
			Joins("JOIN ginblog_article_tag ON ginblog_article_tag.article_id = ginblog_article.id").
			Joins("JOIN ginblog_tag ON ginblog_tag.id = ginblog_article_tag.tag_id").
			Where("ginblog_tag.id IN (?)", validTagIDs).
			Group("ginblog_article.id").
			Having("COUNT(DISTINCT ginblog_tag.id) = ?", len(validTagIDs))
		println(fmt.Sprintf("=== 标签关联查询：已关联中间表，标签ID=%v ===", validTagIDs)) // 新增日志
	}

	// 5. 统计总条数与分页查询
	var total int64
	if err := db.Count(&total).Error; err != nil {
		result.Failed(c, result.InternalError, result.QueryError)
		return
	}
	println(fmt.Sprintf("=== 符合条件的已发布文章总数：%d ===", total)) // 新增日志

	var articleList []model.Article
	if err := db.Limit(pageSize).Offset(offset).Order("create_time DESC").Find(&articleList).Error; err != nil {
		result.Failed(c, result.InternalError, result.QueryError)
		return
	}

	// 6. IP统计（仅访问单篇文章ID时触发）
	var targetArticleID uint = 0
	if (isIDSearch || dto.ID > 0) && len(articleList) == 1 { // ID搜索且返回单篇
		targetArticleID = articleList[0].ID
		// 异步执行IP+省份统计
		go func(articleID uint, articleTitle string) {
			ip := utils.GetRealIP(c)
			if ip == "" || ip == "127.0.0.1" || ip == "::1" {
				println(fmt.Sprintf("IP统计：本地IP访问文章ID=%d，跳过", articleID))
				return
			}

			region := utils.GetIPRegion(ip)
			province := strings.Split(region, "-")[0]
			if province == "未知地区" {
				province = "未知地区"
			}

			// 更新IPAccess
			_ = Db.Transaction(func(tx *gorm.DB) error {
				var ipStats model.IPAccess
				if tx.Where("ip = ?", ip).First(&ipStats).Error == gorm.ErrRecordNotFound {
					ipStats = model.IPAccess{
						IP:           ip,
						AccessCount:  1,
						Region:       region,
						LastAccessAt: utils.HTime{Time: utils.Now()},
					}
					println(fmt.Sprintf("IP统计[访问文章]：新增IP=%s，文章=%s(ID=%d)", ip, articleTitle, articleID))
					return tx.Create(&ipStats).Error
				}
				println(fmt.Sprintf("IP统计[访问文章]：更新IP=%s，文章=%s(ID=%d)，累计访问=%d", ip, articleTitle, articleID, ipStats.AccessCount+1))
				return tx.Model(&ipStats).Updates(map[string]interface{}{
					"access_count":   gorm.Expr("access_count + 1"),
					"last_access_at": utils.HTime{Time: utils.Now()},
					"region":         region,
				}).Error
			})

			// 更新ProvinceAccess
			_ = Db.Transaction(func(tx *gorm.DB) error {
				var provinceStats model.ProvinceAccess
				if tx.Where("province = ?", province).First(&provinceStats).Error == gorm.ErrRecordNotFound {
					provinceStats = model.ProvinceAccess{
						Province:     province,
						AccessCount:  1,
						LastAccessAt: utils.HTime{Time: utils.Now()},
					}
					return tx.Create(&provinceStats).Error
				}
				return tx.Model(&provinceStats).Updates(map[string]interface{}{
					"access_count":   gorm.Expr("access_count + 1"),
					"last_access_at": utils.HTime{Time: utils.Now()},
				}).Error
			})
		}(targetArticleID, articleList[0].Title)

		// 浏览量统计（规范错误处理）
		err := Db.Model(&model.Article{}).
			Where("id = ?", targetArticleID).
			Update("view_count", gorm.Expr("view_count + 1")).Error

		if err == nil {
			articleList[0].ViewCount++
			println(fmt.Sprintf("浏览量统计：文章ID=%d，最新量=%d", targetArticleID, articleList[0].ViewCount))
		} else {
			println(fmt.Sprintf("浏览量统计失败：文章ID=%d，err=%v", targetArticleID, err))
		}
	}

	// 7. 标签统计（仅搜索标签时触发）
	// 7.1 多字段标签搜索触发（已通过校验）
	if len(multiTagNames) > 0 && len(validTagIDs) > 0 {
		go func(tagIDs []uint) {
			for _, tagID := range tagIDs {
				_ = Db.Transaction(func(tx *gorm.DB) error {
					var tagStats model.TagSearch
					if tx.Where("tag_id = ?", tagID).First(&tagStats).Error == gorm.ErrRecordNotFound {
						tagStats = model.TagSearch{
							TagID:        tagID,
							SearchCount:  1,
							LastSearchAt: utils.HTime{Time: utils.Now()},
						}
						var tagName string
						Db.Model(&model.Tag{}).Where("id = ?", tagID).Pluck("TRIM(name)", &tagName)
						println(fmt.Sprintf("标签统计[多字段]：新增标签ID=%d，标签名=%s", tagID, tagName))
						return tx.Create(&tagStats).Error
					}
					var tagName string
					Db.Model(&model.Tag{}).Where("id = ?", tagID).Pluck("TRIM(name)", &tagName)
					println(fmt.Sprintf("标签统计[多字段]：更新标签ID=%d，标签名=%s，累计搜索量=%d", tagID, tagName, tagStats.SearchCount+1))
					return tx.Model(&tagStats).Updates(map[string]interface{}{
						"search_count":   gorm.Expr("search_count + 1"),
						"last_search_at": utils.HTime{Time: utils.Now()},
					}).Error
				})
			}
		}(validTagIDs)
	}

	// 7.2 单搜索框文本搜标签触发
	if !isIDSearch && len(singleTagKeywords) > 0 {
		go func(tagIDs []uint) {
			for _, tagID := range tagIDs {
				_ = Db.Transaction(func(tx *gorm.DB) error {
					var tagStats model.TagSearch
					if tx.Where("tag_id = ?", tagID).First(&tagStats).Error == gorm.ErrRecordNotFound {
						tagStats = model.TagSearch{
							TagID:        tagID,
							SearchCount:  1,
							LastSearchAt: utils.HTime{Time: utils.Now()},
						}
						var tagName string
						Db.Model(&model.Tag{}).Where("id = ?", tagID).Pluck("TRIM(name)", &tagName)
						println(fmt.Sprintf("标签统计[单搜索框]：新增标签ID=%d，标签名=%s", tagID, tagName))
						return tx.Create(&tagStats).Error
					}
					var tagName string
					Db.Model(&model.Tag{}).Where("id = ?", tagID).Pluck("TRIM(name)", &tagName)
					println(fmt.Sprintf("标签统计[单搜索框]：更新标签ID=%d，标签名=%s，累计搜索量=%d", tagID, tagName, tagStats.SearchCount+1))
					return tx.Model(&tagStats).Updates(map[string]interface{}{
						"search_count":   gorm.Expr("search_count + 1"),
						"last_search_at": utils.HTime{Time: utils.Now()},
					}).Error
				})
			}
		}(singleTagKeywords)
	}

	// 8. 组装返回数据
	response := map[string]interface{}{
		"list":       articleList,
		"total":      total,
		"page":       page,
		"page_size":  pageSize,
		"total_page": (total + int64(pageSize) - 1) / int64(pageSize),
	}

	result.Success(c, response)
}

// GetTagSearch 查询各标签的搜索量统计
// @Summary 查询标签搜索量统计
// @Tags 搜索统计相关接口
// @Produce json
// @Description 关联标签表与标签搜索统计表，返回各标签的名称、搜索次数、最后搜索时间（未被搜索过的标签搜索量为0）
// @Param page query int false "页码（默认1，最小1）"
// @Param page_size query int false "每页条数（默认20，最大100）"
// @Param sort_by query string false "排序字段（search_count/last_search_at，默认search_count）"
// @Param sort_order query string false "排序方式（asc/desc，默认desc）"
// @Success 200 {object} result.Result{data=model.TagPageResponse{list=[]model.TagSearchStatisticResp}} "查询成功" // 这里必须加model.前缀
// @Failure 400 {object} result.Result "参数错误"
// @Failure 500 {object} result.Result "服务器错误"
// @Router /api/GetTagSearch [get]
func GetTagSearch(c *gin.Context) {
	// 1. 绑定并校验参数（确保model.TagSearchStatisticReq已定义）
	var req model.TagSearchStatisticReq
	if err := c.ShouldBindQuery(&req); err != nil {
		result.FailedWithMsg(c, result.BadRequest, "参数错误："+err.Error())
		return
	}

	// 2. 处理分页参数
	page := req.Page
	if page == 0 {
		page = 1
	}
	pageSize := req.PageSize
	if pageSize == 0 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	// 3. 处理排序参数
	sortBy := req.SortBy
	if sortBy == "" {
		sortBy = "search_count" // 默认按搜索量排序
	}
	sortOrder := req.SortOrder
	if sortOrder == "" {
		sortOrder = "desc" // 默认降序
	}
	sortStr := sortBy + " " + sortOrder

	// 4. 关联查询：标签表左连接标签搜索统计表
	db := Db.Table("ginblog_tag AS t").
		Select(`
			t.name AS tag_name,
			COALESCE(ts.search_count, 0) AS search_count,
			ts.last_search_at AS last_search_at
		`).
		Joins("LEFT JOIN ginblog_tag_search AS ts ON t.id = ts.tag_id")

	// 5. 统计总条数
	var total int64
	if err := db.Count(&total).Error; err != nil {
		result.FailedWithMsg(c, result.InternalError, "统计标签总数失败："+err.Error())
		return
	}

	// 6. 分页查询并排序（使用model包中的TagSearchStatisticResp）
	var statistics []model.TagSearchStatisticResp
	if err := db.
		Order(sortStr).
		Limit(pageSize).
		Offset(offset).
		Scan(&statistics).Error; err != nil {
		result.FailedWithMsg(c, result.InternalError, "查询标签搜索量失败："+err.Error())
		return
	}

	// 7. 组装分页响应（使用model包中的TagPageResponse）
	response := model.TagPageResponse{
		List:      statistics,
		Total:     total,
		Page:      page,
		PageSize:  pageSize,
		TotalPage: int((total + int64(pageSize) - 1) / int64(pageSize)),
	}

	result.Success(c, response)
}

// GetProvinceAccess 查询用户地区访问量统计
// @Summary 查询各省份访问量统计
// @Tags 搜索统计相关接口
// @Produce json
// @Description 返回各省份的访问总量、最后访问时间，支持分页和排序
// @Param page query int false "页码（默认1，最小1）"
// @Param page_size query int false "每页条数（默认20，最大100）"
// @Param sort_by query string false "排序字段（access_count/last_access_at，默认access_count）"
// @Param sort_order query string false "排序方式（asc/desc，默认desc）"
// @Success 200 {object} result.Result{data=model.ProvincePageResponse{list=[]model.ProvinceAccessStatisticResp}} "查询成功"
// @Failure 400 {object} result.Result "参数错误"
// @Failure 500 {object} result.Result "服务器错误"
// @Router /api/GetProvinceAccess [get]
func GetProvinceAccess(c *gin.Context) {
	// 1. 绑定并校验参数
	var req model.ProvinceAccessStatisticReq
	if err := c.ShouldBindQuery(&req); err != nil {
		result.FailedWithMsg(c, result.BadRequest, "参数错误："+err.Error())
		return
	}

	// 2. 处理分页参数
	page := req.Page
	if page == 0 {
		page = 1 // 默认第一页
	}
	pageSize := req.PageSize
	if pageSize == 0 {
		pageSize = 20 // 默认每页20条
	} else if pageSize > 100 {
		pageSize = 100 // 限制最大页大小
	}
	offset := (page - 1) * pageSize

	// 3. 处理排序参数
	sortBy := req.SortBy
	if sortBy == "" {
		sortBy = "access_count" // 默认按访问量排序
	}
	sortOrder := req.SortOrder
	if sortOrder == "" {
		sortOrder = "desc" // 默认降序（访问量高的在前）
	}
	sortStr := sortBy + " " + sortOrder

	// 4. 从省份访问统计表查询数据
	db := Db.Model(&model.ProvinceAccess{}).
		Select("province, access_count, last_access_at") // 只查询需要的字段

	// 5. 统计总条数（总省份数量）
	var total int64
	if err := db.Count(&total).Error; err != nil {
		result.FailedWithMsg(c, result.InternalError, "统计省份总数失败："+err.Error())
		return
	}

	// 6. 分页查询并排序
	var statistics []model.ProvinceAccessStatisticResp
	if err := db.
		Order(sortStr).
		Limit(pageSize).
		Offset(offset).
		Scan(&statistics).Error; err != nil {
		result.FailedWithMsg(c, result.InternalError, "查询地区访问量失败："+err.Error())
		return
	}

	// 7. 组装分页响应
	response := model.ProvincePageResponse{
		List:      statistics,
		Total:     total,
		Page:      page,
		PageSize:  pageSize,
		TotalPage: int((total + int64(pageSize) - 1) / int64(pageSize)), // 计算总页数并转int
	}

	result.Success(c, response)
}
