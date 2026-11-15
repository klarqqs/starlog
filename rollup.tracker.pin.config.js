import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/tracker/index.ts',
  output: {
    file: 'public/s/1.js',
    format: 'iife',
  },
  plugins: [
    typescript({ tsconfig: './tsconfig.tracker.json' }),
    replace({
      __COLLECT_API_HOST__: '',
      __COLLECT_API_ENDPOINT__: process.env.COLLECT_API_ENDPOINT || '/s/e',
      __STELLOG_NONCE__: 'true',
      __STELLOG_CACHE_HEADER__: 'x-stellog-cache',
      delimiters: ['', ''],
      preventAssignment: true,
    }),
    terser({ compress: { evaluate: false } }),
  ],
};
