/** 将后端时间统一按中国北京时间展示。 */
export function formatChinaTime(value: unknown, fallback = '-'): string {
  if (value === undefined || value === null || String(value).trim() === '') return fallback

  const text = String(value).trim()
  const plainMatch = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):?(\d{2})(?::?(\d{2})(?:\.\d+)?)?$/.exec(text)
  if (plainMatch) {
    return `${plainMatch[1]} ${plainMatch[2]}:${plainMatch[3]}:${plainMatch[4] || '00'}`
  }

  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text

  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`
}