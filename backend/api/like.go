package api

import (
	"strings"

	. "ginblog/core"
	"ginblog/model"
	"ginblog/result"
	"ginblog/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// currentUserID 从可选登录上下文中读取当前用户编号。
func currentUserID(c *gin.Context) (uint, bool) {
	value, exists := c.Get("username")
	if !exists {
		return 0, false
	}
	username, ok := value.(string)
	if !ok || strings.TrimSpace(username) == "" {
		return 0, false
	}
	user := CheckUsername(username)
	if user == nil || user.ID == 0 {
		return 0, false
	}
	return user.ID, true
}

// fillArticleLikeState 补充文章点赞数量对应的当前用户状态。
func fillArticleLikeState(c *gin.Context, articles []model.Article) {
	userID, ok := currentUserID(c)
	if !ok || len(articles) == 0 {
		return
	}
	ids := make([]uint, 0, len(articles))
	for _, item := range articles {
		ids = append(ids, item.ID)
	}
	var likes []model.ArticleLike
	if err := Db.Where("user_id = ? AND article_id IN ?", userID, ids).Find(&likes).Error; err != nil {
		return
	}
	liked := make(map[uint]bool, len(likes))
	for _, item := range likes {
		liked[item.ArticleID] = true
	}
	for index := range articles {
		articles[index].Liked = liked[articles[index].ID]
	}
}

// fillCommentLikeState 补充评论点赞数量对应的当前用户状态。
func fillCommentLikeState(c *gin.Context, comments []model.Comment) {
	userID, ok := currentUserID(c)
	if !ok || len(comments) == 0 {
		return
	}
	ids := make([]uint, 0, len(comments))
	for _, item := range comments {
		ids = append(ids, item.ID)
	}
	var likes []model.CommentLike
	if err := Db.Where("user_id = ? AND comment_id IN ?", userID, ids).Find(&likes).Error; err != nil {
		return
	}
	liked := make(map[uint]bool, len(likes))
	for _, item := range likes {
		liked[item.CommentID] = true
	}
	for index := range comments {
		comments[index].Liked = liked[comments[index].ID]
	}
}

// ToggleArticleLike 切换当前用户对文章的点赞状态。
func ToggleArticleLike(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		result.FailedWithMsg(c, result.Unauthorized, "请登录后点赞文章")
		return
	}
	articleID := parseUint(c.Query("article_id"))
	if articleID == 0 {
		articleID = parseUint(c.PostForm("article_id"))
	}
	var article model.Article
	if err := Db.Where("id = ? AND is_published = ?", articleID, true).First(&article).Error; err != nil {
		result.FailedWithMsg(c, result.NotFound, "文章不存在")
		return
	}
	var liked bool
	err := Db.Transaction(func(tx *gorm.DB) error {
		var record model.ArticleLike
		err := tx.Where("article_id = ? AND user_id = ?", articleID, userID).First(&record).Error
		switch err {
		case nil:
			liked = false
			if err = tx.Delete(&record).Error; err != nil {
				return err
			}
			return tx.Model(&model.Article{}).Where("id = ?", articleID).Update("like_count", gorm.Expr("CASE WHEN like_count > 0 THEN like_count - 1 ELSE 0 END")).Error
		case gorm.ErrRecordNotFound:
			liked = true
			if err = tx.Create(&model.ArticleLike{ArticleID: articleID, UserID: userID, CreateTime: utils.HTime{Time: utils.Now()}}).Error; err != nil {
				return err
			}
			return tx.Model(&model.Article{}).Where("id = ?", articleID).Update("like_count", gorm.Expr("like_count + 1")).Error
		default:
			return err
		}
	})
	if err != nil {
		result.Failed(c, result.ServiceUnavail, result.UpdateError)
		return
	}
	Db.Select("like_count").First(&article, articleID)
	result.Success(c, gin.H{"liked": liked, "like_count": article.LikeCount})
}

// ToggleCommentLike 切换当前用户对评论的点赞状态。
func ToggleCommentLike(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		result.FailedWithMsg(c, result.Unauthorized, "请登录后点赞评论")
		return
	}
	commentID := parseUint(c.Query("comment_id"))
	if commentID == 0 {
		commentID = parseUint(c.PostForm("comment_id"))
	}
	var comment model.Comment
	if err := Db.Where("id = ? AND status = ?", commentID, 1).First(&comment).Error; err != nil {
		result.FailedWithMsg(c, result.NotFound, "评论不存在")
		return
	}
	var liked bool
	err := Db.Transaction(func(tx *gorm.DB) error {
		var record model.CommentLike
		err := tx.Where("comment_id = ? AND user_id = ?", commentID, userID).First(&record).Error
		switch err {
		case nil:
			liked = false
			if err = tx.Delete(&record).Error; err != nil {
				return err
			}
			return tx.Model(&model.Comment{}).Where("id = ?", commentID).Update("like_count", gorm.Expr("CASE WHEN like_count > 0 THEN like_count - 1 ELSE 0 END")).Error
		case gorm.ErrRecordNotFound:
			liked = true
			if err = tx.Create(&model.CommentLike{CommentID: commentID, UserID: userID, CreateTime: utils.HTime{Time: utils.Now()}}).Error; err != nil {
				return err
			}
			return tx.Model(&model.Comment{}).Where("id = ?", commentID).Update("like_count", gorm.Expr("like_count + 1")).Error
		default:
			return err
		}
	})
	if err != nil {
		result.Failed(c, result.ServiceUnavail, result.UpdateError)
		return
	}
	Db.Select("like_count").First(&comment, commentID)
	result.Success(c, gin.H{"liked": liked, "like_count": comment.LikeCount})
}

// parseUint 解析点赞接口中的编号参数。
func parseUint(value string) uint {
	var id uint
	for _, char := range strings.TrimSpace(value) {
		if char < '0' || char > '9' {
			return 0
		}
		id = id*10 + uint(char-'0')
	}
	return id
}
