import zhCN from "../locales/zh-CN.json";

type Messages = typeof zhCN;

export function t(key: keyof Messages): string {
  return zhCN[key];
}
