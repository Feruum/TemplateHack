import assert from 'node:assert/strict'
import test from 'node:test'
import { renderPageHead } from '../src/lib/page-metadata'

test('page metadata retains SEO tags and escapes public content', () => {
  const head = renderPageHead({ title: 'A < B & "C"', description: 'Private "quotes" <here>', publicWebsiteUrl: 'https://site.example.com/base' })
  assert.ok(head.includes('<title>A &lt; B &amp; &quot;C&quot;</title>'))
  assert.ok(head.includes('name="description" content="Private &quot;quotes&quot; &lt;here&gt;"'))
  assert.ok(head.includes('rel="canonical" href="https://site.example.com/"'))
  assert.ok(head.includes('property="og:url" content="https://site.example.com/"'))
  assert.ok(head.includes('name="twitter:card" content="summary"'))
})

test('an unset site URL omits canonical tags and invalid URLs fail explicitly', () => {
  assert.doesNotMatch(renderPageHead({ title: 'Site', description: 'Description' }), /canonical/)
  for (const publicWebsiteUrl of ['relative', 'javascript:alert(1)', 'ftp://site.example.com']) {
    assert.throws(() => renderPageHead({ title: 'Site', description: 'Description', publicWebsiteUrl }), /PUBLIC_WEBSITE_URL/)
  }
})
