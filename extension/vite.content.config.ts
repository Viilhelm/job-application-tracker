import { defineConfig } from 'vite'

/**
 * Content scripts are built one at a time as self-contained IIFE bundles. A Manifest V3 content
 * script cannot be an ES module, and a shared source file is enough to make Rollup hoist a chunk
 * and emit an `import` — which silently stops the script from running at all.
 */
const ENTRIES: Record<string, string> = {
  'linkedin-adapter': 'src/adapters/linkedin.ts',
  'mail-adapter': 'src/adapters/mail.ts',
}

export default defineConfig(({ mode }) => {
  const entry = ENTRIES[mode]
  if (!entry) throw new Error(`Unknown content script "${mode}". Expected one of: ${Object.keys(ENTRIES).join(', ')}`)
  return {
    build: {
      emptyOutDir: false,
      lib: { entry, formats: ['iife'], name: 'jobvault', fileName: () => `${mode}.js` },
    },
  }
})
