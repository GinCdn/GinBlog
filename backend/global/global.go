package global

import (
	"context"

	"github.com/sirupsen/logrus"
)

// 全局共享配置
// @author 阿贵
var (
	Log *logrus.Logger
	Ctx = context.Background()
)
