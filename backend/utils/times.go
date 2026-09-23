package utils

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// HTime 是项目统一使用的时间类型，所有时间按中国标准时间处理。
type HTime struct {
	time.Time
}

const (
	// FormatTime 是接口和数据库展示使用的标准时间格式。
	FormatTime = "2006-01-02 15:04:05"
)

// BeijingLocation 是项目统一使用的中国时区。
var BeijingLocation = loadBeijingLocation()

func loadBeijingLocation() *time.Location {
	location, err := time.LoadLocation("Asia/Shanghai")
	if err == nil {
		return location
	}
	return time.FixedZone("CST", 8*60*60)
}

func init() {
	// 统一标准库和 GORM 默认时间函数的时区，避免依赖操作系统时区设置。
	time.Local = BeijingLocation
}

// Now 返回当前中国北京时间，供业务代码生成时间使用。
func Now() time.Time {
	return time.Now().In(BeijingLocation)
}

// parseTimeString 解析无时区时间和带时区时间。
func parseTimeString(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, nil
	}

	for _, layout := range []string{
		FormatTime,
		"2006-01-02T15:04:05",
		"2006-01-02T15:04:05.999999999",
	} {
		if parsed, err := time.ParseInLocation(layout, value, BeijingLocation); err == nil {
			return parsed, nil
		}
	}

	for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed.In(BeijingLocation), nil
		}
	}

	return time.Time{}, fmt.Errorf("时间格式无效: %s", value)
}

// MarshalJSON 将时间按中国北京时间序列化为统一格式。
func (t HTime) MarshalJSON() ([]byte, error) {
	if t.IsZero() {
		return []byte("null"), nil
	}
	return json.Marshal(t.In(BeijingLocation).Format(FormatTime))
}

// UnmarshalJSON 兼容无时区格式和 RFC3339 格式的时间输入。
func (t *HTime) UnmarshalJSON(data []byte) error {
	raw := strings.TrimSpace(string(data))
	if raw == "null" || raw == "" {
		t.Time = time.Time{}
		return nil
	}

	value := raw
	if strings.HasPrefix(raw, "\"") {
		if err := json.Unmarshal(data, &value); err != nil {
			return fmt.Errorf("时间格式无效: %s", raw)
		}
	}

	parsed, err := parseTimeString(value)
	if err != nil {
		return err
	}
	t.Time = parsed
	return nil
}

// Value 将时间按中国北京时间交给数据库驱动写入。
func (t HTime) Value() (driver.Value, error) {
	if t.IsZero() {
		return time.Time{}, nil
	}
	return t.In(BeijingLocation), nil
}

// Scan 将数据库返回的时间统一转换为中国北京时间。
func (t *HTime) Scan(value interface{}) error {
	switch value := value.(type) {
	case time.Time:
		t.Time = value.In(BeijingLocation)
	case []byte:
		parsed, err := parseTimeString(string(value))
		if err != nil {
			return err
		}
		t.Time = parsed
	case string:
		parsed, err := parseTimeString(value)
		if err != nil {
			return err
		}
		t.Time = parsed
	case nil:
		t.Time = time.Time{}
	default:
		return fmt.Errorf("不支持的类型: %T", value)
	}
	return nil
}

// String 返回中国北京时间的标准字符串。
func (t HTime) String() string {
	if t.IsZero() {
		return ""
	}
	return t.In(BeijingLocation).Format(FormatTime)
}
