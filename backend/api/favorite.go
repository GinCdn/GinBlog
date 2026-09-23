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

// fillArticleFavoriteState 补充文章收藏数量和当前用户的收藏状态。
func fillArticleFavoriteState(c *gin.Context, articles []model.Article) {
	if len(articles) == 0 {
		return
	}
	ids := make([]uint, 0, len(articles))
	for _, article := range articles {
		ids = append(ids, article.ID)
	}
	var counts []struct {
		ArticleID uint
		Count     int
	}
	if err := Db.Model(&model.ArticleFavorite{}).Select("article_id, COUNT(*) AS count").Where("article_id IN ?", ids).Group("article_id").Scan(&counts).Error; err == nil {
		countMap := make(map[uint]int, len(counts))
		for _, item := range counts {
			countMap[item.ArticleID] = item.Count
		}
		for index := range articles {
			articles[index].FavoriteCount = countMap[articles[index].ID]
		}
	}

	userID, loggedIn := currentUserID(c)
	if !loggedIn {
		return
	}
	var favorites []model.ArticleFavorite
	if err := Db.Where("user_id = ? AND article_id IN ?", userID, ids).Find(&favorites).Error; err != nil {
		return
	}
	favorited := make(map[uint]bool, len(favorites))
	for _, item := range favorites {
		favorited[item.ArticleID] = true
	}
	for index := range articles {
		articles[index].Favorited = favorited[articles[index].ID]
	}
}

// ToggleArticleFavorite 切换当前用户对文章的收藏状态。
func ToggleArticleFavorite(c *gin.Context) {
	userID, loggedIn := currentUserID(c)
	if !loggedIn {
		result.FailedWithMsg(c, result.Unauthorized, "请登录后收藏文章")
		return
	}
	articleID := parseFavoriteID(c)
	if articleID == 0 {
		result.FailedWithMsg(c, result.BadRequest, "文章编号不能为空")
		return
	}
	var article model.Article
	if err := Db.Where("id = ? AND is_published = ?", articleID, true).First(&article).Error; err != nil {
		result.FailedWithMsg(c, result.NotFound, "文章不存在")
		return
	}

	var favorited bool
	err := Db.Transaction(func(tx *gorm.DB) error {
		var record model.ArticleFavorite
		err := tx.Where("article_id = ? AND user_id = ?", articleID, userID).First(&record).Error
		switch err {
		case nil:
			favorited = false
			if err = tx.Delete(&record).Error; err != nil {
				return err
			}
		case gorm.ErrRecordNotFound:
			favorited = true
			if err = tx.Create(&model.ArticleFavorite{ArticleID: articleID, UserID: userID, CreateTime: utils.HTime{Time: utils.Now()}}).Error; err != nil {
				return err
			}
		default:
			return err
		}
		return nil
	})
	if err != nil {
		result.Failed(c, result.ServiceUnavail, result.UpdateError)
		return
	}

	var favoriteCount int64
	Db.Model(&model.ArticleFavorite{}).Where("article_id = ?", articleID).Count(&favoriteCount)
	result.Success(c, gin.H{"favorited": favorited, "favorite_count": favoriteCount})
}

// parseFavoriteID 兼容查询参数和表单参数读取文章编号。
func parseFavoriteID(c *gin.Context) uint {
	value := strings.TrimSpace(c.Query("article_id"))
	if value == "" {
		value = strings.TrimSpace(c.PostForm("article_id"))
	}
	return parseUint(value)
}
