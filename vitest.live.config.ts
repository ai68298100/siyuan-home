import { defineConfig } from "vitest/config";
import path from "node:path";

// 活体集成测试配置（打真实内核）——仅经 `pnpm run test:live` 显式运行；
// 默认 vitest.config.ts 已排除 tests/live。前置：本工作区窗口 + SIYUAN_URL/SIYUAN_TOKEN 环境变量
// （scripts/e2e-core.sh 会 source %APPDATA%/siyuan/env 并做单次门禁探测）。
export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "src"),
            siyuan: path.resolve(import.meta.dirname, "tests/stub/siyuan.ts"),
        },
    },
    test: {
        environment: "node",
        include: ["tests/live/**/*.test.ts"],
        // 内核状态串行依赖（建库→写值→扫描→清理），禁并发
        fileParallelism: false,
        testTimeout: 60_000,
        hookTimeout: 120_000,
    },
});
