package api

import (
	. "ginblog/core"
	"ginblog/model"
)

// fillArticleNavigation 查询同分类中按文章编号排序的上一篇和下一篇。
func fillArticleNavigation(articleID uint, article *model.Article) {
	if article == nil || articleID == 0 || article.CategoryID == 0 {
		return
	}
	var previous, next model.Article
	if err := Db.Select("id", "title").Where("category_id = ? AND is_published = ? AND id > ?", article.CategoryID, true, articleID).Order("id ASC").First(&previous).Error; err == nil {
		article.Previous = &model.ArticleNavigation{ID: previous.ID, Title: previous.Title}
	}
	if err := Db.Select("id", "title").Where("category_id = ? AND is_published = ? AND id < ?", article.CategoryID, true, articleID).Order("id DESC").First(&next).Error; err == nil {
		article.Next = &model.ArticleNavigation{ID: next.ID, Title: next.Title}
	}
}
