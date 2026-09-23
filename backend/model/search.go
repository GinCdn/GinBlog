package model

import "ginblog/utils"

// TagSearch 标签搜索量统计模型
type TagSearch struct {
	ID           uint        `gorm:"primary_key;autoIncrement;comment:统计ID" json:"id"`
	TagID        uint        `gorm:"not null;uniqueIndex:idx_tag_id;comment:标签ID" json:"tagID"`
	SearchCount  int         `gorm:"default:0;comment:搜索次数" json:"searchCount"`
	LastSearchAt utils.HTime `gorm:"comment:最后搜索时间" json:"lastSearchAt"`
}

func (TagSearch) TableName() string {
	return "ginblog_tag_search"
}

// TagSearchStatisticReq 标签搜索量查询参数
type TagSearchStatisticReq struct {
	Page      int    `form:"page" json:"page" binding:"omitempty,min=1"`                                   // 页码（默认1）
	PageSize  int    `form:"page_size" json:"page_size" binding:"omitempty,max=100"`                       // 每页条数（默认20，最大100）
	SortBy    string `form:"sort_by" json:"sort_by" binding:"omitempty,oneof=search_count last_search_at"` // 排序字段（search_count/last_search_at）
	SortOrder string `form:"sort_order" json:"sort_order" binding:"omitempty,oneof=asc desc"`              // 排序方式（asc/desc，默认desc）
}

// TagSearchStatisticResp 标签搜索量响应结构
type TagSearchStatisticResp struct {
	TagName      string      `json:"tag_name"`       // 标签名称
	SearchCount  int         `json:"search_count"`   // 搜索次数（未搜索过为0）
	LastSearchAt utils.HTime `json:"last_search_at"` // 最后搜索时间（未搜索过为null）
}

type TagPageResponse struct {
	List      interface{} `json:"list"`       // 用 interface{} 支持任意列表类型
	Total     int64       `json:"total"`      // 总条数（数据库count返回int64）
	Page      int         `json:"page"`       // 当前页码
	PageSize  int         `json:"page_size"`  // 每页条数
	TotalPage int         `json:"total_page"` // 总页数（int类型）
}

// ProvinceAccess 省份访问量统计模型（按省份聚合）
type ProvinceAccess struct {
	ID           uint        `gorm:"primary_key;autoIncrement;comment:统计ID" json:"id"`
	Province     string      `gorm:"size:64;not null;uniqueIndex:idx_province;comment:省份（如：广东）" json:"province"`
	AccessCount  int         `gorm:"default:0;comment:该省份总访问量" json:"accessCount"`
	LastAccessAt utils.HTime `gorm:"comment:该省份最后访问时间" json:"lastAccessAt"`
}

func (ProvinceAccess) TableName() string {
	return "ginblog_province_access"
}

// IPAccess IP访问量统计模型（单IP粒度）
type IPAccess struct {
	ID           uint        `gorm:"primary_key;autoIncrement;comment:统计ID" json:"id"`
	IP           string      `gorm:"size:64;not null;uniqueIndex:idx_ip;comment:访问IP地址" json:"ip"`
	AccessCount  int         `gorm:"default:0;comment:该IP访问次数" json:"accessCount"`
	Region       string      `gorm:"size:128;comment:IP所属地区（如：广东-深圳）" json:"region"`
	LastAccessAt utils.HTime `gorm:"comment:该IP最后访问时间" json:"lastAccessAt"`
}

// 表名已指定，GORM自动映射到 ginblog_ip_access 表
func (IPAccess) TableName() string {
	return "ginblog_ip_access"
}

// ProvinceAccessStatisticReq 地区统计查询参数
type ProvinceAccessStatisticReq struct {
	Page      int    `form:"page" json:"page" binding:"omitempty,min=1"`                                   // 页码（默认1）
	PageSize  int    `form:"page_size" json:"page_size" binding:"omitempty,max=100"`                       // 每页条数（默认20，最大100）
	SortBy    string `form:"sort_by" json:"sort_by" binding:"omitempty,oneof=access_count last_access_at"` // 排序字段（访问量/最后访问时间）
	SortOrder string `form:"sort_order" json:"sort_order" binding:"omitempty,oneof=asc desc"`              // 排序方式（升序/降序）
}

// ProvinceAccessStatisticResp 地区统计响应结构
type ProvinceAccessStatisticResp struct {
	Province     string      `json:"province"`       // 省份名称（如：广东）
	AccessCount  int         `json:"access_count"`   // 该省份总访问量
	LastAccessAt utils.HTime `json:"last_access_at"` // 该省份最后访问时间
}

// ProvincePageResponse 地区统计分页响应
type ProvincePageResponse struct {
	List      []ProvinceAccessStatisticResp `json:"list"`       // 地区统计列表
	Total     int64                         `json:"total"`      // 总省份数
	Page      int                           `json:"page"`       // 当前页码
	PageSize  int                           `json:"page_size"`  // 每页条数
	TotalPage int                           `json:"total_page"` // 总页数
}
