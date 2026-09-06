/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // three.js materials, uniforms, and camera controls are mutable by design; the globe
    // mutates them inside effects and frame callbacks, which the compiler rule cannot model.
    files: ['src/components/globe/**/*.tsx'],
    rules: { 'react-hooks/immutability': 'off' },
  },
  globalIgnores(['.next/**', 'out/**', 'next-env.d.ts']),
]);
