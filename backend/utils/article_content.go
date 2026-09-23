package utils

import (
	"regexp"
	"strings"
)

// ArticleContentAccess 描述文章正文中局部访问控制区块的类型。
type ArticleContentAccess struct {
	HasProtected bool
	HasPaid      bool
	HasComment   bool
}

const (
	// ArticlePaidContentPlaceholder 是未购买局部付费内容的安全占位标记。
	ArticlePaidContentPlaceholder = "[[ginblog-access:paid]]"
	// ArticleCommentContentPlaceholder 是未评论局部隐藏内容的安全占位标记。
	ArticleCommentContentPlaceholder = "[[ginblog-access:comment]]"
)

var (
	articleHiddenBlockPattern = regexp.MustCompile(`(?is)(^|\n)\s*:::ginblog-hidden\s+(paid|comment)\s*\r?\n(.*?)\r?\n\s*:::`)
	articleHiddenShortPattern = regexp.MustCompile(`(?is)\[ginblog-hidden\s*:\s*(paid|comment)\s*\](.*?)\[/ginblog-hidden\s*\]`)
)

// AnalyzeArticleContent 扫描文章正文中的局部付费和评论隐藏区块。
func AnalyzeArticleContent(content string) ArticleContentAccess {
	access := ArticleContentAccess{}
	inspect := func(kind string) {
		access.HasProtected = true
		switch strings.ToLower(strings.TrimSpace(kind)) {
		case "paid":
			access.HasPaid = true
		case "comment":
			access.HasComment = true
		}
	}
	for _, match := range articleHiddenBlockPattern.FindAllStringSubmatch(content, -1) {
		if len(match) > 2 {
			inspect(match[2])
		}
	}
	for _, match := range articleHiddenShortPattern.FindAllStringSubmatch(content, -1) {
		if len(match) > 1 {
			inspect(match[1])
		}
	}
	return access
}

// RenderArticleContent 根据当前用户的解锁状态裁剪局部隐藏区块。
func RenderArticleContent(content string, paidUnlocked, commentUnlocked bool) string {
	content = articleHiddenBlockPattern.ReplaceAllStringFunc(content, func(block string) string {
		match := articleHiddenBlockPattern.FindStringSubmatch(block)
		if len(match) < 4 {
			return block
		}
		return renderArticleHiddenBlock(match[1], match[2], match[3], paidUnlocked, commentUnlocked)
	})
	return articleHiddenShortPattern.ReplaceAllStringFunc(content, func(block string) string {
		match := articleHiddenShortPattern.FindStringSubmatch(block)
		if len(match) < 3 {
			return block
		}
		return renderArticleHiddenBlock("", match[1], match[2], paidUnlocked, commentUnlocked)
	})
}

// renderArticleHiddenBlock 将区块替换成正文或安全的可见标记，不向未解锁用户返回受保护正文。
func renderArticleHiddenBlock(prefix, kind, content string, paidUnlocked, commentUnlocked bool) string {
	kind = strings.ToLower(strings.TrimSpace(kind))
	unlocked := kind == "paid" && paidUnlocked || kind == "comment" && commentUnlocked
	if unlocked {
		return prefix + content
	}
	if kind == "paid" {
		return prefix + "\n" + ArticlePaidContentPlaceholder + "\n"
	}
	return prefix + "\n" + ArticleCommentContentPlaceholder + "\n"
}

// HasArticlePaidContent 判断文章是否包含局部付费区块。
func HasArticlePaidContent(content string) bool {
	return AnalyzeArticleContent(content).HasPaid
}
