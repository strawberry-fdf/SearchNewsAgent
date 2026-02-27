/**
 * Next.js 配置 —— 支持普通开发模式和 Electron 静态导出模式。
 *
 * - 普通开发 (npm run dev):     使用 rewrites 将 /api/* 代理到后端
 * - Electron 打包 (ELECTRON=true): 使用 output:'export' 生成纯静态 HTML
 *   (API 由同源的 Python 后端直接提供，无需 rewrites)
 */

/** @type {import('next').NextConfig} */

const isElectronBuild = process.env.ELECTRON === "true";

const nextConfig = {
  // Electron 打包: 输出纯静态 HTML 到 out/ 目录
  ...(isElectronBuild ? { output: "export" } : {}),

  // 静态导出模式下使用相对路径，确保 file:// 协议兼容
  ...(isElectronBuild ? { trailingSlash: true } : {}),

  // 普通开发模式: rewrites 代理 API 到后端
  ...(isElectronBuild
    ? {}
    : {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://localhost:8000/api/:path*",
            },
          ];
        },
      }),

  // 关闭图片优化（静态导出不支持 Next.js Image Optimization）
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
