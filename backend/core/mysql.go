package core

/**
@author 阿贵
MySQL数据库连接管理器
特性：
1.支持连接池配置(最大空闲/活跃连接数)
2.自动解析时间类型字段
3.预编译SQL提升性能
4.禁用默认事务提升效率
5.完善的错误处理机制
*/
import (
	"fmt"
	"ginblog/config"
	"ginblog/global"
	"ginblog/utils"
	"net/url"
	"time"
	_ "time/tzdata"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Db 全局数据库实例
var Db *gorm.DB

// MysqlInit 初始化MySQL数据库连接
func MysqlInit() error {
	dbConfig := config.AppConfig.Mysql

	// 明确指定中国时区，避免数据库连接依赖服务器操作系统时区。
	location := url.QueryEscape("Asia/Shanghai")
	mysqlTimeZone := url.QueryEscape("'+08:00'")
	dsn := fmt.Sprintf(
		"%s:%s@tcp(%s:%d)/%s?charset=%s&collation=utf8mb4_unicode_ci&parseTime=True&loc=%s&time_zone=%s",
		dbConfig.Username,
		dbConfig.Password,
		dbConfig.Host,
		dbConfig.Port,
		dbConfig.Hostname,
		dbConfig.Charset,
		location,
		mysqlTimeZone,
	)

	// 初始化GORM连接
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger:                                   logger.Default.LogMode(logger.Info),
		DisableForeignKeyConstraintWhenMigrating: true, // 迁移时禁用外键约束
		PrepareStmt:                              true, // 开启预编译提升性能
		SkipDefaultTransaction:                   true, // 禁用默认事务
		NowFunc:                                  func() time.Time { return utils.Now() },
	})
	if err != nil {
		return fmt.Errorf("[MySQL]连接失败：%w", err)
	}

	// 获取底层sql.DB连接池
	sqlDb, err := db.DB()
	if err != nil {
		return fmt.Errorf("[MySQL]连接池获取失败：%w", err)
	}

	// 配置连接池参数
	sqlDb.SetMaxIdleConns(dbConfig.MaxIdle) // 最大空闲连接数
	sqlDb.SetMaxOpenConns(dbConfig.MaxOpen) // 最大打开连接数
	sqlDb.SetConnMaxLifetime(time.Hour)     // 连接最大存活时间

	// 测试数据库连接
	if err := sqlDb.Ping(); err != nil {
		return fmt.Errorf("[MySQL]连接失败：%w", err)
	}

	Db = db
	global.Log.Info("[MySQL]连接成功")
	return nil
}
