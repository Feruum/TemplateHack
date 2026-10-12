import '@fontsource-variable/inter'
import '@/styles/production.css'
import { hydrateRoot } from 'react-dom/client'
import App from './App'

const root = document.getElementById('root')
if (!root) throw new Error('Website root is missing')
const year = Number(root.dataset.buildYear)
const hydrate = () => hydrateRoot(root, <App year={year} />)
if ('requestIdleCallback' in window) window.requestIdleCallback(hydrate, { timeout: 2500 })
else setTimeout(hydrate, 1)
