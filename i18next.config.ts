import { readdirSync } from 'node:fs'
import { defineConfig } from 'i18next-cli'

const LOCALES_DIR = 'resources/locales'
const SOURCE_LANGUAGE = 'en'

const locales = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

// Component files that still hold hard-coded text. Each translation commit
// removes its files; the interface-translation work is done when this is empty.
const NOT_YET_TRANSLATED = [
  'src/renderer/src/components/council-panels.tsx',
  'src/renderer/src/components/custom-models-editor.tsx',
  'src/renderer/src/components/diagnostics-panel.tsx',
  'src/renderer/src/components/diff-viewer.tsx',
  'src/renderer/src/components/file-tree.tsx',
  'src/renderer/src/components/git-conveyor-actions.tsx',
  'src/renderer/src/components/image-viewer.tsx',
  'src/renderer/src/components/package-browser.tsx',
  'src/renderer/src/components/permission-rules-editor.tsx',
  'src/renderer/src/components/review-rail.tsx',
  'src/renderer/src/components/skills-panel.tsx',
  'src/renderer/src/components/stats-panel.tsx',
  'src/renderer/src/components/terminal.tsx',
  'src/renderer/src/components/theme-editor.tsx',
  'src/renderer/src/components/theme-gallery.tsx',
  'src/renderer/src/components/timeline.tsx',
  'src/renderer/src/components/workflow-navigator.tsx',
]

export default defineConfig({
  locales,
  extract: {
    input: ['src/**/*.{ts,tsx}'],
    ignore: ['**/*.test.ts', '**/*.d.ts'],
    output: `${LOCALES_DIR}/{{language}}/{{namespace}}.json`,
    defaultNS: 'translation',
    primaryLanguage: SOURCE_LANGUAGE,
    removeUnusedKeys: true,
    // Read by resources/permission-prompt-text.ts (inside the Pi process), not by t().
    preservePatterns: ['permissions.prompt.*'],
    sort: true,
    indentation: 2,
    // New keys land empty; locales.test.ts fails until the English text is written.
    defaultValue: '',
  },
  lint: {
    ignore: NOT_YET_TRANSLATED,
    // Code samples and commands are not interface text.
    ignoredTags: ['code', 'pre'],
    checkConcatenation: 'error',
    checkInterpolationParams: true,
  },
})
