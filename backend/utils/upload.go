package utils

import (
	"net/http"
	"os"
)

// CreateDir 创建目录（支持多级目录）
// filePath: 要创建的目录路径
// 返回值: 操作成功返回nil，失败返回具体错误信息
func CreateDir(filePath string) error {
	if !IsExist(filePath) {
		// MkdirAll会递归创建所有不存在的父目录，权限设置为0755（os.ModePerm等效于0777，实际会受umask影响）
		return os.MkdirAll(filePath, os.ModePerm)
	}
	return nil
}

// IsExist 判断路径是否存在
// path: 要检查的文件或目录路径
// 返回值: 路径存在返回true，不存在或无法判断时返回false
func IsExist(path string) bool {
	_, err := os.Stat(path) // 通过os.Stat获取路径信息
	if err == nil {
		// 无错误说明路径存在
		return true
	}
	// 明确判断为路径不存在的错误
	if os.IsNotExist(err) {
		return false
	}
	// 其他错误（如权限不足等）无法确定路径是否存在，默认返回false
	return false
}

// NoListingFS 自定义文件系统包装器
// 作用：拦截对目录的请求，强制返回 403，彻底关闭 Gin 默认的 AutoIndex 目录列表功能
type NoListingFS struct {
	Fs http.FileSystem
}

// Open 重写 http.FileSystem 的 Open 方法
func (nfs NoListingFS) Open(name string) (http.File, error) {
	f, err := nfs.Fs.Open(name)
	if err != nil {
		return nil, err
	}

	stat, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, err
	}

	// 核心安全逻辑：如果请求的是目录，直接拒绝访问
	if stat.IsDir() {
		_ = f.Close()
		return nil, os.ErrPermission // 返回 403 Forbidden
	}

	return f, nil
}
