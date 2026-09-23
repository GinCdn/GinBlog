package api

import (
	"encoding/json"
	"strings"

	. "ginblog/core"
	"ginblog/model"
	"ginblog/result"
	"ginblog/utils"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"gorm.io/gorm"
)

// articleRequestIsAdmin 判断当前请求是否来自管理员文章接口。
func articleRequestIsAdmin(c *gin.Context) bool {
	return strings.Contains(c.Request.URL.Path, "/api/admin/")
}

// articleRequestAuthor 获取当前请求对应的文章作者及标签创建者信息。
func articleRequestAuthor(c *gin.Context) (uint, string, bool) {
	usernameValue, exists := c.Get("username")
	if !exists {
		return 0, "", false
	}
	username, ok := usernameValue.(string)
	if !ok || strings.TrimSpace(username) == "" {
		return 0, "", false
	}
	if articleRequestIsAdmin(c) {
		admin := CheckAdmin(username)
		if admin.ID == 0 {
			return 0, "", false
		}
		return admin.ID, "admin", true
	}
	user := CheckUsername(username)
	if user == nil || user.ID == 0 {
		return 0, "", false
	}
	return user.ID, "user", true
}

// articleTags 校验并创建文章需要关联的标签，返回去重后的标签编号。
func articleTags(tx *gorm.DB, selectedTagIDs []uint, customTags []string, creatorType string, creatorID uint) ([]uint, error) {
	selectedSet := make(map[uint]struct{})
	for _, tagID := range selectedTagIDs {
		if tagID > 0 {
			selectedSet[tagID] = struct{}{}
		}
	}

	tagIDs := make([]uint, 0, len(selectedSet)+len(customTags))
	if len(selectedSet) > 0 {
		ids := make([]uint, 0, len(selectedSet))
		for tagID := range selectedSet {
			ids = append(ids, tagID)
		}
		var count int64
		if err := tx.Model(&model.Tag{}).Where("id IN ? AND creator_type = ?", ids, "admin").Count(&count).Error; err != nil {
			return nil, err
		}
		if count != int64(len(ids)) {
			return nil, gorm.ErrRecordNotFound
		}
		tagIDs = append(tagIDs, ids...)
	}

	customSet := make(map[string]struct{})
	for _, name := range customTags {
		cleanName := strings.ToLower(strings.TrimSpace(utils.GetSanitizer().Sanitize(name)))
		if cleanName != "" {
			customSet[cleanName] = struct{}{}
		}
	}
	if len(customSet) == 0 {
		return tagIDs, nil
	}

	customNames := make([]string, 0, len(customSet))
	for name := range customSet {
		customNames = append(customNames, name)
	}
	var existingTags []model.Tag
	if err := tx.Where("name IN ?", customNames).Find(&existingTags).Error; err != nil {
		return nil, err
	}
	existingNames := make(map[string]uint, len(existingTags))
	for _, tag := range existingTags {
		existingNames[tag.Name] = tag.ID
		tagIDs = append(tagIDs, tag.ID)
	}

	now := utils.HTime{Time: utils.Now()}
	newTags := make([]model.Tag, 0)
	for _, name := range customNames {
		if _, exists := existingNames[name]; !exists {
			newTags = append(newTags, model.Tag{
				Name:        name,
				CreatorType: creatorType,
				CreatorID:   creatorID,
				CreateTime:  now,
				UpdateTime:  now,
			})
		}
	}
	if len(newTags) > 0 {
		if err := tx.Create(&newTags).Error; err != nil {
			return nil, err
		}
		for _, tag := range newTags {
			tagIDs = append(tagIDs, tag.ID)
		}
	}
	return tagIDs, nil
}

// articleReplaceTags 重建文章与标签之间的关联关系。
func articleReplaceTags(tx *gorm.DB, articleID uint, tagIDs []uint) error {
	if err := tx.Where("article_id = ?", articleID).Delete(&model.ArticleTag{}).Error; err != nil {
		return err
	}

	uniqueTagIDs := make(map[uint]struct{})
	for _, tagID := range tagIDs {
		if tagID > 0 {
			uniqueTagIDs[tagID] = struct{}{}
		}
	}
	if len(uniqueTagIDs) == 0 {
		return nil
	}

	now := utils.HTime{Time: utils.Now()}
	articleTags := make([]model.ArticleTag, 0, len(uniqueTagIDs))
	for tagID := range uniqueTagIDs {
		articleTags = append(articleTags, model.ArticleTag{
			ArticleID:  articleID,
			TagID:      tagID,
			CreateTime: now,
			UpdateTime: now,
		})
	}
	return tx.Create(&articleTags).Error
}

// fillArticleAuthors 补充管理员发布文章的作者信息，统一返回文章作者昵称和 QQ。
func fillArticleAuthors(db *gorm.DB, articles []model.Article) {
	adminIDs := make([]uint, 0)
	seen := make(map[uint]struct{})
	for _, article := range articles {
		if article.Author.ID == 0 && article.AuthorID > 0 {
			if _, exists := seen[article.AuthorID]; !exists {
				seen[article.AuthorID] = struct{}{}
				adminIDs = append(adminIDs, article.AuthorID)
			}
		}
	}
	if len(adminIDs) == 0 {
		return
	}

	var admins []model.Admin
	if err := db.Where("id IN ?", adminIDs).Find(&admins).Error; err != nil {
		return
	}
	adminByID := make(map[uint]model.Admin, len(admins))
	for _, admin := range admins {
		adminByID[admin.ID] = admin
	}
	for index := range articles {
		if articles[index].Author.ID != 0 {
			continue
		}
		admin, exists := adminByID[articles[index].AuthorID]
		if !exists {
			continue
		}
		articles[index].Author = model.User{
			ID:       admin.ID,
			NickName: admin.NickName,
			Username: admin.Username,
			QQ:       admin.QQ,
		}
	}
}

// CreateArticle 创建文章及其分类、标签关联关系。
func CreateArticle(c *gin.Context) {
	var dto model.CreateArticle
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}

	dto.Title = strings.TrimSpace(utils.GetSanitizer().Sanitize(dto.Title))
	dto.Content = trimLegacyTrailingZeroLine(utils.SanitizeArticleContent(dto.Content))
	dto.Description = strings.TrimSpace(utils.GetSanitizer().Sanitize(dto.Description))
	dto.CoverImage = strings.TrimSpace(dto.CoverImage)
	dto.Keywords = strings.TrimSpace(utils.GetSanitizer().Sanitize(dto.Keywords))
	if dto.Title == "" || dto.Content == "" || dto.Description == "" {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}
	accessType, price, rebateRate, err := validateArticleAccessWithContent(dto.AccessType, dto.Price, dto.RebateRate, dto.Content)
	if err != nil {
		result.FailedWithMsg(c, result.BadRequest, err.Error())
		return
	}
	if CheckArticleTitle(dto.Title).ID > 0 {
		result.FailedWithMsg(c, result.Conflict, "该文章标题已存在")
		return
	}
	if CheckCategoryCid(dto.CategoryID).Cid == 0 {
		result.FailedWithMsg(c, result.NotFound, "该分类ID不存在")
		return
	}

	authorID, creatorType, ok := articleRequestAuthor(c)
	if !ok {
		result.Failed(c, result.NotFound, result.SubUserNotFound)
		return
	}
	isAdmin := articleRequestIsAdmin(c)
	isPublished := false
	if isAdmin {
		isPublished = dto.IsPublished
	}

	err = Db.Transaction(func(tx *gorm.DB) error {
		article := model.Article{
			Title:        dto.Title,
			Content:      dto.Content,
			Description:  dto.Description,
			CoverImage:   dto.CoverImage,
			Keywords:     dto.Keywords,
			CategoryID:   dto.CategoryID,
			AuthorID:     authorID,
			IsPublished:  isPublished,
			AccessType:   accessType,
			Price:        price,
			RoleDiscount: (accessType == "paid" || utils.HasArticlePaidContent(dto.Content)) && dto.RoleDiscount,
			RebateRate:   rebateRate,
			CreateTime:   utils.HTime{Time: utils.Now()},
			UpdateTime:   utils.HTime{Time: utils.Now()},
		}
		if err := tx.Create(&article).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.Category{}).Where("cid = ?", dto.CategoryID).Update("count", gorm.Expr("count + 1")).Error; err != nil {
			return err
		}
		tagIDs, err := articleTags(tx, dto.SelectedTagIDs, dto.CustomTags, creatorType, authorID)
		if err != nil {
			return err
		}
		return articleReplaceTags(tx, article.ID, tagIDs)
	})
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			result.FailedWithMsg(c, result.NotFound, "部分选择的标签不存在或不是管理员标签")
			return
		}
		result.Failed(c, result.InternalError, result.CreateDateError)
		return
	}
	result.Success(c, true)
}

// trimLegacyTrailingZeroLine 清理旧编辑器在完整代码块后写入的孤立序号行。
func trimLegacyTrailingZeroLine(content string) string {
	lines := strings.Split(content, "\n")
	cleaned := make([]string, 0, len(lines))
	inCodeBlock := false
	codeBlockJustClosed := false
	removed := false

	for index, line := range lines {
		trimmedLine := strings.TrimSpace(line)
		if inCodeBlock {
			cleaned = append(cleaned, line)
			if isLegacyCodeFenceClosingLine(trimmedLine) {
				inCodeBlock = false
				codeBlockJustClosed = true
			}
			continue
		}

		if isLegacyCodeFenceOpeningLine(trimmedLine) {
			cleaned = append(cleaned, line)
			inCodeBlock = true
			codeBlockJustClosed = false
			continue
		}
		if codeBlockJustClosed && isLegacyEditorSequenceLine(trimmedLine) && nextMeaningfulLineIsHeadingOrEnd(lines, index) {
			removed = true
			codeBlockJustClosed = false
			continue
		}

		cleaned = append(cleaned, line)
		if trimmedLine != "" {
			codeBlockJustClosed = false
		}
	}
	if !removed {
		return content
	}
	return strings.TrimRight(strings.Join(cleaned, "\n"), " \t\r\n")
}

// isLegacyCodeFenceOpeningLine 判断是否为 Markdown 代码块起始围栏。
func isLegacyCodeFenceOpeningLine(line string) bool {
	return strings.HasPrefix(line, "```")
}

// isLegacyCodeFenceClosingLine 判断是否为 Markdown 代码块结束围栏。
func isLegacyCodeFenceClosingLine(line string) bool {
	return len(line) >= 3 && strings.Trim(line, "`") == ""
}

// isLegacyEditorSequenceLine 判断是否为旧编辑器错误插入的单个数字行。
func isLegacyEditorSequenceLine(line string) bool {
	return len(line) == 1 && line[0] >= '0' && line[0] <= '9'
}

// nextMeaningfulLineIsHeadingOrEnd 防止误删代码块后正文中的正常数字内容。
func nextMeaningfulLineIsHeadingOrEnd(lines []string, index int) bool {
	for next := index + 1; next < len(lines); next++ {
		line := strings.TrimSpace(lines[next])
		if line == "" {
			continue
		}
		return strings.HasPrefix(line, "#")
	}
	return true
}

// bindUpdateArticleRequest 兼容 JSON 和表单方式的文章更新请求。
func bindUpdateArticleRequest(c *gin.Context, dto *model.UpdateArticle) (map[string]json.RawMessage, error) {
	if strings.Contains(c.ContentType(), binding.MIMEJSON) {
		if err := c.ShouldBindBodyWith(dto, binding.JSON); err != nil {
			return nil, err
		}
		payload := make(map[string]json.RawMessage)
		if err := c.ShouldBindBodyWith(&payload, binding.JSON); err != nil {
			return nil, err
		}
		return payload, nil
	}
	if err := c.ShouldBind(dto); err != nil {
		return nil, err
	}
	return nil, nil
}

// articleUpdateFieldPresent 判断更新请求中是否显式提供了指定字段。
func articleUpdateFieldPresent(c *gin.Context, payload map[string]json.RawMessage, names ...string) bool {
	if payload != nil {
		for _, name := range names {
			if _, exists := payload[name]; exists {
				return true
			}
		}
		return false
	}
	for _, name := range names {
		if _, exists := c.GetPostForm(name); exists {
			return true
		}
	}
	return false
}

// UpdateArticle 更新文章正文、分类、访问控制和标签关联关系。
func UpdateArticle(c *gin.Context) {
	var dto model.UpdateArticle
	payload, err := bindUpdateArticleRequest(c, &dto)
	if err != nil || dto.ID == 0 {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}

	article := CheckArticleId(dto.ID)
	if article.ID == 0 {
		result.FailedWithMsg(c, result.NotFound, "该文章不存在")
		return
	}
	authorID, creatorType, ok := articleRequestAuthor(c)
	if !ok {
		result.Failed(c, result.NotFound, result.SubUserNotFound)
		return
	}
	if !articleRequestIsAdmin(c) && article.AuthorID != authorID {
		result.FailedWithMsg(c, result.Forbidden, "无权限修改其他用户的文章")
		return
	}

	contentPresent := articleUpdateFieldPresent(c, payload, "content")
	categoryPresent := articleUpdateFieldPresent(c, payload, "category_id", "categoryId")
	accessFieldsPresent := articleUpdateFieldPresent(c, payload, "access_type", "accessType", "price", "role_discount", "roleDiscount", "rebate_rate", "rebateRate")
	tagsPresent := articleUpdateFieldPresent(c, payload, "selected_tag_ids", "selectedTagIDs", "custom_tags", "customTags")
	if categoryPresent {
		if dto.CategoryID == 0 || CheckCategoryCid(dto.CategoryID).Cid == 0 {
			result.FailedWithMsg(c, result.NotFound, "该分类ID不存在")
			return
		}
	}

	contentForAccess := article.Content
	if contentPresent {
		contentValue := dto.Content
		if payload == nil {
			contentValue = c.PostForm("content")
		}
		contentForAccess = trimLegacyTrailingZeroLine(utils.SanitizeArticleContent(contentValue))
		if contentForAccess == "" {
			result.Failed(c, result.BadRequest, result.SubMissingParam)
			return
		}
	}
	accessType, price, rebateRate := article.AccessType, article.Price, article.RebateRate
	roleDiscount := article.RoleDiscount
	if accessFieldsPresent {
		if articleUpdateFieldPresent(c, payload, "access_type", "accessType") {
			accessType = dto.AccessType
		}
		if articleUpdateFieldPresent(c, payload, "price") {
			price = dto.Price
		}
		if articleUpdateFieldPresent(c, payload, "rebate_rate", "rebateRate") {
			rebateRate = dto.RebateRate
		}
		if articleUpdateFieldPresent(c, payload, "role_discount", "roleDiscount") {
			roleDiscount = dto.RoleDiscount
		}
		accessType, price, rebateRate, err = validateArticleAccessWithContent(accessType, price, rebateRate, contentForAccess)
		if err != nil {
			result.FailedWithMsg(c, result.BadRequest, err.Error())
			return
		}
	}

	updateData := make(map[string]interface{})
	if articleUpdateFieldPresent(c, payload, "title") {
		title := strings.TrimSpace(utils.GetSanitizer().Sanitize(dto.Title))
		if title == "" {
			result.Failed(c, result.BadRequest, result.SubMissingParam)
			return
		}
		if sameTitle := CheckArticleTitle(title); sameTitle.ID > 0 && sameTitle.ID != dto.ID {
			result.FailedWithMsg(c, result.Conflict, "该文章标题已存在")
			return
		}
		updateData["title"] = title
	}
	if contentPresent {
		updateData["content"] = contentForAccess
	}
	if articleUpdateFieldPresent(c, payload, "description") {
		updateData["description"] = strings.TrimSpace(utils.GetSanitizer().Sanitize(dto.Description))
	}
	if articleUpdateFieldPresent(c, payload, "cover_image", "coverImage") {
		updateData["cover_image"] = strings.TrimSpace(dto.CoverImage)
	}
	if articleUpdateFieldPresent(c, payload, "keywords") {
		updateData["keywords"] = strings.TrimSpace(utils.GetSanitizer().Sanitize(dto.Keywords))
	}
	if categoryPresent {
		updateData["category_id"] = dto.CategoryID
	}
	if articleUpdateFieldPresent(c, payload, "is_published", "isPublished") {
		updateData["is_published"] = dto.IsPublished
	}
	if accessFieldsPresent {
		updateData["access_type"] = accessType
		updateData["price"] = price
		updateData["role_discount"] = (accessType == "paid" || utils.HasArticlePaidContent(contentForAccess)) && roleDiscount
		updateData["rebate_rate"] = rebateRate
	}
	if len(updateData) == 0 && !tagsPresent {
		result.Success(c, true)
		return
	}

	err = Db.Transaction(func(tx *gorm.DB) error {
		if len(updateData) > 0 {
			if err := tx.Model(&model.Article{}).Where("id = ?", dto.ID).Updates(updateData).Error; err != nil {
				return err
			}
		}
		if categoryPresent && dto.CategoryID != article.CategoryID {
			if err := tx.Model(&model.Category{}).Where("cid = ?", article.CategoryID).Update("count", gorm.Expr("count - 1")).Error; err != nil {
				return err
			}
			if err := tx.Model(&model.Category{}).Where("cid = ?", dto.CategoryID).Update("count", gorm.Expr("count + 1")).Error; err != nil {
				return err
			}
		}
		if tagsPresent {
			tagIDs, err := articleTags(tx, dto.SelectedTagIDs, dto.CustomTags, creatorType, authorID)
			if err != nil {
				return err
			}
			return articleReplaceTags(tx, dto.ID, tagIDs)
		}
		return nil
	})
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			result.FailedWithMsg(c, result.NotFound, "部分选择的标签不存在或不是管理员标签")
			return
		}
		result.Failed(c, result.InternalError, result.UpdateError)
		return
	}
	result.Success(c, true)
}

// DeleteArticle 删除文章、标签关系和文章购买记录。
func DeleteArticle(c *gin.Context) {
	var dto model.DeleteArticle
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}
	article := CheckArticleId(dto.ID)
	if article.ID == 0 {
		result.FailedWithMsg(c, result.NotFound, "该文章不存在")
		return
	}
	authorID, _, ok := articleRequestAuthor(c)
	if !ok {
		result.Failed(c, result.NotFound, result.SubUserNotFound)
		return
	}
	if !articleRequestIsAdmin(c) && article.AuthorID != authorID {
		result.FailedWithMsg(c, result.Forbidden, "无权限删除其他用户的文章")
		return
	}

	err := Db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("article_id = ?", dto.ID).Delete(&model.ArticleTag{}).Error; err != nil {
			return err
		}
		if err := tx.Where("article_id = ?", dto.ID).Delete(&model.ArticlePurchase{}).Error; err != nil {
			return err
		}
		if err := tx.Where("id = ?", dto.ID).Delete(&model.Article{}).Error; err != nil {
			return err
		}
		return tx.Model(&model.Category{}).Where("cid = ?", article.CategoryID).Update("count", gorm.Expr("count - 1")).Error
	})
	if err != nil {
		result.Failed(c, result.ServiceUnavail, result.DeleteError)
		return
	}
	result.Success(c, true)
}

// GetArticleInfo 查询管理员全部文章或普通用户自己的文章。
func GetArticleInfo(c *gin.Context) {
	var dto model.GetArticleList
	if err := c.ShouldBindQuery(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}
	if dto.Page <= 0 {
		dto.Page = 1
	}
	if dto.PageSize <= 0 {
		dto.PageSize = 20
	}
	if dto.PageSize != 20 && dto.PageSize != 50 && dto.PageSize != 100 {
		result.FailedWithMsg(c, result.BadRequest, "每页数量仅支持20、50或100")
		return
	}

	authorID, _, ok := articleRequestAuthor(c)
	if !ok {
		result.Failed(c, result.NotFound, result.SubUserNotFound)
		return
	}
	query := Db.Model(&model.Article{})
	if !articleRequestIsAdmin(c) {
		query = query.Where("author_id = ?", authorID)
	}
	if dto.ID > 0 {
		query = query.Where("id = ?", dto.ID)
	}
	if dto.Title != "" {
		query = query.Where("title LIKE ?", "%"+utils.GetSanitizer().Sanitize(dto.Title)+"%")
	}
	if dto.CategoryID > 0 {
		query = query.Where("category_id = ?", dto.CategoryID)
	}
	if c.Query("is_published") != "" {
		query = query.Where("is_published = ?", dto.IsPublished)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		result.Failed(c, result.InternalError, result.InfoDateError)
		return
	}
	articles := make([]model.Article, 0)
	if err := query.Preload("Category").Preload("Author").Preload("Tags").Limit(dto.PageSize).Offset((dto.Page - 1) * dto.PageSize).Order("create_time DESC").Find(&articles).Error; err != nil {
		result.Failed(c, result.InternalError, result.InfoDateError)
		return
	}
	fillArticleAuthors(Db, articles)
	result.Success(c, gin.H{
		"list": articles,
		"pagination": gin.H{
			"total":      total,
			"page":       dto.Page,
			"page_size":  dto.PageSize,
			"total_page": (total + int64(dto.PageSize) - 1) / int64(dto.PageSize),
		},
	})
}

// recordArticleVisit 更新文章浏览量及访问地区统计。
func recordArticleVisit(c *gin.Context, article model.Article) {
	if err := Db.Model(&model.Article{}).Where("id = ?", article.ID).Update("view_count", gorm.Expr("view_count + 1")).Error; err == nil {
		article.ViewCount++
	}

	ip := utils.GetRealIP(c)
	if ip == "" || ip == "127.0.0.1" || ip == "::1" {
		return
	}
	region := utils.GetIPRegion(ip)
	province := strings.Split(region, "-")[0]
	if province == "" {
		province = "未知地区"
	}
	go func() {
		_ = Db.Transaction(func(tx *gorm.DB) error {
			var ipStats model.IPAccess
			if err := tx.Where("ip = ?", ip).First(&ipStats).Error; err == gorm.ErrRecordNotFound {
				return tx.Create(&model.IPAccess{IP: ip, AccessCount: 1, Region: region, LastAccessAt: utils.HTime{Time: utils.Now()}}).Error
			} else if err != nil {
				return err
			}
			return tx.Model(&ipStats).Updates(map[string]interface{}{
				"access_count":   gorm.Expr("access_count + 1"),
				"last_access_at": utils.HTime{Time: utils.Now()},
				"region":         region,
			}).Error
		})
		_ = Db.Transaction(func(tx *gorm.DB) error {
			var provinceStats model.ProvinceAccess
			if err := tx.Where("province = ?", province).First(&provinceStats).Error; err == gorm.ErrRecordNotFound {
				return tx.Create(&model.ProvinceAccess{Province: province, AccessCount: 1, LastAccessAt: utils.HTime{Time: utils.Now()}}).Error
			} else if err != nil {
				return err
			}
			return tx.Model(&provinceStats).Updates(map[string]interface{}{
				"access_count":   gorm.Expr("access_count + 1"),
				"last_access_at": utils.HTime{Time: utils.Now()},
			}).Error
		})
	}()
}

// GetArticleList 查询前台已发布文章，并在访问单篇文章时记录浏览量。
// collectCategoryDescendantIDs 收集指定分类及其全部子孙分类的编号。
func collectCategoryDescendantIDs(categoryID uint, categories []model.Category) []uint {
	ids := []uint{categoryID}
	childrenByParent := make(map[int][]uint)
	for _, category := range categories {
		childrenByParent[category.ParentID] = append(childrenByParent[category.ParentID], category.Cid)
	}
	visited := map[uint]struct{}{categoryID: {}}
	var collect func(uint)
	collect = func(parentID uint) {
		for _, childID := range childrenByParent[int(parentID)] {
			if _, exists := visited[childID]; exists {
				continue
			}
			visited[childID] = struct{}{}
			ids = append(ids, childID)
			collect(childID)
		}
	}
	collect(categoryID)
	return ids
}

// GetArticleList 查询前台已发布文章，并在访问单篇文章时记录浏览量。
func GetArticleList(c *gin.Context) {
	var dto model.GetArticleList
	if err := c.ShouldBindQuery(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}
	if dto.Page <= 0 {
		dto.Page = 1
	}
	if dto.PageSize <= 0 {
		dto.PageSize = 10
	}
	if dto.PageSize != 10 && dto.PageSize != 20 && dto.PageSize != 50 && dto.PageSize != 100 {
		result.FailedWithMsg(c, result.BadRequest, "每页数量仅支持10、20、50或100")
		return
	}

	query := Db.Model(&model.Article{}).Where("is_published = ?", true)
	if dto.ID > 0 {
		query = query.Where("id = ?", dto.ID)
	}
	if dto.CategoryID > 0 {
		var categories []model.Category
		if err := Db.Find(&categories).Error; err != nil {
			result.Failed(c, result.InternalError, result.QueryError)
			return
		}

		// 若筛选的是父分类，则连同其所有子孙分类一并查询。
		categoryIDs := []uint{dto.CategoryID}
		for _, category := range categories {
			if category.Cid == dto.CategoryID && category.ParentID == 0 {
				categoryIDs = collectCategoryDescendantIDs(dto.CategoryID, categories)
				break
			}
		}
		query = query.Where("category_id IN ?", categoryIDs)
	}
	if dto.Title != "" {
		query = query.Where("title LIKE ?", "%"+utils.GetSanitizer().Sanitize(dto.Title)+"%")
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		result.Failed(c, result.InternalError, result.QueryError)
		return
	}
	articles := make([]model.Article, 0)
	if err := query.Preload("Category").Preload("Author").Preload("Tags").Limit(dto.PageSize).Offset((dto.Page - 1) * dto.PageSize).Order("create_time DESC").Find(&articles).Error; err != nil {
		result.Failed(c, result.InternalError, result.QueryError)
		return
	}
	fillArticleAuthors(Db, articles)
	if dto.ID > 0 && len(articles) == 1 {
		recordArticleVisit(c, articles[0])
		articles[0].ViewCount++
	}
	if dto.ID > 0 && len(articles) == 1 {
		fillArticleNavigation(articles[0].ID, &articles[0])
	}
	articles = enrichArticleAccess(Db, c, articles)
	fillArticleLikeState(c, articles)
	fillArticleFavoriteState(c, articles)
	result.Success(c, model.PageResponse{
		List:      articles,
		Total:     total,
		Page:      dto.Page,
		PageSize:  dto.PageSize,
		TotalPage: int((total + int64(dto.PageSize) - 1) / int64(dto.PageSize)),
	})
}

// CheckArticleTitle 根据标题查询文章。
func CheckArticleTitle(title string) *model.Article {
	var dto model.Article
	Db.Where("title = ?", title).First(&dto)
	return &dto
}

// CheckArticleId 根据编号查询文章。
func CheckArticleId(id uint) *model.Article {
	var dto model.Article
	Db.Where("id = ?", id).First(&dto)
	return &dto
}
