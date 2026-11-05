import { build as viteBuild } from 'vite'
import { build as esbuild } from 'esbuild'
import { mkdir } from 'node:fs/promises'

await mkdir('dist/main', { recursive: true })
await Promise.all([
  esbuild({ entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.cjs', bundle: true, platform: 'node', target: 'node22', format: 'cjs', external: ['electron'], sourcemap: true }),
  esbuild({ entryPoints: ['src/main/preload.ts'], outfile: 'dist/main/preload.cjs', bundle: true, platform: 'node', target: 'node22', format: 'cjs', external: ['electron'], sourcemap: true }),
  viteBuild(),
])
