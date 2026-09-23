package api

import "testing"

// TestTrimLegacyTrailingZeroLine 验证仅清理完整 Markdown 代码块后的旧编辑器残留数字行。
func TestTrimLegacyTrailingZeroLine(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    string
	}{
		{
			name:    "清理代码块后的孤立数字",
			content: "部署命令：\n```go\ngincdn-install --master-url http://192.168.1.100:8080\n```\n0\n",
			want:    "部署命令：\n```go\ngincdn-install --master-url http://192.168.1.100:8080\n```",
		}, {
			name:    "清理多个代码块后的孤立序号",
			content: "## 2. 报错 unzip: command not found\n```go\n安装命令\n```\n1\n## 3. 服务启动失败\n```go\n排查命令\n```\n2\n## 4. 节点连不上主控\n```go\n网络命令\n```\n3\n",
			want:    "## 2. 报错 unzip: command not found\n```go\n安装命令\n```\n## 3. 服务启动失败\n```go\n排查命令\n```\n## 4. 节点连不上主控\n```go\n网络命令\n```",
		},
		{
			name:    "保留代码块后普通段落中的数字",
			content: "```go\n示例\n```\n1\n该数字是正文内容。\n",
			want:    "```go\n示例\n```\n1\n该数字是正文内容。\n",
		},
		{
			name:    "保留普通正文中的数字",
			content: "版本号为 0\n",
			want:    "版本号为 0\n",
		},
		{
			name:    "保留未闭合代码块后的数字",
			content: "```go\nvalue := 0\n0\n",
			want:    "```go\nvalue := 0\n0\n",
		},
		{
			name:    "保留代码块内部的数字",
			content: "```go\n0\n```\n",
			want:    "```go\n0\n```\n",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := trimLegacyTrailingZeroLine(test.content); got != test.want {
				t.Fatalf("清理结果不符合预期：\n得到：%q\n期望：%q", got, test.want)
			}
		})
	}
}
