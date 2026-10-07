#!/usr/bin/env bash
# 活体集成测试（core 代码路径打真实内核）—— bash scripts/e2e-core.sh
# 前置：隔离靶场实例（写型冒烟禁直打在用工作区——见 CONTRIBUTING「内核靶场约定」）。
# 可选脚本语义：工作区不可达/缺凭据 → SKIP 退出 0；靶场守卫拒绝 → 退出 1。
# 结果：vitest 退出码直通；测试数据落在专用笔记本 siyuan-home-smoke-真机批 内，跑完自清理。
set -u
export MSYS2_ARG_CONV_EXCL="*"
# Keep explicit variables authoritative, then fall back to the standard env file.
ENVF="${SIYUAN_CONF:-${APPDATA:+$APPDATA/siyuan/env}}"
_URL="${SIYUAN_URL:-}"
_TOKEN="${SIYUAN_TOKEN:-}"
[ -n "$ENVF" ] && [ -f "$ENVF" ] && . "$ENVF"
[ -n "$_URL" ] && SIYUAN_URL="$_URL"
[ -n "$_TOKEN" ] && SIYUAN_TOKEN="$_TOKEN"
: "${SIYUAN_URL:=}"
: "${SIYUAN_TOKEN:=}"
export SIYUAN_URL SIYUAN_TOKEN
# 靶场参数化（约定 1）：SIYUAN_BASE_URL / SIYUAN_TOKEN 环境变量优先于 env 文件
export SIYUAN_URL="${SIYUAN_BASE_URL:-$SIYUAN_URL}"

sy="${SIYUAN_SY:-C:\Users\sunku\.zcode\skills\siyuan-kernel-api\scripts\sy}"
echo "== 门禁（单次探测）=="
v=$("$sy" /api/notebook/lsNotebooks -d '{}' 2>/dev/null | head -c 20)
if [ -z "$v" ]; then
    echo "SKIP：工作区不可用（401 外来工作区 / 429 鉴权锁定 / 内核未启动）——稍后重跑，严禁循环重试"
    exit 0
fi
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
echo "== 靶场守卫（清扫残留 + 共享内核防呆）=="
node "$SCRIPT_DIR/lib/smoke-kernel.mjs" || exit 1
echo "靶场在线 → 活体集成测试"
pnpm exec vitest run --config vitest.live.config.ts "$@"
