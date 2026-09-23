package api

import (
	"encoding/json"
	"strings"
	"unicode/utf8"

	. "ginblog/core"
	"ginblog/global"
	"ginblog/model"
	"ginblog/result"
	"ginblog/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// CreateComment 创建文章评论，并按照站点配置决定是否需要审核。
func CreateComment(c *gin.Context) {
	var dto model.CreateComment
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}

	// 评论内容仅允许安全的富文本，防止保存恶意脚本。
	dto.Content = strings.TrimSpace(utils.SanitizeCommentContent(dto.Content))
	if dto.Content == "" {
		result.FailedWithMsg(c, result.BadRequest, "\u8bc4\u8bba\u5185\u5bb9\u4e0d\u80fd\u4e3a\u7a7a")
		return
	}
	if utf8.RuneCountInString(dto.Content) > 128 {
		result.FailedWithMsg(c, result.BadRequest, "评论内容不能超过128个字符")
		return
	}
	dto.NickName = strings.TrimSpace(utils.SanitizeCommentContent(dto.NickName))
	if utf8.RuneCountInString(dto.NickName) > 32 {
		result.FailedWithMsg(c, result.BadRequest, "昵称不能超过32个字符")
		return
	}

	username, loggedIn := c.Get("username")
	isAdminPath := strings.Contains(c.Request.URL.Path, "/api/admin/CreateComment")
	var userID uint
	var nickName, email string

	if loggedIn {
		if isAdminPath {
			admin := CheckAdmin(username.(string))
			if admin.ID == 0 {
				result.Failed(c, result.NotFound, result.SubUserNotFound)
				return
			}
			userID = admin.ID
			nickName = strings.TrimSpace(utils.SanitizeCommentContent(admin.NickName))
			email = strings.TrimSpace(admin.Email)
		} else {
			user := CheckUsername(username.(string))
			if user == nil || user.ID == 0 {
				result.Failed(c, result.NotFound, result.SubUserNotFound)
				return
			}
			userID = user.ID
			nickName = strings.TrimSpace(utils.SanitizeCommentContent(user.NickName))
			email = strings.TrimSpace(user.Email)
		}
	} else {
		if dto.NickName == "" || dto.Email == "" {
			result.FailedWithMsg(c, result.BadRequest, "游客评论必须填写昵称和邮箱")
			return
		}
		nickName = dto.NickName
		email = strings.TrimSpace(dto.Email)
	}

	var article model.Article
	if err := Db.First(&article, dto.ArticleID).Error; err != nil {
		result.FailedWithMsg(c, result.BadRequest, "目标文章不存在")
		return
	}
	if dto.ParentID > 0 {
		var parentComment model.Comment
		if err := Db.First(&parentComment, dto.ParentID).Error; err != nil {
			result.FailedWithMsg(c, result.BadRequest, "父评论不存在")
			return
		}
		if parentComment.ArticleID != dto.ArticleID {
			result.FailedWithMsg(c, result.BadRequest, "不能回复其他文章的评论")
			return
		}
	}

	// 管理员评论始终直接通过；普通用户和游客由评论审核开关决定状态。
	status := int8(0)
	if isAdminPath {
		status = 1
	} else {
		var siteConfig model.SiteConfig
		if err := Db.First(&siteConfig, 1).Error; err == nil && !siteConfig.CommentModeration {
			status = 1
		}
	}

	meta, err := json.Marshal(map[string]any{"like": 0, "reported": false})
	if err != nil {
		result.Failed(c, result.InternalError, result.CreateDateError)
		return
	}

	comment := model.Comment{
		ArticleID:  dto.ArticleID,
		Content:    dto.Content,
		UserID:     userID,
		NickName:   nickName,
		Email:      email,
		ParentID:   dto.ParentID,
		IsAuthor:   userID != 0 && userID == article.AuthorID,
		Status:     status,
		IP:         c.ClientIP(),
		UserAgent:  c.Request.UserAgent(),
		Meta:       meta,
		CreateTime: utils.HTime{Time: utils.Now()},
		UpdateTime: utils.HTime{Time: utils.Now()},
	}

	tx := Db.Begin()
	if tx.Error != nil {
		result.Failed(c, result.InternalError, result.CreateDateError)
		return
	}
	if err := tx.Create(&comment).Error; err != nil {
		tx.Rollback()
		global.Log.Errorf("comment create failed: article_id=%d, user_id=%d, err=%v", dto.ArticleID, userID, err)
		result.Failed(c, result.InternalError, result.CreateDateError)
		return
	}
	if err := tx.Model(&model.Article{}).Where("id = ?", dto.ArticleID).Update("comment_count", gorm.Expr("comment_count + 1")).Error; err != nil {
		tx.Rollback()
		result.Failed(c, result.ServiceUnavail, result.UpdateError)
		return
	}
	if err := tx.Commit().Error; err != nil {
		result.Failed(c, result.InternalError, result.CreateDateError)
		return
	}

	// 游客成功评论后可解锁要求评论后查看的文章内容。
	if !loggedIn {
		grantArticleCommentAccess(c, dto.ArticleID)
	}
	// 免审核或管理员直接发布的评论，在事务提交后立即发送通知邮件。
	if status == 1 {
		go notifyCommentApproved(comment)
	}
	result.Success(c, true)
}

// DeleteComment 删除评论，管理员可删除任意评论，用户只能删除自己的评论。
func DeleteComment(c *gin.Context) {
	var dto model.DeleteComment
	if err := c.ShouldBind(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}

	var comment model.Comment
	if err := Db.First(&comment, dto.ID).Error; err != nil {
		result.FailedWithMsg(c, result.NotFound, "评论不存在")
		return
	}

	username, exists := c.Get("username")
	if !exists {
		result.FailedWithMsg(c, result.Unauthorized, "未登录，无权限删除评论")
		return
	}

	path := c.Request.URL.Path
	switch {
	case strings.Contains(path, "/api/admin/DeleteComment"):
		if admin := CheckAdmin(username.(string)); admin.ID == 0 {
			result.FailedWithMsg(c, result.Forbidden, "无管理员权限")
			return
		}
	case strings.Contains(path, "/api/user/DeleteComment"):
		user := CheckUsername(username.(string))
		if user == nil || user.ID == 0 || user.ID != comment.UserID {
			result.FailedWithMsg(c, result.Forbidden, "仅可删除自己发布的评论")
			return
		}
	default:
		result.FailedWithMsg(c, result.Forbidden, "无权限删除评论")
		return
	}

	tx := Db.Begin()
	if tx.Error != nil {
		result.Failed(c, result.InternalError, result.DeleteError)
		return
	}
	if err := tx.Delete(&comment).Error; err != nil {
		tx.Rollback()
		result.Failed(c, result.InternalError, result.DeleteError)
		return
	}
	if err := tx.Model(&model.Article{}).Where("id = ?", comment.ArticleID).Update("comment_count", gorm.Expr("CASE WHEN comment_count > 0 THEN comment_count - 1 ELSE 0 END")).Error; err != nil {
		tx.Rollback()
		result.Failed(c, result.ServiceUnavail, result.UpdateError)
		return
	}
	if err := tx.Commit().Error; err != nil {
		result.Failed(c, result.InternalError, result.DeleteError)
		return
	}

	result.Success(c, true)
}

// GetCommentInfo 获取评论列表，按访问角色限制可见的评论范围。
func GetCommentInfo(c *gin.Context) {
	var dto model.GetCommentDTO
	if err := c.ShouldBindQuery(&dto); err != nil {
		result.Failed(c, result.BadRequest, result.SubMissingParam)
		return
	}

	page := dto.Page
	if page < 1 {
		page = 1
	}
	pageSize := dto.PageSize
	if pageSize != 20 && pageSize != 50 && pageSize != 100 {
		pageSize = 20
	}

	path := c.Request.URL.Path
	isAdminPath := strings.Contains(path, "/api/admin/GetCommentInfo")
	isUserPath := strings.Contains(path, "/api/user/GetCommentInfo")
	var currentUserID uint

	if isAdminPath || isUserPath {
		username, exists := c.Get("username")
		if !exists {
			result.FailedWithMsg(c, result.Unauthorized, "未登录，无权限查看评论")
			return
		}
		if isAdminPath {
			if admin := CheckAdmin(username.(string)); admin.ID == 0 {
				result.FailedWithMsg(c, result.Forbidden, "无管理员权限")
				return
			}
		} else {
			user := CheckUsername(username.(string))
			if user == nil || user.ID == 0 {
				result.Failed(c, result.NotFound, result.SubUserNotFound)
				return
			}
			currentUserID = user.ID
		}
	}

	db := Db.Model(&model.Comment{})
	switch {
	case isAdminPath:
	case isUserPath:
		db = db.Where("user_id = ?", currentUserID)
	default:
		db = db.Where("status = ?", 1)
	}
	if dto.ArticleID > 0 {
		db = db.Where("article_id = ?", dto.ArticleID)
	}
	if dto.Content != "" {
		db = db.Where("content LIKE ?", "%"+dto.Content+"%")
	}
	if (isAdminPath || isUserPath) && dto.Status != nil {
		db = db.Where("status = ?", *dto.Status)
	}
	if dto.ParentID != nil {
		db = db.Where("parent_id = ?", *dto.ParentID)
	}

	var total int64
	if err := db.Count(&total).Error; err != nil {
		global.Log.Errorf("查询评论总数失败: %v", err)
		result.FailedWithMsg(c, result.InternalError, "查询评论失败")
		return
	}

	comments := make([]model.Comment, 0)
	if err := db.Order("create_time DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&comments).Error; err != nil {
		global.Log.Errorf("查询评论列表失败: %v", err)
		result.FailedWithMsg(c, result.InternalError, "查询评论失败")
		return
	}

	// 评论表只保存评论者ID，批量补充用户QQ，供前端按QQ生成头像。
	userIDs := make([]uint, 0, len(comments))
	seenUserIDs := make(map[uint]struct{}, len(comments))
	for _, comment := range comments {
		if comment.UserID == 0 {
			continue
		}
		if _, exists := seenUserIDs[comment.UserID]; exists {
			continue
		}
		seenUserIDs[comment.UserID] = struct{}{}
		userIDs = append(userIDs, comment.UserID)
	}
	if len(userIDs) > 0 {
		var users []model.User
		if err := Db.Select("id", "qq", "nick_name").Where("id IN ?", userIDs).Find(&users).Error; err != nil {
			global.Log.Warnf("补充评论者QQ失败: %v", err)
		} else {
			userQQ := make(map[uint]string, len(users))
			userNickName := make(map[uint]string, len(users))
			for _, user := range users {
				userQQ[user.ID] = user.QQ
				userNickName[user.ID] = user.NickName
			}
			for index := range comments {
				comments[index].QQ = userQQ[comments[index].UserID]
				if userNickName[comments[index].UserID] != "" {
					comments[index].NickName = userNickName[comments[index].UserID]
				}
			}
		}
	}

	// 输出前统一清洗评论内容与昵称，去除首尾空白并过滤脚本类危险标签。
	for index := range comments {
		comments[index].Content = strings.TrimSpace(utils.SanitizeCommentContent(comments[index].Content))
		comments[index].NickName = strings.TrimSpace(utils.SanitizeCommentContent(comments[index].NickName))
	}

	fillCommentLikeState(c, comments)

	result.Success(c, map[string]interface{}{
		"list":       comments,
		"total":      total,
		"total_page": (total + int64(pageSize) - 1) / int64(pageSize),
		"page":       page,
		"page_size":  pageSize,
	})
}

// UpdateComment 审核待审核评论，仅管理员可操作。
func UpdateComment(c *gin.Context) {
	var dto model.UpdateComment
	if err := c.ShouldBind(&dto); err != nil {
		result.FailedWithMsg(c, result.BadRequest, "参数错误，审核状态仅支持通过、拒绝或标记垃圾评论")
		return
	}

	var comment model.Comment
	if err := Db.First(&comment, dto.ID).Error; err != nil {
		result.FailedWithMsg(c, result.NotFound, "评论不存在")
		return
	}
	if comment.Status != 0 {
		result.FailedWithMsg(c, result.BadRequest, "仅可审核待审核状态的评论")
		return
	}

	username, exists := c.Get("username")
	if !exists {
		result.FailedWithMsg(c, result.Unauthorized, "未登录，无权限审核评论")
		return
	}
	if admin := CheckAdmin(username.(string)); admin.ID == 0 {
		result.FailedWithMsg(c, result.Forbidden, "无管理员权限")
		return
	}

	if err := Db.Model(&comment).Updates(map[string]interface{}{
		"status":      dto.Status,
		"update_time": utils.HTime{Time: utils.Now()},
	}).Error; err != nil {
		global.Log.Errorf("审核评论失败: comment_id=%d, status=%d, err=%v", dto.ID, dto.Status, err)
		result.FailedWithMsg(c, result.InternalError, "审核评论失败")
		return
	}

	global.Log.Infof("评论审核完成: comment_id=%d, status=%d, admin=%s", dto.ID, dto.Status, username.(string))
	if comment.Status == 0 && dto.Status == 1 {
		go notifyCommentApproved(comment)
	}
	result.Success(c, true)
}

// CheckCommentId 按评论编号查询评论。
func CheckCommentId(id uint) *model.Comment {
	var comment model.Comment
	Db.First(&comment, id)
	return &comment
}
