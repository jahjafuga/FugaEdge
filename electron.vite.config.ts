import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
// Voice Journal (path ii) — copy onnxruntime-web's wasm + emscripten glue to
// <outDir>/ort so Transformers.js loads ONNX under the tight CSP (no blob:).
// wasmPaths is computed relative to the renderer at runtime (new URL('./ort/',
// location.href)) so it resolves under BOTH the dev server and file:// packaged.
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      lib: {
        entry: resolve(__dirname, 'electron/main/index.ts'),
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      lib: {
        entry: resolve(__dirname, 'electron/preload/index.ts'),
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared'),
      },
    },
  },
  renderer: {
    root: '.',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
    // .wasm as URL assets, never parsed as modules.
    assetsInclude: ['**/*.wasm'],
    // Keep esbuild's dep pre-bundler away from Transformers.js — it parses ORT's
    // wasm imports and dies. Loads as native ESM at runtime instead.
    optimizeDeps: {
      exclude: ['@huggingface/transformers'],
    },
    plugins: [
      react(),
      // Copy ORT runtime (wasm + emscripten glue) to <outDir>/ort. Dev: the
      // middleware serves raw bytes. Build: copied into out/renderer/ort/ and
      // packed into the app (asarUnpack keeps them real files for file://).
      viteStaticCopy({
        targets: [
          {
            src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded*.{wasm,mjs}',
            dest: 'ort',
          },
        ],
      }),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared'),
      },
    },
  },
})
