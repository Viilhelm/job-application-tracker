import { readFileSync } from 'node:fs'

/**
 * A Manifest V3 content script that is an ES module never runs, and nothing reports it: the panel
 * simply finds no data. Sharing one source file between two adapters is enough for the bundler to
 * emit an `import`, so the built files are checked rather than trusted.
 */
const scripts = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'))
  .content_scripts.flatMap(entry => entry.js)

const broken = scripts.filter(name => {
  const code = readFileSync(new URL(`../dist/${name}`, import.meta.url), 'utf8')
  return /(^|[;\s])import\s*[{("'*]/.test(code) || /(^|[;\s])export\s*[{*]/.test(code)
})

if (broken.length) {
  console.error(`Content scripts must be self-contained, but these are ES modules: ${broken.join(', ')}`)
  process.exit(1)
}
console.log(`Content scripts are self-contained: ${scripts.join(', ')}`)
