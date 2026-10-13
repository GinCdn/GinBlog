# GinBlog Frontend

The frontend application of the GinBlog blogging system, built with **React 19 + TypeScript + Vite**. It bundles three interfaces in one codebase: the **public reading site**, the **user center**, and the **admin console**.

- Official website: [www.ginblog.cn](https://www.ginblog.cn)
- 中文文档: [README.md](./README.md)
- Backend service: [../backend](../backend)
- License: [GNU GPL v3.0](../LICENSE)

## Overview

GinBlog is a ready-to-deploy blogging and content-monetization system. It follows a decoupled architecture: the backend exposes JSON APIs only, while this frontend is a single-page application (SPA). In production the backend serves the build output, so **a single port is enough** to run the whole site.

The frontend implements the complete API contract of the backend, covering content authoring, categories and tags, comments, the user center, paid content with referral commissions, and site administration.

## Tech Stack

| Category | Choice |
| --- | --- |
| Framework | React 19 |
| Language | TypeScript 5.9 |
| Build tool | Vite 8 (Rolldown) |
| UI library | Ant Design 6 + Pro Components |
| State management | Zustand 5 |
| Routing | React Router 7 |
| HTTP client | Axios |
| Charts | ECharts 6 + echarts-for-react |
| Markdown | react-markdown + remark-gfm + rehype-raw + rehype-sanitize |
| Syntax highlighting | react-syntax-highlighter |
| Styling | Plain CSS (`src/styles/global.css`) + Sass |
| Dates | Day.js |

## Features

**Public site**

- Homepage: carousel, trending posts, latest posts, category and site-info sidebar
- Archive: category filtering, keyword search, pagination, article cards
- Article detail: Markdown rendering, code highlighting, table of contents with scroll-follow highlighting, related posts, previous/next navigation, likes and bookmarks
- Categories and tags, with slug-based category URLs
- Responsive layout for mobile devices

**User center**

- Registration, sign-in and password recovery with CAPTCHA protection
- Profile and avatar management
- Identity verification (real-name) flow
- Finance: balance top-up, order history, referral commissions and withdrawals
- My articles: in-browser Markdown editor with split-pane live preview, drafts and publishing, cover and SEO description settings

**Admin console**

- Dashboard with ECharts statistics and a regional distribution map
- Article, category and comment management (including moderation)
- User management and user details
- Site configuration, SMS configuration, carousel configuration, anti-abuse configuration
- Operation log queries

**Search engine optimization**

Because the SPA renders on the client, the project adds a systematic SEO layer so crawlers can still read the content without executing JavaScript:

| Capability | Description |
| --- | --- |
| Crawlable link graph | Article cards, archive lists, sidebar trending, related posts, previous/next links, navigation and category entries all render real `<a href>` elements instead of relying solely on `onClick` handlers |
| Static meta tags | `index.html` ships title / description / keywords / robots / Open Graph / Twitter Card / theme-color, injected with the real site values at build time |
| Structured data | Site-level `WebSite` + `Organization` JSON-LD; article pages additionally inject `Article` + `BreadcrumbList` |
| No-script fallback | A `<noscript>` block renders the site summary and real category links for crawlers that do not run JavaScript |
| Sitemap | A build step queries the public API and generates `sitemap.xml` containing every article and category |
| robots.txt | Generated at build time, declaring crawl rules and pointing to the sitemap |
| Domain agnostic | No domain is hard-coded in the source; absolute URLs are resolved from configuration at build time and corrected to the current origin at runtime |

**Performance**

- Route-level code splitting across the whole app (`React.lazy`)
- Article prefetching: the article request starts before the app mounts, in parallel with the site configuration request; hovering or focusing a card prefetches the body and preloads the route chunk
- Parallelized requests on the article page — the body renders first instead of waiting on a serial chain
- ECharts runtime split into multiple chunks so no single oversized script is produced

## Project Structure

```
frontend/
├── index.html                  HTML entry with SEO meta tags and placeholders
├── package.json                Dependencies and scripts
├── vite.config.ts              Vite config: aliases, dev proxy, chunking, SEO HTML plugin
├── tsconfig.json               TypeScript config
├── .env.example                Environment template (copy to .env)
├── public/                     Static assets (fonts, icons, ...)
├── scripts/
│   ├── seo-lib.mjs             Site metadata and domain resolution (shared by build and dev)
│   └── gen-seo.mjs             Generates sitemap.xml and robots.txt
└── src/
    ├── main.tsx                Application entry
    ├── App.tsx                 Route table with lazy loading
    ├── api/index.ts            Unified backend API client
    ├── components/             Shared components (header, footer, sidebar, Markdown renderer, ...)
    ├── composables/            Reusable logic (CAPTCHA, ...)
    ├── layouts/                Admin and user-center layouts
    ├── pages/
    │   ├── Home.tsx            Homepage
    │   ├── Articles.tsx        Article archive
    │   ├── ArticleDetail.tsx   Article detail
    │   ├── admin/              Admin pages
    │   ├── user/               User center pages
    │   └── shared/             Components shared across both ends
    ├── store/                  Global state (site config, user, admin)
    ├── styles/global.css       Global stylesheet
    ├── types/                  Type definitions
    └── utils/                  Utilities (request, auth, Markdown, prefetch, SEO, ...)
```

## Requirements

- Node.js 20 or later
- A reachable backend service (defaults to `http://127.0.0.1:8080`)

## Getting Started

### 1. Install dependencies

```bash
cd frontend
npm install
```

### 2. Start the dev server

```bash
npm run dev
```

The dev server listens on port `3000` and proxies `/api` to `http://127.0.0.1:8080`. If your backend runs elsewhere or on a different port, adjust `server.proxy` in `vite.config.ts`.

### 3. Build for production

```bash
npm run build
```

The pipeline is `tsc && vite build && node scripts/gen-seo.mjs` — type check, bundle, then generate the sitemap. Output goes to `dist/`.

### 4. Preview the build

```bash
npm run preview
```

## Environment Variables

The site URL, name and description are **never hard-coded**. They are injected from environment variables or from the backend site-configuration endpoint, so the same source tree produces correct metadata on any domain.

Copy the template and fill in what you need:

```bash
cp .env.example .env
```

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_SITE_URL` | Recommended | Site root URL; drives absolute links in the sitemap, robots and share cards |
| `VITE_API_BASE` | Optional | API base used at build time to fetch site info; defaults to `http://127.0.0.1:8080` |
| `VITE_SITE_NAME` | Optional | Site name; falls back to the value from the site-config API |
| `VITE_SITE_TITLE` | Optional | Homepage title |
| `VITE_SITE_SUBTITLE` | Optional | Site subtitle |
| `VITE_SITE_DESCRIPTION` | Optional | Site description |
| `VITE_SITE_KEYWORDS` | Optional | Site keywords |
| `VITE_SITE_LOGO` | Optional | Absolute URL of the site logo |
| `VITE_SITE_EMAIL` | Optional | Contact email |
| `VITE_BAIDU_VERIFICATION` | Optional | Verification token for Baidu Search Resource Platform |

**Resolution order**: `CLI arguments → environment variables / .env → backend site-config API → inferred from the logo URL → generic fallback`.

If the site URL still cannot be determined, the build script **skips sitemap generation** rather than emitting the wrong domain. `.env` is listed in `.gitignore` — never commit it.

## Deployment

The backend already serves static assets. Copy the build output into its `web/` directory:

```bash
cp -r frontend/dist/* backend/web/
```

Then start the backend and open `http://your-server:8080`. To bind a domain with HTTPS, put Nginx in front and reverse-proxy to port `8080`.

**About the sitemap**: `assets/sitemap.xml` in the build output is served statically by the backend, so you can submit `https://your-domain/assets/sitemap.xml` directly to Baidu, Google and other search consoles. To make `https://your-domain/robots.txt` reachable as well, add a single Nginx rule that serves `web/robots.txt` directly.

## Recommended Server Provider

This project runs in production, and deployment puts real demands on server stability and network quality. **Beihai Cloud** ([www.beihaiyun.com](https://www.beihaiyun.com)) is recommended — flexible configurations and ample bandwidth make it a good fit for small and mid-sized blogs running long term.

## Links

| Resource | URL |
| --- | --- |
| Official website | [www.ginblog.cn](https://www.ginblog.cn) |
| GitHub repository | [github.com/GinCdn/GinBlog](https://github.com/GinCdn/GinBlog) |
| Gitee repository | [gitee.com/bbos2004/GinBlog](https://gitee.com/bbos2004/GinBlog) |

## License

This project is licensed under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html) (GPL-3.0). See the [LICENSE](../LICENSE) file in the repository root for the full text.

You are free to use, modify and redistribute this project under the terms of that license. The main obligations are:

- Derivatives must remain licensed under GPL-3.0, and recipients must be given access to the complete corresponding source code.
- Existing copyright and license notices must be preserved in full.
- Modified source files must carry clear notices stating the changes and their dates.
- The software is provided "as is", without warranty of any kind, express or implied.

Copyright (C) 2026 GinBlog Project
