package utils

import (
	"strings"
	"testing"
)

// TestSanitizeArticleContentPreservesFencedCode 验证 Markdown 围栏代码中的 HTML 原文可用于代码展示。
func TestSanitizeArticleContentPreservesFencedCode(t *testing.T) {
	content := "正文\n\n```html\n<script>alert('代码示例')</script>\n<div class=\"demo\">内容</div>\n```\n\n<script>alert('恶意脚本')</script>"
	result := SanitizeArticleContent(content)

	if !strings.Contains(result, "<script>alert('代码示例')</script>") {
		t.Fatalf("围栏代码被错误修改：%s", result)
	}
	if !strings.Contains(result, "<div class=\"demo\">内容</div>") {
		t.Fatalf("围栏中的 HTML 代码未保留：%s", result)
	}
	if strings.Contains(result, "恶意脚本") || strings.Contains(result, "<script>alert('恶意脚本')</script>") {
		t.Fatalf("正文中的危险脚本未被移除：%s", result)
	}
}

// TestSanitizeArticleContentPreservesUnclosedCode 验证未闭合围栏也不会导致文章代码丢失。
func TestSanitizeArticleContentPreservesUnclosedCode(t *testing.T) {
	content := "```go\nfmt.Println(\"hello\")\n"
	result := SanitizeArticleContent(content)

	if result != content {
		t.Fatalf("未闭合代码块应原样保留，期望 %q，实际 %q", content, result)
	}
}

// TestSanitizeCommentContentPreservesEmoji 验证评论表情保留，同时移除 HTML 标签和脚本。
func TestSanitizeCommentContentPreservesEmoji(t *testing.T) {
	content := "你好 \U0001F600\U0001F44D <script>alert(1)</script><img src=x>"
	result := SanitizeCommentContent(content)

	if !strings.Contains(result, "你好 \U0001F600\U0001F44D") {
		t.Fatalf("评论表情未保留：%q", result)
	}
	if strings.Contains(result, "<script") || strings.Contains(result, "<img") {
		t.Fatalf("评论 HTML 未被移除：%q", result)
	}
}

// TestSanitizeArticleContentRejectsDangerousURLs 验证文章 HTML 净化器会阻止危险链接和图片协议。
func TestSanitizeArticleContentRejectsDangerousURLs(t *testing.T) {
	content := "[危险链接](javascript:alert(1))\n\n![危险图片](data:text/html,<script>alert(1)</script>)"
	result := SanitizeArticleContent(content)

	lowerResult := strings.ToLower(result)
	if strings.Contains(lowerResult, `href="javascript:`) || strings.Contains(lowerResult, `src="data:text/html`) {
		t.Fatalf("危险 URL 协议未被移除：%q", result)
	}
}

// TestSanitizeArticleContentAllowsEditorAlignment 验证编辑器生成的对齐类可保存，同时拒绝任意样式和脚本属性。
func TestSanitizeArticleContentAllowsEditorAlignment(t *testing.T) {
	content := `<div class="article-align-center" onclick="alert(1)"><p>居中内容</p></div><div class="unexpected">普通内容</div>`
	result := SanitizeArticleContent(content)

	if !strings.Contains(result, `class="article-align-center"`) {
		t.Fatalf("安全对齐类未保留：%q", result)
	}
	if strings.Contains(result, "onclick") || strings.Contains(result, `class="unexpected"`) {
		t.Fatalf("危险属性或非白名单类未移除：%q", result)
	}
}
