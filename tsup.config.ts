import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'entrypoints/sdk': 'src/entrypoints/sdk.ts',
    'entrypoints/cli': 'src/entrypoints/cli.ts',
    'entrypoints/mcp-server': 'src/entrypoints/mcp-server.ts',
    'bin/paicli': 'bin/paicli.ts',
  },
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'ink',
    'react',
    'better-sqlite3',
    '@modelcontextprotocol/sdk',
  ],
  splitting: true,
  treeshake: true,
})
