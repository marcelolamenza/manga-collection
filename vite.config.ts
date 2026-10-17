import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return;
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor';
          if (/\/node_modules\/(?:@firebase\/(?:app|auth|firestore)|firebase\/(?:app|auth|firestore))\//.test(id)) {
            if (/\/(?:@firebase\/)?app\//.test(id)) return 'firebase-app';
            if (/\/(?:@firebase\/)?auth\//.test(id)) return 'firebase-auth';
            return 'firebase-firestore';
          }
          if (id.includes('/node_modules/@firebase/')) return 'firebase-shared';
        },
      },
    },
  },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], include: ['./src/**/*.test.{ts,tsx}'] },
});

