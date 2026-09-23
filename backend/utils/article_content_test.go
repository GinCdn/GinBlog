package utils

import (
	"strings"
	"testing"
)

func TestAnalyzeArticleContent(t *testing.T) {
	content := "公开内容\n\n:::ginblog-hidden paid\n付费正文\n:::\n\n[ginblog-hidden:comment]评论正文[/ginblog-hidden]"
	access := AnalyzeArticleContent(content)
	if !access.HasProtected || !access.HasPaid || !access.HasComment {
		t.Fatalf("局部隐藏区块识别结果不正确：%+v", access)
	}
}

func TestRenderArticleContent(t *testing.T) {
	content := "公开内容\n\n:::ginblog-hidden paid\n付费正文\n:::\n\n:::ginblog-hidden comment\n评论正文\n:::"
	locked := RenderArticleContent(content, false, true)
	if strings.Contains(locked, "付费正文") || !strings.Contains(locked, ArticlePaidContentPlaceholder) || !strings.Contains(locked, "评论正文") {
		t.Fatalf("局部隐藏区块裁剪不正确：%s", locked)
	}
	if strings.Contains(locked, "> **付费内容**") {
		t.Fatalf("未解锁内容不应返回 Markdown 引用提示：%s", locked)
	}

	unlocked := RenderArticleContent(content, true, true)
	if !strings.Contains(unlocked, "付费正文") || !strings.Contains(unlocked, "评论正文") {
		t.Fatalf("解锁后正文恢复不正确：%s", unlocked)
	}
}
