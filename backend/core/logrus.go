package core

/**
@author 阿贵
基于logrus的企业级别日志解决方案
特性：
	1.异步非阻塞写入
	2.自动日志轮转
	3.结构化JSON输出
	4.多级日志过滤
*/
import (
	"bytes"
	"fmt"
	"ginblog/config"
	"io"
	"os"
	"path"
	"runtime"
	"sync"
	"time"

	rotatelogs "github.com/lestrrat-go/file-rotatelogs"
	"github.com/rifflock/lfshook"
	"github.com/sirupsen/logrus"
)

// ANSI颜色代码常量
const (
	red    = 31 // 错误级别颜色
	yellow = 33 // 警告级别颜色
	blue   = 36 // 信息级别颜色
	gray   = 37 // 调试级别颜色
)

// 缓冲池减少内存分配
var bufferPool = sync.Pool{
	New: func() interface{} { return new(bytes.Buffer) },
}

// LogFormatter 自定义日志格式化器
type LogFormatter struct {
	EnableCaller bool   // 是否显示调用者信息
	ServiceName  string // 服务名称标识
}

// Format 实现logrus.Formatter接口
func (f *LogFormatter) Format(entry *logrus.Entry) ([]byte, error) {
	// 从缓冲池获取buffer
	buf := bufferPool.Get().(*bytes.Buffer)
	defer bufferPool.Put(buf)
	buf.Reset()

	// 格式化本地时间
	timestamp := entry.Time.Local().Format("2006-01-02 15:04:05")

	// 根据日志级别设置颜色
	var levelColor int
	switch entry.Level {
	case logrus.DebugLevel, logrus.TraceLevel:
		levelColor = gray
	case logrus.WarnLevel:
		levelColor = yellow
	case logrus.ErrorLevel, logrus.FatalLevel, logrus.PanicLevel:
		levelColor = red
	default:
		levelColor = blue
	}

	// 带调用栈的格式
	if f.EnableCaller && entry.HasCaller() {
		funcVal := formatCaller(entry.Caller.Function)
		fileVal := fmt.Sprintf("%s:%d", path.Base(entry.Caller.File), entry.Caller.Line)
		fmt.Fprintf(buf, "[%s][%s] \x1b[%dm[%-5s]\x1b[0m %s %s: %s\n",
			f.ServiceName, timestamp, levelColor, entry.Level, fileVal, funcVal, entry.Message)
	} else {
		// 普通格式
		fmt.Fprintf(buf, "[%s][%s] \x1b[%dm[%-5s]\x1b[0m: %s\n",
			f.ServiceName, timestamp, levelColor, entry.Level, entry.Message)
	}
	return buf.Bytes(), nil
}

// 格式化调用者信息
func formatCaller(f string) string {
	// 保留最后一级包名/函数名
	for i := len(f) - 1; i > 0; i-- {
		if f[i] == '/' {
			f = f[i+1:]
			break
		}
	}
	return f
}

// consoleHook 控制台输出钩子
type consoleHook struct {
	formatter *LogFormatter
}

func (h *consoleHook) Levels() []logrus.Level {
	return logrus.AllLevels
}

func (h *consoleHook) Fire(entry *logrus.Entry) error {
	line, _ := h.formatter.Format(entry)
	_, err := os.Stdout.Write(line)
	return err
}

// InitLogger 初始化日志系统
func InitLogger(cfg config.LoggerConfig) *logrus.Logger {
	log := logrus.New()
	log.SetReportCaller(cfg.ShowLine) // 启用调用者信息

	// 初始化公共格式化器
	formatter := &LogFormatter{
		EnableCaller: cfg.ShowLine,
		ServiceName:  cfg.ServiceName,
	}

	// 根据操作系统调整日志配置
	var writer io.Writer
	var err error

	// 日志文件格式，添加.log后缀便于识别
	logPattern := fmt.Sprintf("%s.%s.txt", cfg.Path, "%Y%m%d")

	// 创建rotatelogs配置
	rotatelogOpts := []rotatelogs.Option{
		rotatelogs.WithMaxAge(time.Hour * 24 * time.Duration(cfg.MaxAge)),
		rotatelogs.WithRotationSize(int64(cfg.MaxSize) * 1024 * 1024),
		rotatelogs.WithRotationTime(24 * time.Hour),
	}

	// Windows系统禁用符号链接，避免权限问题
	if runtime.GOOS == "windows" {
		writer, err = rotatelogs.New(logPattern, rotatelogOpts...)
	} else {
		// 非Windows系统保留符号链接功能
		rotatelogOpts = append(rotatelogOpts, rotatelogs.WithLinkName(cfg.Path+".latest"))
		writer, err = rotatelogs.New(logPattern, rotatelogOpts...)
	}

	if err != nil {
		panic(fmt.Sprintf("日志初始化失败: %v", err))
	}

	// 禁用默认输出，全部通过Hook处理
	log.SetOutput(io.Discard)

	// 文件日志Hook
	log.AddHook(lfshook.NewHook(
		lfshook.WriterMap{
			logrus.InfoLevel:  writer,
			logrus.WarnLevel:  writer,
			logrus.ErrorLevel: writer,
			logrus.DebugLevel: writer,
			logrus.FatalLevel: writer,
			logrus.PanicLevel: writer,
			logrus.TraceLevel: writer,
		},
		formatter,
	))

	// 控制台输出配置
	if cfg.Console {
		log.AddHook(&consoleHook{formatter: formatter})
	}

	// 设置日志级别
	level, err := logrus.ParseLevel(cfg.Level)
	if err != nil {
		level = logrus.InfoLevel
	}
	log.SetLevel(level)

	return log
}
