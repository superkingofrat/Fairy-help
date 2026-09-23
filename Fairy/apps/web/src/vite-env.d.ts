/// <reference types="vite/client" />

interface ImportMetaEnv {
  // 高德浏览器端安全密钥（防盗链），build-time 内联；服务端 AMAP_SERVER_KEY 禁止出现在前端
  readonly VITE_AMAP_JS_KEY?: string;
}
