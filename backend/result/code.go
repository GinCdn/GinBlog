package result

// 主状态码（直接映射标准HTTP状态码）
const (
	StatusSuccess   = 200 // 成功
	BadRequest      = 400 // 参数错误
	Unauthorized    = 401 // 未授权
	Forbidden       = 403 // 权限不足
	NotFound        = 404 // 资源不存在
	Conflict        = 409 // 资源冲突
	TooManyRequests = 429 // 请求过于频繁
	InternalError   = 500 // 服务器错误
	BadGateway      = 502 // CDN节点/网关错误
	ServiceUnavail  = 503 // 服务不可用
)

// 子码：同一主状态码下的细分场景
type SubCode string

const (
	SubDefault SubCode = "" // 默认
	// 400子场景
	SubMissingParam  SubCode = "missing_param"  // 缺少参数
	SubInvalidFormat SubCode = "invalid_format" // 格式错误
	// 401子场景
	SubNoAuthInfo   SubCode = "no_auth"        // 无授权信息
	SubInvalidToken SubCode = "invalid_token"  // Token无效
	SubTokenExpired SubCode = "expired_token"  // Token过期
	SubPwdError     SubCode = "pwd_error"      // 密码错误
	HashPwdError    SubCode = "hash_pwd_error" // 密码加密失败
	// 403子场景
	NoPermission SubCode = "no_permission"
	// 404子场景
	SubUserNotFound   SubCode = "user_not_found"   // 用户不存在
	SubDomainNotFound SubCode = "domain_not_found" // 域名不存在
	// 500子场景
	SubDbError      SubCode = "db_error" // 数据库错误
	UserDataError   SubCode = "user_data_error"
	CreateDateError SubCode = "create_date_error"
	InfoDateError   SubCode = "info_date_error"
	QueryError      SubCode = "query_error"
	// 502子场景（CDN核心）
	SubNodeOffline   SubCode = "node_offline" // 节点离线
	SubUpstreamError SubCode = "upstream_err" // 源站错误
	// 503子场景
	UpdateError SubCode = "update_error" // 更新失败
	DeleteError SubCode = "delete_error"
)

// 消息映射：直接通过函数内联初始化，减少全局变量
var msgMap = map[int]map[SubCode]string{
	StatusSuccess: {
		SubDefault: "成功",
	},
	BadRequest: {
		SubDefault:       "参数错误",
		SubMissingParam:  "缺少必填参数",
		SubInvalidFormat: "参数格式无效",
	},
	Unauthorized: {
		SubDefault:      "未授权访问",
		SubNoAuthInfo:   "请求头Authorization格式错误",
		SubInvalidToken: "Token无效",
		SubTokenExpired: "Token已过期",
		SubPwdError:     "密码错误",
		HashPwdError:    "密码加密失败",
	},
	TooManyRequests: {
		SubDefault: "请求过于频繁，请稍后再试",
	},
	NotFound: {
		SubDefault:        "资源不存在",
		SubUserNotFound:   "用户不存在",
		SubDomainNotFound: "加速域名不存在",
	},
	InternalError: {
		SubDefault:      "服务器内部错误",
		SubDbError:      "数据库操作失败",
		UserDataError:   "用户信息获取失败",
		CreateDateError: "数据写入失败",
		InfoDateError:   "获取失败",
		QueryError:      "查询失败",
	},
	BadGateway: {
		SubDefault:       "CDN节点异常",
		SubNodeOffline:   "节点离线",
		SubUpstreamError: "源站连接失败",
	},
	ServiceUnavail: {
		SubDefault:  "服务不可用",
		UpdateError: "数据更新失败",
		DeleteError: "删除失败",
	},
	Forbidden: {
		NoPermission: "权限不足",
	},
}

// GetMsg 获取消息（合并主码+子码逻辑，简化调用）
func GetMsg(code int, subCode SubCode) string {
	if subMap, ok := msgMap[code]; ok {
		return subMap[subCode] // 子码不存在时自动返回空，触发默认处理
	}
	return "未知错误"
}
