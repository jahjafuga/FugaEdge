// Ambient declaration for Vite's import.meta.env. The repo pins
// tsconfig "types" to ["node"], so vite/client's full ambient surface is
// deliberately NOT loaded (assets.d.ts hand-declares the asset modules for
// the same reason). Declare just the env shape we consume — first user:
// the v0.2.5 §C activation gate's renderer-side isPackaged signal (A3,
// import.meta.env.PROD).

interface ImportMetaEnv {
  readonly PROD: boolean
  readonly DEV: boolean
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
