import { readdirSync } from 'node:fs'
import { defineConfig } from 'i18next-cli'

const LOCALES_DIR = 'resources/locales'
const SOURCE_LANGUAGE = 'en'

const locales = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

// Component files that still hold hard-coded text. Each translation commit
// removes its files; the interface-translation work is done when this is empty.
const NOT_YET_TRANSLATED: string[] = []

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
