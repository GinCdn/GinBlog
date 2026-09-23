import { useEffect, useMemo, useState } from 'react'
import CodeHighlighter from '@/components/CodeHighlighter'
import { ApiOutlined, ArrowLeftOutlined, CopyOutlined, LoginOutlined } from '@ant-design/icons'
import { Button, Descriptions, Empty, Image, Skeleton, Tabs, Typography, message } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { publicApi } from '@/api'
import { useAppStore } from '@/store'
import type { App, AppEndpoint } from '@/types'
import { isAuthenticated } from '@/utils/auth'

type RequestParams = Record<string, string>
type CodeLanguage = 'go' | 'csharp' | 'php' | 'java' | 'python' | 'bash'
type CodeSample = { key: CodeLanguage; label: string; language: CodeLanguage; code: string }

const defaultRequestBody: RequestParams = { real_name: '', id_card: '', alipay_account: '' }

/** 解析后台保存的请求示例，以兼容 JSON 和 key=value 格式。 */
function parseRequestExample(example?: string): RequestParams {
  const value = example?.trim()
  if (!value) return { ...defaultRequestBody }
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed).map(([key, item]) => [key, item == null ? '' : String(item)]))
    }
  } catch {
    // 兼容旧接口文档保存的 key=value 请求示例。
  }
  const result: RequestParams = {}
  value.split(/\r?\n|&/).forEach((line) => {
    const separator = line.indexOf('=')
    if (separator < 1) return
    const key = line.slice(0, separator).trim()
    if (key) result[key] = line.slice(separator + 1).trim()
  })
  return Object.keys(result).length ? result : { ...defaultRequestBody }
}

/** 格式化接口返回样例。 */
function formatJson(value?: string) {
  if (!value?.trim()) return '暂无文档内容'
  try { return JSON.stringify(JSON.parse(value), null, 2) } catch { return value }
}

/** 转义 cURL 单引号参数。 */
function shellQuote(value: string) {
  return value.replace(/'/g, "'\\''")
}

/** 根据接口定义生成多语言请求示例。 */
function buildRequestSamples(endpointUrl: string, method: string, params: RequestParams): CodeSample[] {
  const requestMethod = method.toUpperCase()
  const entries = Object.entries(params)
  const encodedBody = new URLSearchParams(entries).toString()
  const requestUrl = requestMethod === 'GET' && encodedBody
    ? `${endpointUrl}${endpointUrl.includes('?') ? '&' : '?'}${encodedBody}`
    : endpointUrl
  const goFields = entries.length ? entries.map(([key, value]) => `    form.Set(${JSON.stringify(key)}, ${JSON.stringify(value)})`).join('\n') : '    // 无请求参数'
  const phpFields = entries.length ? entries.map(([key, value]) => `    ${JSON.stringify(key)} => ${JSON.stringify(value)}`).join(',\n') : '    // 无请求参数'
  const pythonFields = entries.length ? entries.map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(',\n') : '    # 无请求参数'
  const curlFields = entries.length ? entries.map(([key, value]) => `  --data-urlencode '${shellQuote(`${key}=${value}`)}'`).join(' \\\n') : ''
  const javaFields = entries.length ? entries.map(([key, value]) => `        form.append(${JSON.stringify(key)}).append("=").append(URLEncoder.encode(${JSON.stringify(value)}, StandardCharsets.UTF_8)).append("&");`).join('\n') : '        // 无请求参数'
  const csharpFields = entries.length ? entries.map(([key, value]) => `            [${JSON.stringify(key)}] = ${JSON.stringify(value)},`).join('\n') : '            // 无请求参数'
  const goImports = requestMethod === 'GET' ? '    "fmt"\n    "io"\n    "net/http"' : '    "fmt"\n    "io"\n    "net/http"\n    "net/url"\n    "strings"'
  const goSetup = requestMethod === 'GET' ? '    // GET 参数已拼接至请求地址' : `    form := url.Values{}\n${goFields}`
  const goBody = requestMethod === 'GET' ? 'nil' : 'strings.NewReader(form.Encode())'
  const phpBody = requestMethod === 'GET' ? '' : 'curl_setopt($curl, CURLOPT_POSTFIELDS, http_build_query($data));'
  const pythonBody = requestMethod === 'GET' ? '' : ', data=data'
  const csharpBody = requestMethod === 'GET' ? '' : '        request.Content = new FormUrlEncodedContent(values);'
  const curlBody = requestMethod === 'GET' || !curlFields ? '' : ` \\\n${curlFields}`

  return [
    { key: 'go', label: 'Go', language: 'go', code: `package main

import (
${goImports}
)

func main() {
${goSetup}

    req, err := http.NewRequest(${JSON.stringify(requestMethod)}, ${JSON.stringify(requestUrl)}, ${goBody})
    if err != nil { panic(err) }
    req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
    req.Header.Set("X-App-Key", "你的AppKey")
    req.Header.Set("X-App-Secret", "你的AppSecret")

    resp, err := http.DefaultClient.Do(req)
    if err != nil { panic(err) }
    defer resp.Body.Close()
    body, _ := io.ReadAll(resp.Body)
    fmt.Println(string(body))
}` },
    { key: 'csharp', label: 'C#', language: 'csharp', code: `using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

class Program {
    static async Task Main() {
        var values = new Dictionary<string, string> {
${csharpFields}
        };

        using var client = new HttpClient();
        using var request = new HttpRequestMessage(new HttpMethod(${JSON.stringify(requestMethod)}), ${JSON.stringify(requestUrl)});
        request.Headers.Add("X-App-Key", "你的AppKey");
        request.Headers.Add("X-App-Secret", "你的AppSecret");
${csharpBody}
        using var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();
        Console.WriteLine(await response.Content.ReadAsStringAsync());
    }
}` },
    { key: 'php', label: 'PHP', language: 'php', code: `<?php
$url = ${JSON.stringify(requestUrl)};
$data = [
${phpFields}
];

$curl = curl_init();
curl_setopt($curl, CURLOPT_URL, $url);
curl_setopt($curl, CURLOPT_CUSTOMREQUEST, ${JSON.stringify(requestMethod)});
curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
curl_setopt($curl, CURLOPT_HTTPHEADER, [
    'Content-Type: application/x-www-form-urlencoded',
    'X-App-Key: 你的AppKey',
    'X-App-Secret: 你的AppSecret',
]);
${phpBody}
$response = curl_exec($curl);
if ($response === false) { throw new Exception(curl_error($curl)); }
curl_close($curl);
echo $response;` },
    { key: 'java', label: 'Java', language: 'java', code: `import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

public class Main {
    public static void main(String[] args) throws Exception {
        StringBuilder form = new StringBuilder();
${javaFields}
        HttpRequest.Builder builder = HttpRequest.newBuilder()
            .uri(URI.create(${JSON.stringify(requestUrl)}))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("X-App-Key", "你的AppKey")
            .header("X-App-Secret", "你的AppSecret");
        HttpRequest request = builder.method(${JSON.stringify(requestMethod)}, ${requestMethod === 'GET' ? 'HttpRequest.BodyPublishers.noBody()' : 'HttpRequest.BodyPublishers.ofString(form.toString())'}).build();
        HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
        System.out.println(response.body());
    }
}` },
    { key: 'python', label: 'Python', language: 'python', code: `import requests

url = ${JSON.stringify(requestUrl)}
headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    "X-App-Key": "你的AppKey",
    "X-App-Secret": "你的AppSecret",
}
data = {
${pythonFields}
}
response = requests.request(${JSON.stringify(requestMethod)}, url, headers=headers${pythonBody}, timeout=15)
response.raise_for_status()
print(response.json())` },
    { key: 'bash', label: 'cURL', language: 'bash', code: `curl -X ${requestMethod} '${shellQuote(requestUrl)}' \\
  -H 'Content-Type: application/x-www-form-urlencoded' \\
  -H 'X-App-Key: 你的AppKey' \\
  -H 'X-App-Secret: 你的AppSecret'${curlBody}` },
  ]
}

/** 渲染带语法高亮和复制按钮的代码示例。 */
function ApiCodeSample({ code, language }: { code: string; language: CodeLanguage }) {
  const copy = async () => {
    await navigator.clipboard.writeText(code)
    message.success('代码已复制')
  }
  return <div className="api-code-sample">
    <div className="api-code-sample-toolbar">
      <Typography.Text type="secondary">AppKey 和 AppSecret 请仅保存在服务端。</Typography.Text>
      <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => void copy()}>复制</Button>
    </div>
    <CodeHighlighter
      language={language}
      showLineNumbers
      wrapLongLines={false}
      lineNumberStyle={{ color: '#98a2b3', minWidth: '3em', paddingRight: '16px', userSelect: 'none' }}
      customStyle={{ margin: 0, padding: '14px 0', background: '#f8fafc', fontSize: '13px', lineHeight: 1.7, overflowX: 'auto' }}
    >
      {code}
    </CodeHighlighter>
  </div>
}

/** 公开应用文档页，仅展示文档，不提供真实调试和密钥读取能力。 */
export default function AppDocs() {
  const navigate = useNavigate()
  const { id } = useParams()
  const siteConfig = useAppStore((state) => state.siteConfig)
  const appId = Number(id)
  const [app, setApp] = useState<App>()
  const [endpoints, setEndpoints] = useState<AppEndpoint[]>([])
  const [selectedEndpoint, setSelectedEndpoint] = useState<AppEndpoint>()
  const [loading, setLoading] = useState(true)
  const systemName = siteConfig?.title?.trim() || 'GinBlog'
  const logo = siteConfig?.logo?.trim()
  const userEntry = isAuthenticated('user') ? '/user/apps' : '/user/login'

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!Number.isInteger(appId) || appId < 1) {
        if (active) setLoading(false)
        return
      }
      try {
        const [appResponse, endpointResponse] = await Promise.all([
          publicApi.getPublicApps(),
          publicApi.getPublicAppEndpoints(appId),
        ])
        if (!active) return
        const application = (appResponse.data || []).find((item) => item.id === appId)
        const rows = endpointResponse.data || []
        setApp(application)
        setEndpoints(rows)
        setSelectedEndpoint(rows[0])
      } catch {
        if (!active) return
        setApp(undefined)
        setEndpoints([])
        setSelectedEndpoint(undefined)
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [appId])

  useEffect(() => {
    document.title = app ? `${app.name} - 接口文档` : `${systemName} - 接口文档`
  }, [app, systemName])

  const endpointUrl = useMemo(() => (
    app?.slug && selectedEndpoint ? `${window.location.origin}/api/open/${app.slug}${selectedEndpoint.path}` : '-'
  ), [app?.slug, selectedEndpoint])
  const requestParams = useMemo(() => parseRequestExample(selectedEndpoint?.requestBody), [selectedEndpoint?.requestBody])
  const endpointTabs = selectedEndpoint ? [
    { key: 'info', label: '接口文档', children: <Descriptions column={1} items={[
      { key: 'url', label: '调用地址', children: endpointUrl },
      { key: 'method', label: '请求方式', children: selectedEndpoint.method.toUpperCase() },
      { key: 'type', label: '返回类型', children: 'JSON' },
      { key: 'summary', label: '接口说明', children: selectedEndpoint.summary || selectedEndpoint.description || '暂无说明' },
    ]} /> },
    { key: 'request', label: '请求示例', children: <Tabs className="api-code-tabs" size="small" items={buildRequestSamples(endpointUrl, selectedEndpoint.method, requestParams).map((sample) => ({ key: sample.key, label: sample.label, children: <ApiCodeSample code={sample.code} language={sample.language} /> }))} /> },
    { key: 'success', label: '成功响应', children: <pre className="api-doc-code">{formatJson(selectedEndpoint.responseSuccess)}</pre> },
    { key: 'error', label: '失败响应', children: <pre className="api-doc-code">{formatJson(selectedEndpoint.responseError)}</pre> },
    { key: 'codes', label: '错误码', children: <pre className="api-doc-code">{selectedEndpoint.errorCodes || '暂无错误码说明'}</pre> },
  ] : []

  return <div className="public-app-docs-page">
    <header className="public-home-header public-app-docs-header">
      <button className="public-home-brand" type="button" onClick={() => navigate('/')}>
        {logo ? <img src={logo} alt={`${systemName} Logo`} /> : <span className="public-home-brand-mark"><ApiOutlined /></span>}
        <span>{systemName}</span>
      </button>
      <nav className="public-home-nav" aria-label="文档导航">
        <button type="button" onClick={() => navigate('/')}>应用市场</button>
      </nav>
      <Button type="primary" icon={<LoginOutlined />} onClick={() => navigate(userEntry)}>
        {isAuthenticated('user') ? '进入应用市场' : '用户登录'}
      </Button>
    </header>

    <main className="public-app-docs-main">
      <Button className="public-app-docs-back" type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>返回应用市场</Button>
      <Skeleton loading={loading} active paragraph={{ rows: 8 }}>
        {app ? <>
          <section className="public-app-docs-intro">
            <div className="public-app-docs-logo">
              {app.logo ? <Image preview={false} src={app.logo} alt={`${app.name} 图标`} /> : <ApiOutlined />}
            </div>
            <div>
              <Typography.Text className="public-home-section-kicker">接口文档</Typography.Text>
              <Typography.Title level={1}>{app.name}</Typography.Title>
              <Typography.Paragraph>{app.summary || app.description || '查看接口能力、请求示例和标准响应格式。'}</Typography.Paragraph>
            </div>
            <Button type="primary" onClick={() => navigate(userEntry)}>购买套餐</Button>
          </section>

          <section className="public-app-docs-workspace">
            <aside className="public-app-docs-endpoints">
              <div className="public-app-docs-endpoints-title">接口列表</div>
              {endpoints.length > 0 ? endpoints.map((endpoint) => (
                <button
                  key={endpoint.id}
                  className={selectedEndpoint?.id === endpoint.id ? 'is-active' : ''}
                  type="button"
                  onClick={() => setSelectedEndpoint(endpoint)}
                >
                  <span className={`public-app-docs-method method-${endpoint.method.toLowerCase()}`}>{endpoint.method.toUpperCase()}</span>
                  <span className="public-app-docs-endpoint-text"><b>{endpoint.name}</b><small>{endpoint.path}</small></span>
                </button>
              )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无公开接口文档" />}
            </aside>
            <article className="public-app-docs-content">
              {selectedEndpoint ? <Tabs className="public-app-docs-tabs" items={endpointTabs} /> : <Empty description="暂无可展示的接口文档" />}
            </article>
          </section>
        </> : <Empty className="public-app-docs-empty" description="应用不存在或暂未上架">
          <Button type="primary" onClick={() => navigate('/')}>返回应用市场</Button>
        </Empty>}
      </Skeleton>
    </main>
  </div>
}