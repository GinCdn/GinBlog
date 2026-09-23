package api

import (
	"fmt"
	"ginblog/config"
	"ginblog/core"
	"ginblog/global"
	"ginblog/result"
	"ginblog/utils"
	"github.com/gin-gonic/gin"
	"mime/multipart"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// Upload 图片文件上传
// @Summary 图片文件上传
// @Tags 文件上传相关接口
// @Produce json
// @description 图片文件上传
// @Accept multipart/form-data
// @Param file formData file true "文件"
// @Success 200 {object} result.Result{data=string} "返回文件访问URL"
// @Router /api/admin/upload [post]
// @Security ApiKeyAuth
func Upload(c *gin.Context) {
	tokenVo, _ := core.GetAdminFromContext(c)
	if tokenVo == nil {
		result.Failed(c, result.Unauthorized, "请先登录")
		return
	}
	// 限制文件大小
	if err := c.Request.ParseMultipartForm(config.AppConfig.Upload.MaxSize); err != nil {
		global.Log.Warnf("文件大小超过限制: %v", err)
		result.Failed(c, result.BadRequest, "文件过大，超过最大限制")
		return
	}

	// 获取上传文件
	file, err := c.FormFile("file")
	if err != nil {
		global.Log.Warnf("获取上传文件失败: %v", err)
		result.Failed(c, result.BadRequest, "请上传文件（form-data字段名: file）")
		return
	}

	// 验证文件大小
	if file.Size > config.AppConfig.Upload.MaxSize {
		maxSizeMB := float64(config.AppConfig.Upload.MaxSize) / 1024 / 1024
		global.Log.Warnf("文件大小超限: 文件名=%s, 大小=%d字节, 最大限制=%.2fMB", file.Filename, file.Size, maxSizeMB)
		result.FailedWithMsg(c, result.BadRequest, fmt.Sprintf("文件过大，最大支持%.2fMB", maxSizeMB))
		return
	}

	// 解析并验证文件扩展名
	ext := strings.ToLower(path.Ext(file.Filename))
	if !isAllowedFileExt(ext) {
		global.Log.Warnf("不支持的文件扩展名: 文件名=%s, 扩展名=%s", file.Filename, ext)
		result.Failed(c, result.BadRequest, "不支持的文件类型")
		return
	}

	// 验证文件MIME类型
	openedFile, err := file.Open()
	if err != nil {
		global.Log.Errorf("打开文件失败: %v, 文件名=%s", err, file.Filename)
		result.Failed(c, result.InternalError, "文件处理失败")
		return
	}
	defer func(openedFile multipart.File) {
		if err := openedFile.Close(); err != nil {
			global.Log.Warnf("关闭文件失败: %v", err)
		}
	}(openedFile)

	buf := make([]byte, 512)
	n, err := openedFile.Read(buf)
	if err != nil || n < len(buf) {
		global.Log.Errorf("读取文件头失败: %v, 文件名=%s", err, file.Filename)
		result.Failed(c, result.InternalError, "文件处理失败")
		return
	}

	mimeType := http.DetectContentType(buf)
	if !isAllowedMimeType(mimeType, ext) {
		global.Log.Warnf("文件类型不匹配: 文件名=%s, 扩展名=%s, 实际MIME=%s", file.Filename, ext, mimeType)
		result.Failed(c, result.BadRequest, "文件类型验证失败（可能为伪装文件）")
		return
	}

	// 获取当前时间并格式化路径和文件名
	now := utils.Now()
	year := now.Format("2006")           // 年（2025）
	monthDay := now.Format("0102")       // 月日（1018，即10月18日）
	timeStamp := now.Format("150405000") // 时分秒毫秒（210530456，即21时05分30秒456毫秒）

	// 生成文件名：时分秒毫秒.扩展名（如210530456.jpg）
	fileName := timeStamp + ext

	// 构建存储路径：/upload/年/月日（如/upload/2025/1018）
	baseDir := filepath.Clean(config.AppConfig.Upload.UploadDir) // 基础目录：/upload/
	filePath := filepath.Join(baseDir, year, monthDay)           // 拼接后：/upload/2025/1018

	// 验证路径合法性（防止路径穿越）
	if !strings.HasPrefix(filePath, baseDir) {
		global.Log.Errorf("非法存储路径: 基础目录=%s, 生成路径=%s", baseDir, filePath)
		result.Failed(c, result.InternalError, "文件存储路径异常")
		return
	}

	// 创建目录（确保年/月日目录存在）
	if err := utils.CreateDir(filePath); err != nil {
		global.Log.Errorf("创建存储目录失败: %v, 路径=%s", err, filePath)
		result.Failed(c, result.InternalError, "创建存储目录失败")
		return
	}

	// 完整本地路径：/upload/2025/1018/210530456.jpg
	fullPath := filepath.Join(filePath, fileName)

	// 保存文件
	if err := c.SaveUploadedFile(file, fullPath); err != nil {
		global.Log.Errorf("保存文件失败: %v, 目标路径=%s", err, fullPath)
		result.Failed(c, result.InternalError, "文件上传失败")
		return
	}

	// 设置文件只读权限
	if err := os.Chmod(fullPath, 0644); err != nil {
		global.Log.Warnf("设置文件权限失败: %v, 路径=%s", err, fullPath)
	}

	// ========== 核心修复：URL拼接逻辑 ==========
	// 原错误：拼接了 "upload/" 前缀，导致URL多一层
	// 新逻辑：直接拼接 年/月日/文件名，因为 Gin 路由 /uploads 已经映射到 /upload/ 本地目录
	host := strings.TrimRight(config.AppConfig.Upload.UploadHost, "/") // http://127.0.0.1:8080/uploads
	// 去掉 "upload/" 前缀，直接拼接 年/月日/文件名
	relativePath := path.Join(year, monthDay, fileName) // 2026/0227/033103000.png
	fileURL := fmt.Sprintf("%s/%s", host, relativePath) // http://127.0.0.1:8080/uploads/2026/0227/033103000.png
	// ========== 修复结束 ==========

	global.Log.Infof("文件上传成功: 存储路径=%s, 访问URL=%s", fullPath, fileURL)

	// 返回URL
	result.Success(c, fileURL)
}

func isAllowedFileExt(ext string) bool {
	allowedExts := config.AppConfig.Upload.AllowedExts
	// 打印配置的允许扩展名列表，排查是否加载正确
	global.Log.Infof("当前允许的文件扩展名: %v", allowedExts)
	for _, allowed := range allowedExts {
		if strings.ToLower(allowed) == ext {
			return true
		}
	}
	return false
}

// 验证MIME类型与扩展名是否匹配
func isAllowedMimeType(mimeType, ext string) bool {
	mimeMap := map[string][]string{
		".jpg":  {"image/jpeg", "image/pjpeg"},
		".jpeg": {"image/jpeg", "image/pjpeg"},
		".png":  {"image/png", "image/x-png"},
		".gif":  {"image/gif"},
		".pdf":  {"application/pdf"},
		// 可扩展其他类型
	}

	allowedMimes, ok := mimeMap[ext]
	if !ok {
		return false
	}

	for _, allowed := range allowedMimes {
		if allowed == mimeType {
			return true
		}
	}
	return false
}

// UserUpload 用户图片文件上传
// @Summary 用户图片文件上传
// @Tags 文件上传相关接口
// @Produce json
// @description 用户端图片文件上传（提现二维码等场景），安全校验与管理员上传一致
// @Accept multipart/form-data
// @Param file formData file true "文件"
// @Success 200 {object} result.Result{data=string} "返回文件访问URL"
// @Router /api/user/upload [post]
// @Security ApiKeyAuth
func UserUpload(c *gin.Context) {
	// 用户鉴权：UserAuthMiddleware 已在路由层校验 token 并写入 username，这里再确认一次防止绕过
	username, exists := c.Get("username")
	if !exists || username == "" {
		result.Failed(c, result.Unauthorized, "请先登录")
		return
	}

	// 限制文件大小
	if err := c.Request.ParseMultipartForm(config.AppConfig.Upload.MaxSize); err != nil {
		global.Log.Warnf("用户上传文件大小超过限制: %v", err)
		result.Failed(c, result.BadRequest, "文件过大，超过最大限制")
		return
	}

	// 获取上传文件
	file, err := c.FormFile("file")
	if err != nil {
		global.Log.Warnf("用户获取上传文件失败: %v", err)
		result.Failed(c, result.BadRequest, "请上传文件（form-data字段名: file）")
		return
	}

	// 验证文件大小
	if file.Size > config.AppConfig.Upload.MaxSize {
		maxSizeMB := float64(config.AppConfig.Upload.MaxSize) / 1024 / 1024
		global.Log.Warnf("用户上传文件大小超限: 文件名=%s, 大小=%d字节, 最大限制=%.2fMB", file.Filename, file.Size, maxSizeMB)
		result.FailedWithMsg(c, result.BadRequest, fmt.Sprintf("文件过大，最大支持%.2fMB", maxSizeMB))
		return
	}

	// 解析并验证文件扩展名
	ext := strings.ToLower(path.Ext(file.Filename))
	if !isAllowedFileExt(ext) {
		global.Log.Warnf("用户上传不支持的文件扩展名: 文件名=%s, 扩展名=%s", file.Filename, ext)
		result.Failed(c, result.BadRequest, "不支持的文件类型")
		return
	}

	// 验证文件MIME类型（防止伪装文件）
	openedFile, err := file.Open()
	if err != nil {
		global.Log.Errorf("用户上传打开文件失败: %v, 文件名=%s", err, file.Filename)
		result.Failed(c, result.InternalError, "文件处理失败")
		return
	}
	defer func(openedFile multipart.File) {
		if err := openedFile.Close(); err != nil {
			global.Log.Warnf("关闭文件失败: %v", err)
		}
	}(openedFile)

	buf := make([]byte, 512)
	n, err := openedFile.Read(buf)
	if err != nil || n < len(buf) {
		global.Log.Errorf("用户上传读取文件头失败: %v, 文件名=%s", err, file.Filename)
		result.Failed(c, result.InternalError, "文件处理失败")
		return
	}

	mimeType := http.DetectContentType(buf)
	if !isAllowedMimeType(mimeType, ext) {
		global.Log.Warnf("用户上传文件类型不匹配: 文件名=%s, 扩展名=%s, 实际MIME=%s", file.Filename, ext, mimeType)
		result.Failed(c, result.BadRequest, "文件类型验证失败（可能为伪装文件）")
		return
	}

	// 获取当前时间并格式化路径和文件名
	now := utils.Now()
	year := now.Format("2006")
	monthDay := now.Format("0102")
	timeStamp := now.Format("150405000")

	// 生成文件名：时分秒毫秒.扩展名
	fileName := timeStamp + ext

	// 构建存储路径：/upload/年/月日
	baseDir := filepath.Clean(config.AppConfig.Upload.UploadDir)
	filePath := filepath.Join(baseDir, year, monthDay)

	// 验证路径合法性（防止路径穿越）
	if !strings.HasPrefix(filePath, baseDir) {
		global.Log.Errorf("用户上传非法存储路径: 基础目录=%s, 生成路径=%s", baseDir, filePath)
		result.Failed(c, result.InternalError, "文件存储路径异常")
		return
	}

	// 创建目录
	if err := utils.CreateDir(filePath); err != nil {
		global.Log.Errorf("用户上传创建存储目录失败: %v, 路径=%s", err, filePath)
		result.Failed(c, result.InternalError, "创建存储目录失败")
		return
	}

	// 完整本地路径
	fullPath := filepath.Join(filePath, fileName)

	// 保存文件
	if err := c.SaveUploadedFile(file, fullPath); err != nil {
		global.Log.Errorf("用户上传保存文件失败: %v, 目标路径=%s", err, fullPath)
		result.Failed(c, result.InternalError, "文件上传失败")
		return
	}

	// 设置文件只读权限
	if err := os.Chmod(fullPath, 0644); err != nil {
		global.Log.Warnf("用户上传设置文件权限失败: %v, 路径=%s", err, fullPath)
	}

	// URL拼接
	host := strings.TrimRight(config.AppConfig.Upload.UploadHost, "/")
	relativePath := path.Join(year, monthDay, fileName)
	fileURL := fmt.Sprintf("%s/%s", host, relativePath)

	global.Log.Infof("用户文件上传成功: 用户=%s, 存储路径=%s, 访问URL=%s", username, fullPath, fileURL)

	result.Success(c, fileURL)
}
