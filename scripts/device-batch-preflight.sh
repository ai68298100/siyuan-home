#!/usr/bin/env bash
# 真机批预检（device-batch-runbook.md 前置状态表自动化）—— bash scripts/device-batch-preflight.sh
# 全绿即可按 runbook 六阶段开跑；任一 FAIL 先按提示修复。
# 依赖：sy 包装器（kernel-api skill）、curl、Git Bash（MSYS2_ARG_CONV_EXCL 由脚本内部设置）。
export MSYS2_ARG_CONV_EXCL="*"
SY="C:\Users\sunku\.zcode\skills\siyuan-kernel-api\scripts\sy"
ENVF="$APPDATA/siyuan/env"
BASE=/data/plugins/siyuan-home
PASS=0; FAIL=0
ok()   { echo "  PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL  $1"; FAIL=$((FAIL+1)); }

echo "== 1. 内核与工作区（带鉴权探测，token 只对本工作区有效）="
NB=$("$SY" /api/notebook/lsNotebooks -d '{}' --max 50000 2>/dev/null | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));const l=(d.data&&d.data.notebooks)||(d.notebooks)||[];console.log(l.length)}catch(e){console.log('0')}")
if [ "${NB:-0}" -ge 1 ] 2>/dev/null; then ok "工作区在线，笔记本可见（$NB 个）"; else bad "工作区不可用或 token 失效（外来工作区/实例未启动）"; fi

echo "== 2. 环境凭据 ="
if [ -f "$ENVF" ]; then ok "env 文件存在（$ENVF）"; else bad "缺 $ENVF（sy 配置）"; fi
. "$ENVF" 2>/dev/null
if [ -n "$SIYUAN_TOKEN" ] && [ -n "$SIYUAN_URL" ]; then ok "SIYUAN_URL/TOKEN 已加载"; else bad "env 缺 SIYUAN_URL/TOKEN"; fi

echo "== 3. 部署完整性（index.js + 全部 chunk 字节校验）="
cd "$(dirname "$0")/.." || exit 1
[ -f dist/index.js ] || { bad "缺 dist/（先 pnpm run build 完整构建——app+kernel 双目标，勿用单目标 npx vite build）"; }
[ -f dist/kernel.js ] || bad "缺 dist/kernel.js（同上：须 pnpm run build 完整构建）"
if [ -f dist/index.js ] && [ -f dist/kernel.js ]; then
  M=0
  for f in index.js index.css plugin.json kernel.js; do
    lh=$(sha256sum "dist/$f" | cut -d' ' -f1)
    rh=$(curl -s --max-time 30 -X POST "$SIYUAN_URL/api/file/getFile" -H "Authorization: Token $SIYUAN_TOKEN" -H "Content-Type: application/json" -d "{\"path\":\"$BASE/$f\"}" | sha256sum | cut -d' ' -f1)
    [ "$lh" != "$rh" ] && { echo "  MISMATCH $f"; M=1; }
  done
  for f in dist/chunks/*.js; do
    b=$(basename "$f")
    lh=$(sha256sum "$f" | cut -d' ' -f1)
    rh=$(curl -s --max-time 30 -X POST "$SIYUAN_URL/api/file/getFile" -H "Authorization: Token $SIYUAN_TOKEN" -H "Content-Type: application/json" -d "{\"path\":\"$BASE/chunks/$b\"}" | sha256sum | cut -d' ' -f1)
    [ "$lh" != "$rh" ] && { echo "  MISMATCH chunks/$b"; M=1; }
  done
  [ "$M" -eq 0 ] && ok "部署与本地 dist 字节一致" || bad "部署不一致（重跑 CONTRIBUTING 部署节）"
fi

echo "== 4. 插件启用 ="
E=$(curl -s --max-time 15 -X POST "$SIYUAN_URL/api/petal/loadPetals" -H "Authorization: Token $SIYUAN_TOKEN" -H "Content-Type: application/json" -d '{"frontend":"desktop"}' | grep -o '"name":"siyuan-home","displayName":"[^"]*","version":"[^"]*","enabled":true' | head -1)
[ -n "$E" ] && ok "siyuan-home petal 已启用（desktop）" || bad "siyuan-home 未启用（集市/petal 开关）"

echo "== 5. 兄弟插件在装 ="
for p in siyuan-checkin siyuan-contacts siyuan-glean siyuan-exam; do
  R=$(curl -s --max-time 15 -X POST "$SIYUAN_URL/api/file/readDir" -H "Authorization: Token $SIYUAN_TOKEN" -H "Content-Type: application/json" -d "{\"path\":\"/data/plugins/$p\"}" | grep -o '"code":0' | head -1)
  [ -n "$R" ] && ok "$p 在装" || bad "$p 缺失（B 类互测该部分跳过）"
done

echo "== 6. 运行时首启状态（settings.json 不存在 = 从 onboarding 开始）="
C=$(curl -s --max-time 15 -X POST "$SIYUAN_URL/api/file/getFile" -H "Authorization: Token $SIYUAN_TOKEN" -H "Content-Type: application/json" -d '{"path":"/data/storage/petal/siyuan-home/settings.json"}' -o /dev/null -w "%{http_code}")
if [ "$C" = "202" ] || [ "$C" = "404" ]; then ok "settings.json 不存在 → 首启即 onboarding（runbook 阶段 1 原样执行）"
elif [ "$C" = "200" ]; then ok "settings.json 已存在 → 非首次启动（runbook 阶段 1 的 onboarding 项改为复核项）"
else bad "settings.json 探测异常 http=$C"; fi

echo "== 7. 端点脚本自测（可选，约 1 分钟；会建删临时文档）="
echo "  （手动执行：bash scripts/e2e-endpoints.sh，结果看 /tmp/lvh-e2e.log 的 render/pk/upload 行）"

echo ""
echo "== 结果：PASS=$PASS FAIL=$FAIL ="
[ "$FAIL" -eq 0 ] && echo "预检全绿 → 按 docs/testing/device-batch-runbook.md 六阶段开跑" || echo "存在 FAIL → 修复后重跑本预检"
exit $((FAIL > 0))
