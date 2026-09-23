# GinBlog Blog System

A decoupled front-end and back-end blog and content monetization system. The back end is built with Go and Gin to serve JSON APIs, while the front end is a React + TypeScript single-page application. It covers the full workflow of content authoring, categories and tags, comments, user center, paid reading with affiliate commission, and administration.

- Official website: [www.ginblog.cn](https://www.ginblog.cn)
- 中文文档: [README.md](./README.md)

## Introduction

GinBlog is designed for independent bloggers and small teams who need a deployable, feature-complete blog site. It provides both a public reading front end and an administration back end: the front end supports Markdown authoring, code highlighting, paid unlocking, likes, favorites and comments; the back end provides site configuration, content management, user management and analytics.

The project follows a decoupled architecture. The back end exposes JSON APIs only, and the front end is a single-page application. In production, the back end serves the compiled front-end assets, so a single exposed port is sufficient.

## Features

**Content Management**

- Article publishing and editing, with draft and published states, cover images and SEO descriptions
- Markdown rendering with syntax highlighting for code blocks
- Category and tag management, categories accessible by slug
- Image upload and media asset management
- Carousel and site navigation configuration

**Users and Permissions**

- User registration, login, personal center and profile maintenance
- Dual-role system for administrators and regular users, with APIs grouped by role
- Real-name verification workflow
- Graphics and SMS captcha for anti-abuse protection
- Token versioning: changing a username or password immediately invalidates all previously issued tokens

**Interaction and Monetization**

- Article comments, replies and moderation, with email notification
- Likes, favorites and sharing
- Paid article unlocking, with promotion codes and commission settlement
- Payment top-up and order callback handling

**Administration**

- Site configuration (title, keywords, ICP record, comment moderation switch, and more)
- User, article and comment management
- Statistics and chart dashboards

## Tech Stack

### Back End

| Category | Technology |
| --- | --- |
| Language | Go 1.25 |
| Web Framework | Gin 1.12 |
| ORM | GORM |
| Database | MySQL (utf8mb4) |
| Cache | Redis 8.x |
| Token | golang-jwt/jwt v5 |
| Logging | Logrus + file-rotatelogs |
| API Docs | Swagger (swaggo) |
| Captcha | base64Captcha |
| Content Filtering | bluemonday |
| Cloud Services | Alibaba Cloud SDK (SMS, real-name verification) |

### Front End

| Category | Technology |
| --- | --- |
| Framework | React 19 |
| Language | TypeScript 5.9 |
| Build Tool | Vite 8 |
| UI Library | Ant Design 6 + Pro Components |
| State Management | Zustand 5 |
| Routing | React Router 7 |
| HTTP Client | Axios |
| Charts | ECharts 6 |
| Rich Text Editor | TinyMCE 8 |
| Markdown | react-markdown + remark-gfm + rehype-raw + rehype-sanitize |
| Styling | Sass |

## Project Structure

```
GinBlog/
├── README.md                   Chinese documentation
├── README_EN.md                English documentation
├── backend/                    Back-end service (Go)
│   ├── main.go                 Entry point, includes database auto-migration
│   ├── config.example.yaml     Configuration template (copy to config.yaml)
│   ├── go.mod / go.sum         Go dependency manifest
│   ├── api/                    Business API layer, split by domain
│   ├── router/                 Route registration, grouped into public, admin and user
│   ├── middleware/             Middleware (CORS, auth, captcha, logging)
│   ├── controller/             Authorization pre-check
│   ├── core/                   Infrastructure (MySQL, Redis, JWT, logging)
│   ├── model/                  Data model definitions
│   ├── service/                Background services and scheduled tasks
│   ├── utils/                  Utilities (encryption, validation, time handling)
│   ├── result/                 Unified response structure
│   ├── constant/               Constants
│   ├── global/                 Global variables
│   ├── config/                 Configuration loading
│   ├── docs/                   Swagger API documentation
│   ├── pay/                    Payment related
│   └── web/                    Front-end build output (served by the back end in production)
└── frontend/                   Front-end application (React)
    ├── index.html              HTML entry
    ├── package.json            Dependencies and scripts
    ├── vite.config.ts          Vite configuration, including API proxy
    ├── tsconfig.json           TypeScript configuration
    ├── public/                 Static assets
    └── src/
        ├── main.tsx            Application entry
        ├── App.tsx             Route table
        ├── api/                API wrappers
        ├── pages/              Pages
        │   ├── Home.tsx        Home page
        │   ├── Articles.tsx    Article list
        │   ├── ArticleDetail.tsx  Article detail
        │   ├── admin/          Administration pages
        │   └── user/           User center pages
        ├── components/         Shared components
        ├── layouts/            Layout components
        ├── store/              State management
        ├── router/             Route configuration
        ├── types/              Type definitions
        ├── styles/             Global styles
        ├── utils/              Utilities
        └── composables/        Composable functions
```

## Requirements

- Go 1.25 or later
- Node.js 20 or later
- MySQL 5.7 or 8.0
- Redis 6 or later

## Deployment and Running

### 1. Prepare the Database

Create the database with the `utf8mb4` character set:

```sql
CREATE DATABASE ginblog DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
```

Tables are created automatically by the application on startup; no manual DDL is required.

### 2. Start the Back End

```bash
cd backend

# Generate the configuration file from the template
cp config.example.yaml config.yaml

# Edit config.yaml and fill in the database password, Redis password, token secrets, etc.
vim config.yaml

# Download dependencies and build
go mod download
go build -o ginblog

# Run
./ginblog
```

The service listens on port `8080` by default. The application is ready once the startup log reports successful database migration.

### 3. Start the Front End

Development mode:

```bash
cd frontend
npm install
npm run dev
```

The development server listens on port `3000` and proxies `/api` to `http://127.0.0.1:8080`.

Production build:

```bash
cd frontend
npm run build
```

The build output is written to `frontend/dist/`.

### 4. Production Deployment

The back end is already configured to serve static assets. Copy the front-end build output into the back-end `web/` directory so that the back end serves the whole site:

```bash
cp -r frontend/dist/* backend/web/
```

Start the back end and open `http://<server-address>:8080` to access the site. To bind a domain with HTTPS, put Nginx in front as a reverse proxy to port `8080`.

### 5. Configuration Reference

The configuration file is `backend/config.yaml`. Key options:

| Option | Description |
| --- | --- |
| `system.port` | Service listening port, default 8080 |
| `mysql.*` | MySQL connection settings |
| `redis.*` | Redis connection settings |
| `token.adminToken.secret` | Signing secret for administrator tokens; use a random string of at least 32 characters |
| `token.userToken.secret` | Signing secret for user tokens; same requirement as above |
| `upload.uploadDir` | Root directory for uploaded files; must be writable |
| `upload.uploadHost` | Public URL prefix for uploaded files |
| `auth.authCode` | System authorization code |

> Note: `config.yaml` contains database passwords and token signing secrets. It is excluded by `.gitignore` and must not be committed to version control. Only `config.example.yaml`, which contains no real credentials, is provided in this repository.

### 6. API Documentation

Swagger is integrated into the back end. Once the service is running, visit `/swagger/index.html` for the API reference.

## Recommended Server

This project has been running reliably in production, and deployment benefits from stable servers and good network quality. **Beihai Cloud (贝海云)** ([www.beihaiyun.com](https://www.beihaiyun.com)) is recommended for its flexible configurations and generous bandwidth, which suit small and medium-sized blog sites running long term.

## Notes

- The architecture is decoupled. The back end always returns HTTP 200, and business status is conveyed by the status code in the response body.
- For development, start with `backend/router/router.go` to understand API grouping, and `frontend/src/api/index.ts` to understand the front-end API wrappers.
- Before committing, make sure files containing credentials such as `config.yaml` are not staged for version control.
