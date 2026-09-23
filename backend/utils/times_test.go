package utils

import (
	"encoding/json"
	"testing"
	"time"
)

func TestHTimeMarshalJSONUsesBeijingTime(t *testing.T) {
	value := HTime{Time: time.Date(2026, 8, 29, 15, 4, 5, 0, BeijingLocation)}
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("序列化时间失败: %v", err)
	}
	if string(data) != `"2026-08-29 15:04:05"` {
		t.Fatalf("时间序列化结果错误: %s", data)
	}
}

func TestHTimeUnmarshalPlainStringUsesBeijingTime(t *testing.T) {
	var value HTime
	if err := json.Unmarshal([]byte(`"2026-08-29 15:04:05"`), &value); err != nil {
		t.Fatalf("解析北京时间失败: %v", err)
	}
	if value.Format(FormatTime) != "2026-08-29 15:04:05" || value.Location() != BeijingLocation {
		t.Fatalf("解析后的时间不是北京时间: %v (%s)", value, value.Location())
	}
}

func TestHTimeUnmarshalRFC3339ConvertsToBeijingTime(t *testing.T) {
	var value HTime
	if err := json.Unmarshal([]byte(`"2026-08-29T07:04:05Z"`), &value); err != nil {
		t.Fatalf("解析RFC3339时间失败: %v", err)
	}
	if value.Format(FormatTime) != "2026-08-29 15:04:05" {
		t.Fatalf("RFC3339时间转换错误: %s", value.Format(FormatTime))
	}
}

func TestHTimeScanByteString(t *testing.T) {
	var value HTime
	if err := value.Scan([]byte("2026-08-29 15:04:05")); err != nil {
		t.Fatalf("扫描数据库时间失败: %v", err)
	}
	if value.String() != "2026-08-29 15:04:05" {
		t.Fatalf("数据库时间扫描结果错误: %s", value.String())
	}
}

func TestHTimeValueUsesBeijingTime(t *testing.T) {
	value := HTime{Time: time.Date(2026, 8, 29, 15, 4, 5, 0, time.UTC)}
	stored, err := value.Value()
	if err != nil {
		t.Fatalf("获取数据库值失败: %v", err)
	}
	storedTime, ok := stored.(time.Time)
	if !ok {
		t.Fatalf("数据库值类型错误: %T", stored)
	}
	if storedTime.Location() != BeijingLocation || storedTime.Format(FormatTime) != "2026-08-29 23:04:05" {
		t.Fatalf("数据库写入时间未转换为北京时间: %v", storedTime)
	}
}
