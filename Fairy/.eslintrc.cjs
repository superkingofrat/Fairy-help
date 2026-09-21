/**
 * 全 monorepo 统一的 ESLint 配置（eslintrc 格式，配套 eslint 8.57）。
 * 各 workspace 的 lint script 从自身目录向上查找时命中此文件；
 * 新增 workspace 无需重复配置，继承这里即可。
 */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  ignorePatterns: ["dist/", "coverage/"],
  rules: {
    // 服务端日志是约定的可观测性手段（AGENTS.md §5 用量跟踪依赖 console.error），
    // 前端日志由 code review 把关，故不全局禁用
    "no-console": "off",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
  overrides: [
    {
      // 仅前端源码启用 React 相关规则；api/包内无 JSX
      files: ["apps/web/**/*.ts", "apps/web/**/*.tsx"],
      env: {
        browser: true,
      },
      plugins: ["react-hooks", "react-refresh"],
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        // eslint-plugin-react-refresh 0.4.10+ 将规则更名为 only-export-components
        "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      },
    },
  ],
};
