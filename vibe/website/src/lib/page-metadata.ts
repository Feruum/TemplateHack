export const PAGE_TITLE = 'ЙЙ — шаблон для создания сайтов и приложений с ИИ'
export const PAGE_DESCRIPTION =
  'Соберите лендинг, веб- или мобильное приложение с ИИ. Технологии, структура проекта, компоненты и проверки уже настроены.'

export function renderPageHead({ title, description, publicWebsiteUrl }: {
  title: string
  description: string
  publicWebsiteUrl?: string
}) {
  let canonical: string | undefined
  if (publicWebsiteUrl?.trim()) {
    try {
      const url = new URL(publicWebsiteUrl.trim())
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Invalid protocol')
      canonical = new URL('/', url).toString()
    } catch {
      throw new Error('PUBLIC_WEBSITE_URL must be an absolute http(s) URL')
    }
  }
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    '<meta name="twitter:card" content="summary" />',
  ]
  if (canonical) tags.push(
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
  )
  return tags.join('\n')
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}
