package core

import (
	"errors"
	"fmt"

	"gorm.io/gorm"
)

// ErrAccountAbsent 表示令牌对应的账号在数据库中已不存在。
var ErrAccountAbsent = errors.New("账号不存在或已被删除")

// ErrTokenRevoked 表示令牌版本与账号当前版本不一致，通常由修改用户名或密码触发。
var ErrTokenRevoked = errors.New("账号信息已变更，请重新登录")

// tableNamer 抽象模型到表名的映射，用于统一查询两类账号的令牌版本。
type tableNamer interface {
	TableName() string
}

// loadTokenVersion 查询指定账号当前的令牌版本号。
// 账号不存在时返回 ErrAccountAbsent，查询异常时返回带上下文的原始错误。
func loadTokenVersion(table tableNamer, id uint) (int, error) {
	if Db == nil {
		return 0, errors.New("数据库未初始化，无法校验令牌状态")
	}

	var row struct {
		TokenVersion int
	}
	err := Db.Table(table.TableName()).
		Select("token_version").
		Where("id = ?", id).
		Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, ErrAccountAbsent
	}
	if err != nil {
		return 0, fmt.Errorf("查询令牌版本号失败: %w", err)
	}
	return row.TokenVersion, nil
}

// verifyTokenVersion 校验令牌携带的版本号与账号当前版本号是否一致。
// 修改用户名或密码会自增账号版本号，使此前签发的全部令牌在下次请求时失效。
func verifyTokenVersion(table tableNamer, id uint, version int) error {
	current, err := loadTokenVersion(table, id)
	if err != nil {
		return err
	}
	if current != version {
		return ErrTokenRevoked
	}
	return nil
}
