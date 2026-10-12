/** @param {string} template @param {{head: string, html: string, year: number}} page */
export function injectPage(template, page) {
  for (const token of ['<!--app-head-->', '<!--app-html-->', '__BUILD_YEAR__']) {
    if (template.split(token).length !== 2) throw new Error(`Website template must contain exactly one ${token}`)
  }
  return template.replace('<!--app-head-->', () => page.head)
    .replace('<!--app-html-->', () => page.html)
    .replace('__BUILD_YEAR__', String(page.year))
}
