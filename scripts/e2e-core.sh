#!/usr/bin/env bash
# 活体集成测试（core 代码路径打真实内核）—— bash scripts/e2e-core.sh
# 前置：本工作区窗口（测试内部有单次门禁探测，401/429 会 skip 而不重试——见 CONTRIBUTING）。
# 结果：vitest 退出码直通；测试数据落在专用笔记本 LVH-真机批 内，跑完自清理。
set -u
export MSYS2_ARG_CONV_EXCL="*"
ENVF="$APPDATA/siyuan/env"
[ -f "$ENVF" ] && . "$ENVF"
export SIYUAN_URL SIYUAN_TOKEN

sy="C:\Users\sunku\.zcode\skills\siyuan-kernel-api\scripts\sy"
echo "== 门禁（单次探测）=="
v=$("$sy" /api/notebook/lsNotebooks -d '{}' 2>/dev/null | head -c 20)
if [ -z "$v" ]; then
    echo "SKIP：工作区不可用（401 外来工作区 / 429 鉴权锁定 / 内核未启动）——稍后重跑，严禁循环重试"
    exit 0
fi
echo "工作区在线 → 活体集成测试"
npx vitest run --config vitest.live.config.ts "$@"
