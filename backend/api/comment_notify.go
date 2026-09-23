package api

import (
	"fmt"
	"html"
	"strings"

	. "ginblog/core"
	"ginblog/global"
	"ginblog/middleware"
	"ginblog/model"
)

// notifyCommentApproved 在评论审核通过或免审核直接发布后向文章作者或被回复者发送通知。
func notifyCommentApproved(comment model.Comment) {
	var site model.SiteConfig
	if err := Db.First(&site, 1).Error; err != nil {
		global.Log.Warnf("读取评论邮件通知配置失败: comment_id=%d, err=%v", comment.ID, err)
		return
	}
	if !site.CommentEmailNotify {
		global.Log.Debugf("评论邮件通知已关闭: comment_id=%d", comment.ID)
		return
	}

	recipient := ""
	subject := ""
	if comment.ParentID > 0 {
		var parent model.Comment
		if err := Db.First(&parent, comment.ParentID).Error; err != nil {
			global.Log.Warnf("查询被回复评论失败: comment_id=%d, err=%v", comment.ID, err)
			return
		}
		recipient = strings.TrimSpace(parent.Email)
		subject = "您的评论收到新回复"
	} else {
		var article model.Article
		if err := Db.First(&article, comment.ArticleID).Error; err != nil {
			global.Log.Warnf("查询评论所属文章失败: comment_id=%d, err=%v", comment.ID, err)
			return
		}

		var author model.User
		if err := Db.Select("id", "email").First(&author, article.AuthorID).Error; err != nil {
			global.Log.Warnf("查询文章作者邮箱失败，改用站点管理员邮箱: article_id=%d, author_id=%d, err=%v", article.ID, article.AuthorID, err)
		}
		recipient = strings.TrimSpace(author.Email)
		if recipient == "" {
			recipient = strings.TrimSpace(site.AdminEmail)
		}
		subject = "您的文章收到新评论"
	}

	if recipient == "" {
		global.Log.Warnf("评论通知邮件未发送，未找到收件人邮箱: comment_id=%d", comment.ID)
		return
	}
	if strings.EqualFold(recipient, strings.TrimSpace(comment.Email)) {
		global.Log.Debugf("评论通知邮件跳过本人: comment_id=%d, recipient=%s", comment.ID, recipient)
		return
	}

	config, err := GetEmailConfig(Db)
	if err != nil {
		global.Log.Warnf("评论通知邮件未发送: comment_id=%d, err=%v", comment.ID, err)
		return
	}
	body := fmt.Sprintf(`<div style="font-family:Arial,sans-serif;line-height:1.8"><h2>评论通知</h2><p>您收到了一条新的评论或回复：</p><blockquote>%s</blockquote><p>审核已通过，请登录网站查看详情。</p></div>`, html.EscapeString(comment.Content))
	if err := middleware.NewMailService(Db, config).SendNotificationEmail(recipient, subject, body); err != nil {
		global.Log.Warnf("评论通知邮件发送失败: comment_id=%d, recipient=%s, err=%v", comment.ID, recipient, err)
		return
	}
	global.Log.Infof("评论通知邮件发送成功: comment_id=%d, recipient=%s", comment.ID, recipient)
}
