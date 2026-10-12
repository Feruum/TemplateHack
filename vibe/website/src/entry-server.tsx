import { renderToString } from 'react-dom/server'
import App from './App'
import { PAGE_DESCRIPTION, PAGE_TITLE, renderPageHead } from './lib/page-metadata'

export function renderPage() {
  const year = new Date().getFullYear()
  return {
    year,
    html: renderToString(<App year={year} />),
    head: renderPageHead({ title: PAGE_TITLE, description: PAGE_DESCRIPTION, publicWebsiteUrl: import.meta.env.PUBLIC_WEBSITE_URL }),
  }
}
