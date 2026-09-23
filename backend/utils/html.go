package utils

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/microcosm-cc/bluemonday"
)

// HTMLSanitizer 封装 HTML 净化逻辑的工具结构体。
type HTMLSanitizer struct {
	policy *bluemonday.Policy
}

// NewHTMLSanitizer 创建用于处理文章富文本的安全净化器。
func NewHTMLSanitizer() *HTMLSanitizer {
	policy := bluemonday.UGCPolicy()
	policy.AllowElements("pre", "code")
	policy.AllowAttrs("class").OnElements("pre", "code")
	policy.AllowElements("h1", "h2", "h3", "h4", "h5", "h6")
	policy.AllowElements("p", "div", "span", "br", "hr")
	policy.AllowAttrs("class").Matching(regexp.MustCompile(`^article-align-(left|center|right|justify)$`)).OnElements("p", "div", "span")
	policy.AllowElements("ul", "ol", "li")
	policy.AllowElements("strong", "em", "b", "i")
	policy.AllowElements("img")
	policy.AllowAttrs("src", "alt").OnElements("img")
	policy.AllowRelativeURLs(true)
	policy.AllowURLSchemes("http", "https")
	policy.AllowElements("a").AllowAttrs("href").OnElements("a")
	return &HTMLSanitizer{policy: policy}
}

// Sanitize 净化 HTML 内容，返回安全的字符串。
func (s *HTMLSanitizer) Sanitize(rawHTML string) string {
	return s.policy.Sanitize(rawHTML)
}

// SanitizeCommentContent 将评论按纯文本处理，删除 HTML 标签和脚本，保留正常文字、换行及表情。
func SanitizeCommentContent(content string) string {
	return bluemonday.StrictPolicy().Sanitize(content)
}

// markdownFenceInfo 解析 Markdown 围栏行，返回围栏字符和长度。
func markdownFenceInfo(line string) (byte, int, bool) {
	trimmed := strings.TrimLeft(line, " \t")
	if len(trimmed) < 3 || (trimmed[0] != '`' && trimmed[0] != '~') {
		return 0, 0, false
	}

	fenceChar := trimmed[0]
	length := 0
	for length < len(trimmed) && trimmed[length] == fenceChar {
		length++
	}
	return fenceChar, length, length >= 3
}

// isMarkdownFenceClosingLine 判断当前行是否为指定围栏的闭合行。
func isMarkdownFenceClosingLine(line string, fenceChar byte, minLength int) bool {
	char, length, ok := markdownFenceInfo(line)
	if !ok || char != fenceChar || length < minLength {
		return false
	}
	trimmed := strings.TrimLeft(line, " \t")
	return strings.TrimSpace(trimmed[length:]) == ""
}

// protectMarkdownCodeBlocks 将 Markdown 围栏代码块替换为临时标记，避免 HTML 净化器修改代码原文。
func protectMarkdownCodeBlocks(content string) (string, []string) {
	lines := strings.SplitAfter(content, "\n")
	var result strings.Builder
	var block strings.Builder
	blocks := make([]string, 0)
	inCodeBlock := false
	var fenceChar byte
	fenceLength := 0

	flushCodeBlock := func() {
		marker := fmt.Sprintf("GINBLOG_CODE_BLOCK_TOKEN_%d", len(blocks))
		blocks = append(blocks, block.String())
		result.WriteString(marker)
		block.Reset()
		inCodeBlock = false
		fenceChar = 0
		fenceLength = 0
	}

	for _, line := range lines {
		if !inCodeBlock {
			char, length, ok := markdownFenceInfo(line)
			if !ok {
				result.WriteString(line)
				continue
			}
			inCodeBlock = true
			fenceChar = char
			fenceLength = length
			block.WriteString(line)
			continue
		}

		block.WriteString(line)
		if isMarkdownFenceClosingLine(line, fenceChar, fenceLength) {
			flushCodeBlock()
		}
	}

	if inCodeBlock {
		flushCodeBlock()
	}
	return result.String(), blocks
}

// SanitizeArticleContent 净化正文中的普通 HTML，同时完整保留 Markdown 围栏代码块。
func SanitizeArticleContent(content string) string {
	if content == "" {
		return ""
	}
	protectedContent, codeBlocks := protectMarkdownCodeBlocks(content)
	sanitizedContent := GetSanitizer().Sanitize(protectedContent)
	for index, codeBlock := range codeBlocks {
		marker := fmt.Sprintf("GINBLOG_CODE_BLOCK_TOKEN_%d", index)
		sanitizedContent = strings.ReplaceAll(sanitizedContent, marker, codeBlock)
	}
	return sanitizedContent
}

// 全局单例，避免重复创建净化策略。
var globalSanitizer = NewHTMLSanitizer()

// GetSanitizer 获取全局 HTML 净化工具实例。
func GetSanitizer() *HTMLSanitizer {
	return globalSanitizer
}
