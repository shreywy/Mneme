/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5178, strictPort: true },
  build: {
    rolldownOptions: {
      output: {
        // The page editor gets chunks of its own. Left to itself, the bundler hoists modules that pages and
        // share links both use (TextBlock, say) into the first chunk, and the editor then loads with every page.
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            { name: 'editor-libs', test: /[\/]node_modules[\/](@tiptap|prosemirror-|lowlight|highlight\.js|orderedmap|rope-sequence|w3c-keyname|linkifyjs|tippy\.js|@floating-ui)/ },
            { name: 'editor', test: /[\/]src[\/]features[\/]sheet[\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
