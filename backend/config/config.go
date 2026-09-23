package config

import (
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// Config 总配置
type Config struct {
	System SystemConfig `yaml:"system"`
	Logger LoggerConfig `yaml:"logger"`
	Mysql  MysqlConfig  `yaml:"mysql"`
	Upload UploadConfig `yaml:"upload"`
	Auth   AuthConfig   `yaml:"auth"`
	Redis  RedisConfig  `yaml:"redis"`
	Token  struct {
		AdminToken TokenConfig `yaml:"adminToken"`
		UserToken  TokenConfig `yaml:"userToken"`
	} `yaml:"token"`
}

// SystemConfig 系统配置
type SystemConfig struct {
	Host string `yaml:"host"`
	Port string `yaml:"port"`
	Env  string `yaml:"env"`
}

// LoggerConfig 日志配置
type LoggerConfig struct {
	Level       string `yaml:"level"`
	Path        string `yaml:"path"`
	ShowLine    bool   `yaml:"showLine"`
	Color       bool   `yaml:"color"`
	MaxSize     int    `yaml:"max_size"`
	MaxAge      int    `yaml:"max_age"`
	MaxBackups  int    `yaml:"max_backups"`
	Compress    bool   `yaml:"compress"`
	ServiceName string `yaml:"service_name"`
	Console     bool   `yaml:"console"`
}

// MysqlConfig 配置
type MysqlConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
	Hostname string `yaml:"hostname"`
	Charset  string `yaml:"charset"`
	MaxIdle  int    `yaml:"maxIdle"`
	MaxOpen  int    `yaml:"maxOpen"`
}

// RedisConfig Redis 连接配置，连接参数全部从 config.yaml 读取
type RedisConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Password string `yaml:"password"`
	DB       int    `yaml:"db"`
}

// TokenConfig 令牌配置
type TokenConfig struct {
	Header     string `yaml:"header"`
	Secret     string `yaml:"secret"`
	ExpireTime int    `yaml:"expireTime"`
	Issuer     string `yaml:"issuer"`
}

// UploadConfig 上传配置
type UploadConfig struct {
	UploadDir   string   `yaml:"uploadDir"`
	UploadHost  string   `yaml:"uploadHost"`
	MaxSize     int64    `yaml:"maxSize"`
	AllowedExts []string `yaml:"allowedExts"`
}

// AuthConfig 授权配置
type AuthConfig struct {
	AuthCode string `yaml:"authCode"`
}

var AppConfig Config

// Init 读取项目配置文件。
func Init() {
	data, err := os.ReadFile("./config.yaml")
	if err != nil {
		panic("读取配置文件失败：" + err.Error())
	}
	if err := yaml.Unmarshal(data, &AppConfig); err != nil {
		panic("读取配置文件失败：" + err.Error())
	}
}

// ResolveUploadDir 返回上传文件的本地存储目录，并兼容旧的 URL 风格目录配置。
func ResolveUploadDir() string {
	dir := strings.TrimSpace(AppConfig.Upload.UploadDir)
	if dir == "" {
		dir = "./static/upload"
	}
	if strings.HasPrefix(dir, "/") && !filepath.IsAbs(dir) {
		dir = "." + filepath.FromSlash(dir)
	}
	return filepath.Clean(dir)
}
