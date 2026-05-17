// Flat config (ESLint v9+). Migrated from .eslintrc.json on 2026-05-17 as
// part of the eslint 8.57 -> 10.x bump triggered by Dependabot PR #24.
const globals = require('globals');

module.exports = [
    {
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                // App / module globals (defined across the JS files in js/)
                App: 'writable',
                Modal: 'writable',
                Export: 'writable',
                Router: 'writable',
                Compute: 'writable',
                ChartUtils: 'writable',
                Utils: 'writable',
                DASHBOARD_DATA: 'readonly',
                STATE_DATA: 'readonly',
                COUNTY_DATA: 'readonly',
                BUNDLES: 'writable',
                BRIEF_TEMPLATES: 'writable',
                ZERO_IS_VALID: 'writable',
                AREA_ICONS: 'writable',
                STATE_ABBREVS: 'writable',
                QOTD: 'writable',
                QOTD_QUESTIONS: 'readonly',
                THRESHOLD_CONFIG: 'readonly',
                // Third-party libraries loaded via <script>
                Chart: 'readonly',
                XLSX: 'readonly',
                // CommonJS-style guard ("if (typeof module !== 'undefined')")
                // used in a couple of files for optional Node compatibility.
                module: 'readonly',
            },
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
            'no-redeclare': 'off',
            'eqeqeq': ['error', 'smart'],
            'no-debugger': 'error',
            'no-alert': 'warn',
        },
    },
];
