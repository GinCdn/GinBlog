# GinBlog 前端

GinBlog 博客系统的前端应用，基于 **React 19 + TypeScript + Vite** 构建，同时包含**前台阅读端**、**用户中心**与**后台管理端**三部分界面。

- 官方网站：[www.ginblog.cn](https://www.ginblog.cn)
- English documentation: [README_EN.md](./README_EN.md)
- 后端服务：[../backend](../backend)
- 开源许可：[GNU GPL v3.0](../LICENSE)

## 项目简介

GinBlog 是一套可直接部署的博客与内容变现系统，采用前后端分离架构：后端只输出 JSON 接口，本前端为单页应用（SPA），在生产环境下由后端托管构建产物，**只需暴露一个端口**即可完成整站部署。

前端在接口契约上完全对接后端，覆盖内容创作、分类标签、评论互动、用户中心、付费阅读与推广返佣、后台管理等完整链路。

## 技术栈

| 类别 | 技术选型 |
| --- | --- |
| 框架 | React 19 |
| 语言 | TypeScript 5.9 |
| 构建工具 | Vite 8（Rolldown） |
| UI 组件库 | Ant Design 6 + Pro Components |
| 状态管理 | Zustand 5 |
| 路由 | React Router 7 |
| HTTP 客户端 | Axios |
| 图表 | ECharts 6 + echarts-for-react |
| Markdown | react-markdown + remark-gfm + rehype-raw + rehype-sanitize |
| 代码高亮 | react-syntax-highlighter |
| 样式 | 原生 CSS（`src/styles/global.css`）+ Sass |
| 时间处理 | Day.js |

## 功能特性

**前台阅读端**

- 首页：轮播图、热门文章、最新文章、分类与站点信息侧栏
- 文章归档：分类筛选、关键词搜索、分页浏览、列表卡片
- 文章详情：Markdown 渲染、代码块语法高亮、目录导航（滚动跟随高亮）、相关文章、上下篇跳转、点赞与收藏
- 标签与分类：分类支持缩略名（slug）直接访问
- 移动端响应式布局

**用户中心**

- 注册、登录、找回密码，图形验证码防刷
- 个人资料维护与头像管理
- 实名认证流程
- 财务中心：余额充值、订单记录、推广佣金与提现
- 我的文章：在线 Markdown 编辑（分屏实时预览）、草稿与发布、封面与 SEO 描述设置

**后台管理端**

- 数据看板：基于 ECharts 的统计图表与地域分布地图
- 文章管理、分类管理、评论管理（含审核）
- 用户管理与用户详情
- 站点配置、短信配置、轮播配置、防刷配置
- 操作记录查询

**搜索引擎优化（SEO）**

本项目针对 SSR 缺失的纯前端场景做了系统性补强，让搜索引擎爬虫在不执行 JavaScript 的情况下依然能抓取内容：

| 能力 | 说明 |
| --- | --- |
| 可爬取的链接图 | 站内文章卡片、归档列表、侧栏热门、相关文章、上下篇、导航与分类入口全部输出真实 `<a href>`，而非仅靠 `onClick` 跳转 |
| 静态元信息 | `index.html` 内置 title / description / keywords / robots / Open Graph / Twitter Card / theme-color，构建时按站点真实信息注入 |
| 结构化数据 | 站点级 `WebSite` + `Organization` JSON-LD；文章页另行注入 `Article` + `BreadcrumbList` |
| 无脚本兜底 | `<noscript>` 中输出站点简介与真实分类入口列表，供不执行 JS 的爬虫抓取 |
| 站点地图 | 构建时抓取公开接口，自动生成含全部文章与分类的 `sitemap.xml` |
| robots.txt | 构建时生成，声明抓取规则并指向站点地图 |
| 域名自适应 | 源码中不写死任何域名，构建期按配置解析、运行期按当前访问域名自动纠正绝对地址 |

**性能优化**

- 全站路由级懒加载（`React.lazy`），按页面拆分产物
- 文章正文预取：页面挂载前即发起请求，并与站点配置并行；卡片悬停/聚焦时预取正文并预热路由分包
- 文章详情页请求并行化，正文先渲染，避免串行等待
- ECharts 运行时按模块拆分为多个分包，避免单个超大脚本

## 目录结构

```
frontend/
├── index.html                  页面入口，含 SEO 元信息与占位符
├── package.json                依赖与脚本
├── vite.config.ts              Vite 配置：路径别名、开发代理、构建分包、SEO 注入插件
├── tsconfig.json               TypeScript 配置
├── .env.example                环境变量模板（复制为 .env 后填写）
├── public/                     静态资源（字体、图标等）
├── scripts/
│   ├── seo-lib.mjs             站点信息与域名解析（构建期与开发期共用）
│   └── gen-seo.mjs             生成 sitemap.xml 与 robots.txt
└── src/
    ├── main.tsx                应用入口
    ├── App.tsx                 路由表与路由级懒加载
    ├── api/index.ts            后端接口统一封装
    ├── components/             通用组件（页头、页脚、侧栏、Markdown 渲染等）
    ├── composables/            组合式逻辑（验证码等）
    ├── layouts/                后台与用户中心布局
    ├── pages/
    │   ├── Home.tsx            首页
    │   ├── Articles.tsx        文章归档
    │   ├── ArticleDetail.tsx   文章详情
    │   ├── admin/              后台管理页面
    │   ├── user/               用户中心页面
    │   └── shared/             跨端复用组件
    ├── store/                  全局状态（站点配置、用户、管理员）
    ├── styles/global.css       全站样式
    ├── types/                  类型定义
    └── utils/                  工具函数（请求、鉴权、Markdown、预取、SEO 等）
```

## 环境要求

- Node.js 20 或更高版本
- 一个可访问的后端服务（默认 `http://127.0.0.1:8080`）

## 快速开始

### 一、安装依赖

```bash
cd frontend
npm install
```

### 二、启动开发服务器

```bash
npm run dev
```

开发服务器默认监听 `3000` 端口，并已将 `/api` 代理至 `http://127.0.0.1:8080`。若后端不在本机或端口不同，请修改 `vite.config.ts` 中的 `server.proxy`。

### 三、生产构建

```bash
npm run build
```

构建流程为 `tsc && vite build && node scripts/gen-seo.mjs`，即先做类型检查，再打包，最后生成站点地图。产物输出至 `dist/`。

### 四、预览构建产物

```bash
npm run preview
```

## 环境变量配置

站点地址、名称、简介等**不写死在源码中**，通过环境变量或站点配置接口注入，因此同一份源码部署到任意域名都能产出正确的元信息。

复制模板后按需填写：

```bash
cp .env.example .env
```

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `VITE_SITE_URL` | 建议填写 | 站点根地址，决定站点地图、robots 与分享卡片中的绝对链接 |
| `VITE_API_BASE` | 按需 | 构建期抓取站点信息的接口地址，默认 `http://127.0.0.1:8080` |
| `VITE_SITE_NAME` | 可选 | 站点名称，留空则取站点配置接口的真实值 |
| `VITE_SITE_TITLE` | 可选 | 首页标题 |
| `VITE_SITE_SUBTITLE` | 可选 | 站点副标题 |
| `VITE_SITE_DESCRIPTION` | 可选 | 站点描述 |
| `VITE_SITE_KEYWORDS` | 可选 | 站点关键词 |
| `VITE_SITE_LOGO` | 可选 | 站点 Logo 绝对地址 |
| `VITE_SITE_EMAIL` | 可选 | 联系邮箱 |
| `VITE_BAIDU_VERIFICATION` | 可选 | 百度搜索资源平台的站点验证串 |

**解析优先级**：`命令行参数 → 环境变量 / .env → 后端站点配置接口 → 从 Logo 地址反推 → 通用兜底`。

若最终仍无法确定站点地址，构建脚本会**跳过站点地图生成**，而不是写入错误的域名。`.env` 已被 `.gitignore` 忽略，请勿将其提交至版本库。

## 部署

后端已启用静态资源托管，将构建产物拷贝至后端 `web/` 目录即可由后端统一提供服务：

```bash
cp -r frontend/dist/* backend/web/
```

随后启动后端，访问 `http://服务器地址:8080` 即可打开站点。如需绑定域名与 HTTPS，建议通过 Nginx 反向代理至 `8080` 端口。

**关于站点地图**：产物中的 `assets/sitemap.xml` 由后端静态托管，可直接访问 `https://你的域名/assets/sitemap.xml` 并提交至百度、Google 等搜索资源平台。若要让 `https://你的域名/robots.txt` 也能访问，只需在 Nginx 中配置一条直接命中 `web/robots.txt` 的规则。

## 服务器推荐

本项目已在生产环境稳定运行，部署时对服务器稳定性与网络质量有一定要求。推荐使用 **贝海云**（[www.beihaiyun.com](https://www.beihaiyun.com)）云服务器，其配置灵活、带宽充足，适合中小型博客站点长期运行。

## 相关链接

| 项目 | 地址 |
| --- | --- |
| 官方网站 | [www.ginblog.cn](https://www.ginblog.cn) |
| GitHub 仓库 | [github.com/GinCdn/GinBlog](https://github.com/GinCdn/GinBlog) |
| Gitee 仓库 | [gitee.com/bbos2004/GinBlog](https://gitee.com/bbos2004/GinBlog) |

## 开源许可

本项目采用 [GNU 通用公共许可证第 3 版](https://www.gnu.org/licenses/gpl-3.0.html)（GPL-3.0）授权，完整条款见仓库根目录的 [LICENSE](../LICENSE) 文件。

在遵守该许可证条款的前提下，你可以自由使用、修改和分发本项目，主要义务包括：

- 分发本项目或其衍生作品时，须继续以 GPL-3.0 授权，并向接收者提供完整可获取的源代码。
- 须完整保留原有的版权声明与许可证声明，不得移除或修改。
- 若修改了源代码，须在相关文件中明确标注改动内容与改动日期。
- 本软件按现状提供，不附带任何明示或默示的担保。

Copyright (C) 2026 GinBlog Project
