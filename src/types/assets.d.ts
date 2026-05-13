// Ambient declarations for asset imports handled by Vite. Vite transforms
// these into URL strings at build time, but tsc has no inbuilt knowledge
// of them — without these, `import logo from '...png'` errors at typecheck.

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.jpeg' {
  const src: string
  export default src
}

declare module '*.gif' {
  const src: string
  export default src
}

declare module '*.webp' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}
