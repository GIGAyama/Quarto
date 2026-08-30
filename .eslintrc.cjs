module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  // ⚠️ public/giga-app-links.js は正本 standards/web/giga-app-links.js の写しで、
  //    42 本すべてにバイト単位で同じものが配られる。ここで直しても他へは届かず、
  //    check-drift が赤くなる。lint の対象から外すのが正しい直し方。
  //    （先頭の /* eslint-disable */ が、この repo の
  //     --report-unused-disable-directives --max-warnings 0 に当たって
  //     error になっていた。）
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs', 'public/giga-app-links.js'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    'react/prop-types': 'off',
  },
}
