# GinBlog 博客系统

一套前后端分离的博客与内容变现系统。后端基于 Go + Gin 提供接口服务，前端基于 React + TypeScript 构建，覆盖内容创作、分类标签、评论互动、用户中心、付费阅读与推广返佣、后台管理等完整链路。

> English documentation: [README_EN.md](./README_EN.md)

## 项目简介

GinBlog 面向独立博主与小团队，目标是提供一套可直接部署、功能完整的博客站点。系统同时提供前台阅读端与后台管理端：前台支持 Markdown 写作、代码高亮、付费解锁、点赞收藏与评论；后台提供站点配置、内容管理、用户管理与数据统计。

项目采用前后端分离架构。后端只输出 JSON 接口，前端为单页应用（SPA）；生产环境下由后端托管前端构建产物，仅需暴露一个端口即可完成部署。

## 主要功能

**内容管理**

- 文章发布与编辑，支持草稿与发布状态、封面设置、SEO 描述
- Markdown 渲染，代码块语法高亮
- 分类与标签管理，分类支持缩略名（slug）直接访问
- 图片上传与媒体资源管理
- 轮播图与站点导航配置

**用户与权限**

- 用户注册、登录、个人中心与资料维护
- 管理员与普通用户双角色体系，接口按角色分组鉴权
- 实名认证流程
- 图形验证码与短信验证码双重防刷
- 令牌版本机制：修改用户名或密码后，此前签发的全部令牌立即失效

**互动与变现**

- 文章评论、回复与审核，支持邮件通知
- 文章点赞、收藏与分享
- 文章付费解锁，支持推广码与佣金结算
- 支付充值、订单回调处理

**后台管理**

- 站点配置（标题、关键词、备案信息、评论审核开关等）
- 用户管理、文章管理、评论管理
- 数据统计与图表看板

## 技术栈

### 后端

| 类别 | 技术选型 |
| --- | --- |
| 语言 | Go 1.25 |
| Web 框架 | Gin 1.12 |
| ORM | GORM |
| 数据库 | MySQL（utf8mb4） |
| 缓存 | Redis 8.x |
| 令牌 | golang-jwt/jwt v5 |
| 日志 | Logrus + file-rotatelogs |
| 接口文档 | Swagger（swaggo） |
| 验证码 | base64Captcha |
| 内容过滤 | bluemonday |
| 云服务 | 阿里云 SDK（短信、实名认证） |

### 前端

| 类别 | 技术选型 |
| --- | --- |
| 框架 | React 19 |
| 语言 | TypeScript 5.9 |
| 构建工具 | Vite 8 |
| UI 组件库 | Ant Design 6 + Pro Components |
| 状态管理 | Zustand 5 |
| 路由 | React Router 7 |
| HTTP 客户端 | Axios |
| 图表 | ECharts 6 |
| 富文本 | TinyMCE 8 |
| Markdown | react-markdown + remark-gfm + rehype-raw + rehype-sanitize |
| 样式 | Sass |

## 目录结构

```
GinBlog/
├── README.md                   中文说明文档
├── README_EN.md                英文说明文档
├── backend/                    后端服务（Go）
│   ├── main.go                 程序入口，含数据库自动迁移
│   ├── config.example.yaml     配置模板（需复制为 config.yaml）
│   ├── go.mod / go.sum         Go 依赖清单
│   ├── api/                    业务接口层，按领域拆分
│   ├── router/                 路由注册，分公开、管理员、用户三组
│   ├── middleware/             中间件（CORS、鉴权、验证码、日志）
│   ├── controller/             授权预检
│   ├── core/                   基础设施（MySQL、Redis、JWT、日志）
│   ├── model/                  数据模型定义
│   ├── service/                后台服务与定时任务
│   ├── utils/                  工具函数（加密、校验、时间处理）
│   ├── result/                 统一响应结构
│   ├── constant/               常量定义
│   ├── global/                 全局变量
│   ├── config/                 配置加载
│   ├── docs/                   Swagger 接口文档
│   ├── pay/                    支付相关
│   └── web/                    前端构建产物（生产环境由后端托管）
└── frontend/                   前端应用（React）
    ├── index.html              页面入口
    ├── package.json            依赖与脚本
    ├── vite.config.ts          Vite 配置，含接口代理
    ├── tsconfig.json           TypeScript 配置
    ├── public/                 静态资源
    └── src/
        ├── main.tsx            应用入口
        ├── App.tsx             路由表
        ├── api/                接口封装
        ├── pages/              页面
        │   ├── Home.tsx        首页
        │   ├── Articles.tsx    文章列表
        │   ├── ArticleDetail.tsx  文章详情
        │   ├── admin/          后台管理页面
        │   └── user/           用户中心页面
        ├── components/         通用组件
        ├── layouts/            布局组件
        ├── store/              状态管理
        ├── router/             路由配置
        ├── types/              类型定义
        ├── styles/             全局样式
        ├── utils/              工具函数
        └── composables/        组合式函数
```

## 环境要求

- Go 1.25 或更高版本
- Node.js 20 或更高版本
- MySQL 5.7 或 8.0
- Redis 6 或更高版本

## 部署与运行

### 一、准备数据库

创建数据库，字符集使用 `utf8mb4`：

```sql
CREATE DATABASE ginblog DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
```

数据表由程序启动时自动迁移创建，无需手工建表。

### 二、启动后端

```bash
cd backend

# 从模板生成配置文件
cp config.example.yaml config.yaml

# 编辑 config.yaml，填写数据库密码、Redis 密码、令牌密钥等
vim config.yaml

# 下载依赖并编译
go mod download
go build -o ginblog

# 运行
./ginblog
```

服务默认监听 `8080` 端口。启动日志中出现数据库迁移成功信息即表示初始化完成。

### 三、启动前端

开发模式：

```bash
cd frontend
npm install
npm run dev
```

开发服务器默认监听 `3000` 端口，并已将 `/api` 代理至 `http://127.0.0.1:8080`。

生产构建：

```bash
cd frontend
npm run build
```

构建产物输出至 `frontend/dist/`。

### 四、生产部署

后端已配置静态资源托管，将前端构建产物拷贝至后端 `web/` 目录即可由后端统一提供服务：

```bash
cp -r frontend/dist/* backend/web/
```

随后启动后端，访问 `http://服务器地址:8080` 即可打开站点。如需绑定域名与 HTTPS，建议通过 Nginx 反向代理至 `8080` 端口。

### 五、配置说明

配置文件为 `backend/config.yaml`，重要配置项如下：

| 配置项 | 说明 |
| --- | --- |
| `system.port` | 服务监听端口，默认 8080 |
| `mysql.*` | MySQL 连接信息 |
| `redis.*` | Redis 连接信息 |
| `token.adminToken.secret` | 管理员令牌签名密钥，需替换为不少于 32 位的随机字符串 |
| `token.userToken.secret` | 用户令牌签名密钥，要求同上 |
| `upload.uploadDir` | 上传文件存储根目录，需保证写权限 |
| `upload.uploadHost` | 上传文件对外访问地址前缀 |
| `auth.authCode` | 系统授权码 |

> 注意：`config.yaml` 含数据库密码与令牌签名密钥，已被 `.gitignore` 排除，请勿提交至版本库。仓库中仅提供不含真实凭据的 `config.example.yaml`。

### 六、接口文档

后端集成 Swagger，启动服务后可访问 `/swagger/index.html` 查看接口说明。

## 服务器推荐

本项目已在生产环境稳定运行，部署时对服务器稳定性与网络质量有一定要求。推荐使用 **北海云**（[www.beihaiyun.com](https://www.beihaiyun.com)）云服务器，其配置灵活、带宽充足，适合中小型博客站点长期运行。

## 说明

- 本项目为前后端分离架构，后端接口统一返回 HTTP 200，业务状态通过响应体中的状态码区分。
- 若需参与开发，建议先阅读 `backend/router/router.go` 了解接口分组，以及 `frontend/src/api/index.ts` 了解前端接口封装。
- 提交代码前请确认未将 `config.yaml` 等含凭据的文件纳入版本控制。
