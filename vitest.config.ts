import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "src"),
            // 测试环境 stub 思源包：内核 API 一律经 siyuan.ts 的 transport 注入 mock
            siyuan: path.resolve(import.meta.dirname, "tests/stub/siyuan.ts"),
        },
    },
    test: {
        environment: "node",
        include: ["tests/**/*.test.ts"],
    },
});
