// Revisión del código con ESLint (npm run lint). Revisa también el JavaScript que está dentro de los index.html.
import js from '@eslint/js';
import html from 'eslint-plugin-html';
import globals from 'globals';

const compartidos = {
  // Lo que comparten los archivos de las apps (cargados con <script>, sin módulos).
  ico: 'readonly', llenarIconos: 'readonly', UI: 'readonly', nube: 'readonly', Escaner: 'readonly',
  XLSX: 'readonly', PDFLib: 'readonly', pdfjsLib: 'readonly', cv: 'writable', confetti: 'readonly', Lector: 'readonly', Tesseract: 'readonly', Codigos: 'readonly', ChatSoporte: 'readonly', Historial: 'readonly'
};
const reglas = {
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-control-regex': 'off',
  'no-misleading-character-class': 'off'
};

export default [
  { ignores: ['node_modules/**', '.lighthouseci/**', 'pruebas/firebase-*.js', 'lib/**'] },
  js.configs.recommended,
  {
    files: ['**/*.html'],
    plugins: { html },
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.browser, ...compartidos } },
    rules: reglas
  },
  {
    files: ['comun.js', 'nube.js', 'iconos.js', 'config.js', 'codigos.js', 'entregas/escaner.js', 'entregas/lector.js', 'equipos/chat.js', 'equipos/historial.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.browser, ...compartidos } },
    rules: reglas
  },
  {
    files: ['**/sw.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.serviceworker } },
    rules: reglas
  },
  {
    files: ['avisos/worker.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.serviceworker } },
    rules: reglas
  },
  {
    files: ['pruebas/**/*.mjs', 'eslint.config.js', 'lighthouserc.cjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node, ...globals.browser, axe: 'readonly', nube: 'readonly', UI: 'readonly', Escaner: 'readonly', Lector: 'readonly', Codigos: 'readonly', cv: 'readonly', ChatSoporte: 'readonly', Historial: 'readonly' } },
    rules: { ...reglas, 'no-unused-vars': 'off' }
  }
];
