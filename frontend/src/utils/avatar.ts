const QQ_REG = /^\d{5,11}$/

/** 根据有效 QQ 号生成头像地址，未绑定或格式无效时使用默认头像。 */
export function getQQAvatarUrl(qq?: string): string | undefined {
  const value = String(qq || '').trim()
  if (!QQ_REG.test(value)) return undefined
  return `https://q2.qlogo.cn/headimg_dl?dst_uin=${encodeURIComponent(value)}&spec=100`
}
