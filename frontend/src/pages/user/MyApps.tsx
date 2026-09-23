import { formatChinaTime } from '@/utils/time'
import { useCallback, useEffect, useState } from 'react'
import CodeHighlighter from '@/components/CodeHighlighter'
import { Button, Card, Col, Descriptions, Empty, Image, Input, Modal, Row, Space, Statistic, Tag, Tabs, Typography, message } from 'antd'
import { CopyOutlined, KeyOutlined, ReloadOutlined } from '@ant-design/icons'
import { userApi } from '@/api'
import type { App, AppEndpoint, AppSubscription } from '@/types'

type DebugState = { sub: AppSubscription; endpoint?: AppEndpoint }
type RequestParams = Record<string, string>

const defaultRequestBody: RequestParams = { real_name: '', id_card: '', alipay_account: '' }

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

function formatJson(value?: string) {
  if (!value?.trim()) return '暂无文档内容'
  try { return JSON.stringify(JSON.parse(value), null, 2) } catch { return value }
}

type CodeLanguage = 'go' | 'csharp' | 'php' | 'java' | 'python' | 'bash'
type CodeSample = { key: CodeLanguage; label: string; language: CodeLanguage; code: string }

function shellQuote(value: string) {
  return value.replace(/'/g, "'\\''")
}

function buildRequestSamples(endpointUrl: string, method: string, params: RequestParams): CodeSample[] {
  const requestMethod = method.toUpperCase()
  const entries = Object.entries(params)
  const encodedBody = new URLSearchParams(entries).toString()
  const requestUrl = requestMethod === 'GET' && encodedBody
    ? `${endpointUrl}${endpointUrl.includes('?') ? '&' : '?'}${encodedBody}`
    : endpointUrl
  const goFields = entries.length
    ? entries.map(([key, value]) => `    form.Set(${JSON.stringify(key)}, ${JSON.stringify(value)})`).join('\n')
    : '    // 无请求参数'
  const phpFields = entries.length
    ? entries.map(([key, value]) => `    ${JSON.stringify(key)} => ${JSON.stringify(value)}`).join(',\n')
    : '    // 无请求参数'
  const pythonFields = entries.length
    ? entries.map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(',\n')
    : '    # 无请求参数'
  const curlFields = entries.length
    ? entries.map(([key, value]) => `  --data-urlencode '${shellQuote(`${key}=${value}`)}'`).join(' \\\n')
    : ''
  const javaFields = entries.length
    ? entries.map(([key, value]) => `        form.append(${JSON.stringify(key)}).append("=").append(URLEncoder.encode(${JSON.stringify(value)}, StandardCharsets.UTF_8)).append("&");`).join('\n')
    : '        // 无请求参数'
  const csharpFields = entries.length
    ? entries.map(([key, value]) => `            [${JSON.stringify(key)}] = ${JSON.stringify(value)},`).join('\n')
    : '            // 无请求参数'
  const goImports = requestMethod === 'GET'
    ? '    "fmt"\n    "io"\n    "net/http"'
    : '    "fmt"\n    "io"\n    "net/http"\n    "net/url"\n    "strings"'
  const goSetup = requestMethod === 'GET'
    ? '    // GET 参数已拼接至请求地址'
    : `    form := url.Values{}\n${goFields}`
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
        var body = await response.Content.ReadAsStringAsync();
        Console.WriteLine(body);
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
export default function MyApps() {
  const [rows, setRows] = useState<AppSubscription[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [secret, setSecret] = useState<{ app_key: string; app_secret: string }>()
  const [debug, setDebug] = useState<DebugState>()
  const [params, setParams] = useState<RequestParams>({})

  const load = async () => {
    const [subscriptions, applications] = await Promise.all([userApi.getSubscriptions(), userApi.getApps()])
    setRows(subscriptions.data || [])
    setApps(applications.data || [])
  }

  useEffect(() => { void load() }, [])

  const viewSecret = async (id: number) => {
    const res = await userApi.getSubscriptionSecret(id)
    setSecret(res.data)
  }

  const appName = (id?: number) => apps.find((app) => app.id === id)?.name || `应用 ${id || '-'}`
  const openDebug = (sub: AppSubscription) => { setParams({}); setDebug({ sub }) }
  const selectEndpoint = useCallback((endpoint: AppEndpoint) => {
    setDebug((current) => current ? { ...current, endpoint } : current)
    setParams(parseRequestExample(endpoint.requestBody))
  }, [])

  const runDebug = async () => {
    if (!debug?.endpoint) { message.warning('请先选择接口'); return }
    try {
      const appId = debug.sub.appId || debug.sub.app_id || 0
      const app = apps.find((item) => item.id === appId)
      if (!app?.slug) throw new Error('应用信息无效')
      const secretResponse = await userApi.getSubscriptionSecret(debug.sub.id)
      if (!secretResponse.data?.app_key || !secretResponse.data?.app_secret) throw new Error('调用密钥不可用')
      const form = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => form.append(key, value))
      const response = await fetch(`/api/open/${app.slug}${debug.endpoint.path}`, {
        method: debug.endpoint.method,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-App-Key': secretResponse.data.app_key, 'X-App-Secret': secretResponse.data.app_secret },
        body: debug.endpoint.method === 'GET' ? undefined : form,
      })
      const text = await response.text()
      let result: unknown = text
      try { result = JSON.parse(text) } catch { /* 保留非 JSON 响应 */ }
      const resultData = result && typeof result === 'object' && !Array.isArray(result) ? (result as { data?: Record<string, unknown> }).data : undefined
      const authUrl = typeof resultData?.alipay_auth_url === 'string' ? resultData.alipay_auth_url : ''
      const resultJson = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      Modal.info({
        title: '调用结果',
        width: 620,
        content: authUrl ? <div className="app-debug-result">
          <div className="app-debug-result-status">{String(resultData?.message || '请完成支付宝授权')}</div>
          <div className="app-debug-result-qr"><Image width={240} src={`/api/qrcode/alipay?url=${encodeURIComponent(authUrl)}`} preview={{ mask: '查看二维码' }} /></div>
          <Space direction="vertical" size={4} className="app-debug-result-details">
            <Typography.Text type="secondary">验证编号：{String(resultData?.verify_id || '-')}</Typography.Text>
            <Typography.Link href={authUrl} target="_blank" rel="noreferrer">前往支付宝认证</Typography.Link>
          </Space>
          <details className="app-debug-result-raw"><summary>查看完整返回 JSON</summary><pre>{resultJson}</pre></details>
        </div> : <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 480, overflow: 'auto' }}>{resultJson}</pre>,
      })    } catch (error) {
      message.error(error instanceof Error ? error.message : '接口调用失败')
    }
  }

  const endpoint = debug?.endpoint
  const endpointApp = apps.find((item) => item.id === (debug?.sub.appId || debug?.sub.app_id))
  const endpointUrl = endpointApp?.slug && endpoint
    ? `${window.location.origin}/api/open/${endpointApp.slug}${endpoint.path}`
    : '-'
  const endpointTabs = endpoint ? [
    { key: 'info', label: '接口文档', children: <Descriptions column={1} items={[
      { key: 'url', label: '调用地址', children: endpointUrl },
      { key: 'method', label: '请求方式', children: endpoint.method },
      { key: 'type', label: '返回类型', children: 'JSON' },
      { key: 'summary', label: '接口说明', children: endpoint.summary || endpoint.description || '暂无说明' },
    ]} /> },
    { key: 'request', label: '请求示例', children: <Tabs className="api-code-tabs" size="small" items={buildRequestSamples(endpointUrl, endpoint.method, params).map((sample) => ({ key: sample.key, label: sample.label, children: <ApiCodeSample code={sample.code} language={sample.language} /> }))} /> },
    { key: 'success', label: '成功响应', children: <pre className="api-doc-code">{formatJson(endpoint.responseSuccess)}</pre> },
    { key: 'error', label: '失败响应', children: <pre className="api-doc-code">{formatJson(endpoint.responseError)}</pre> },
    { key: 'codes', label: '错误码', children: <pre className="api-doc-code">{endpoint.errorCodes || '暂无错误码说明'}</pre> },
  ] : []

  return <div className="user-page">
    <div className="user-page-heading"><div><h2>我的应用</h2><span>管理已购买套餐、调用密钥和接口调试</span></div><Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button></div>
    {rows.length === 0 ? <Card className="user-panel"><Empty description="暂无已开通应用套餐" /></Card> : <Row gutter={[16, 16]}>{rows.map((sub) => {
      const appId = sub.appId || sub.app_id || 0
      const quotaUsed = sub.quotaUsed || sub.quota_used || 0
      const quotaTotal = sub.quotaTotal || sub.quota_total || 0
      return <Col xs={24} lg={12} key={sub.id}><Card className="user-panel" title={appName(appId)} extra={<Tag color={sub.status ? 'green' : 'default'}>{sub.status ? '有效' : '停用'}</Tag>}>
        <Row gutter={16}><Col span={12}><Statistic title="已用额度" value={quotaUsed} suffix={quotaTotal ? `/ ${quotaTotal}` : '次'} /></Col><Col span={12}><Statistic title="到期时间" value={formatChinaTime(sub.expiresAt).slice(0, 16)} /></Col></Row>
        <Space style={{ marginTop: 20 }}><Button icon={<KeyOutlined />} onClick={() => void viewSecret(sub.id)}>查看调用密钥</Button><Button type="primary" onClick={() => openDebug(sub)}>接口调试</Button></Space>
      </Card></Col>
    })}</Row>}
    <Modal title="调用密钥" open={Boolean(secret)} onCancel={() => setSecret(undefined)} footer={null}><Descriptions column={1} items={[{ key: 'key', label: 'AppKey', children: secret?.app_key }, { key: 'secret', label: 'AppSecret', children: secret?.app_secret }]} /></Modal>
    <Modal title="接口调试" open={Boolean(debug)} onCancel={() => setDebug(undefined)} onOk={() => void runDebug()} okText="发送请求" width={1040} destroyOnHidden>
      <Row gutter={24}><Col xs={24} md={8}><div style={{ marginBottom: 12, color: '#667085' }}>接口列表</div><EndpointList appId={debug?.sub.appId || debug?.sub.app_id || 0} selectedId={endpoint?.id} onChange={selectEndpoint} />{endpoint && <><div style={{ margin: '20px 0 8px', color: '#667085' }}>请求参数（Body）</div>{Object.keys(params).map((key) => <div key={key} style={{ marginBottom: 12 }}><div style={{ marginBottom: 4 }}><span style={{ color: '#f5222d' }}>* </span>{key}</div><Input value={params[key]} placeholder="请输入参数" onChange={(event) => setParams((current) => ({ ...current, [key]: event.target.value }))} /></div>)}<div style={{ color: '#8c8c8c', fontSize: 12 }}>发送请求会真实消耗一次套餐额度，仅认证成功时扣减。</div></>}</Col><Col xs={24} md={16}>{endpoint ? <Tabs items={endpointTabs} /> : <Empty description="正在加载接口文档" />}</Col></Row>
    </Modal>
  </div>
}

function EndpointList({ appId, selectedId, onChange }: { appId: number; selectedId?: number; onChange: (value: AppEndpoint) => void }) {
  const [rows, setRows] = useState<AppEndpoint[]>([])
  useEffect(() => {
    if (appId) void userApi.getAppEndpoints(appId).then((response) => {
      const endpoints = response.data || []
      setRows(endpoints)
      if (endpoints.length > 0 && !selectedId) onChange(endpoints[0])
    })
  }, [appId, onChange, selectedId])
  if (rows.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无接口文档" />
  return <div className="app-endpoint-list">{rows.map((row) => <Button key={row.id} type={selectedId === row.id ? 'primary' : 'text'} block onClick={() => onChange(row)}><span className="app-endpoint-method">{row.method}</span><span>{row.path}</span><span className="app-endpoint-name">{row.name}</span></Button>)}</div>
}