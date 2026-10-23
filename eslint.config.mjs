import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'design-reference/**', 'drizzle/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Leading underscore marks a value dropped on purpose (e.g. removing id before copying a row).
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      // Design tokens only: raw hex colours belong in src/styles/tokens.css.
      'no-restricted-syntax': ['error', ...['Literal', 'TemplateElement[value.raw', 'JSXText'].map((n) => ({
        selector: n.startsWith('TemplateElement') ? `${n}=/#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]/]` : `${n}[value=/#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]/]`,
        message: 'Use a CSS variable from tokens.css instead of a raw hex colour.'
      }))]
    }
  }
];

export default config;
