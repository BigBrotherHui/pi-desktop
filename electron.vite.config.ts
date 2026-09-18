import { resolve, basename } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, readdirSync, copyFileSync, mkdirSync, existsSync } from 'fs'
import type { Plugin } from 'vite'

const { version } = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

// The voice engines (transformers.js and parakeet.js) run onnxruntime-web,
// which loads its WebAssembly runtime by URL. Ship those files with the
// renderer under `voice-wasm/` and serve them in dev, so speech-to-text works
// offline without fetching WASM from a CDN (which the locked CSP forbids).
const ORT_DIST = resolve(__dirname, 'node_modules/onnxruntime-web/dist')
const VOICE_WASM_DIR = 'voice-wasm'

function ortWasmAssets(): { name: string; path: string }[] {
  if (!existsSync(ORT_DIST)) return []
  return readdirSync(ORT_DIST)
    .filter((file) => file.endsWith('.wasm') || file.endsWith('.mjs'))
    .map((file) => ({ name: file, path: resolve(ORT_DIST, file) }))
}

function voiceWasmPlugin(): Plugin {
  const assets = ortWasmAssets()
  return {
    name: 'pi-voice-wasm',
    // Dev: serve the runtime files straight from node_modules.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        const match = assets.find((asset) => url.includes(`${VOICE_WASM_DIR}/${asset.name}`))
        if (!match) return next()
        res.setHeader('Content-Type', match.name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
        res.end(readFileSync(match.path))
      })
    },
    // Build: copy them next to the bundled renderer.
    writeBundle(options) {
      const outDir = options.dir ?? resolve(__dirname, 'out/renderer')
      const targetDir = resolve(outDir, VOICE_WASM_DIR)
      mkdirSync(targetDir, { recursive: true })
      for (const asset of assets) {
        copyFileSync(asset.path, resolve(targetDir, basename(asset.name)))
      }
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    plugins: [react(), tailwindcss(), voiceWasmPlugin()],
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src')
      }
    }
  }
})
