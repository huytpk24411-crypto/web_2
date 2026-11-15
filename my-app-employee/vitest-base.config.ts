import { defineConfig } from 'vitest/config';

// Full-suite runs render many frames in parallel; 5 s default is too tight on slower machines.
export default defineConfig({
  test: {
    testTimeout: 15000,
  },
});
