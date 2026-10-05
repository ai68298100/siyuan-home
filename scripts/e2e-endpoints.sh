#!/usr/bin/env bash
# LVH 端点实测（后台自动）：等"本工作区"内核稳定 → 建测试库 → 150 行 → render/PK 分页验证 → asset 上传 → 清理
# 用法：bash scripts/e2e-endpoints.sh   （结果写 /tmp/lvh-e2e.log；总时长上限 ~9 分钟）
# 背景（2026-10-04）：实例被多插件会话共用并切换工作区——token 只对本工作区有效，
# 所以稳定判定用【带鉴权探测】（lsNotebooks），正确拒绝外来工作区（version 端点免鉴权，不能作判据）。
# 2026-10-04 实测结论（详见 docs/testing/v0.2.md §8）：
#  - /api/query/sql 不暴露 notebooks 表 → 笔记本 id 走 lsNotebooks JSON（sy 包装器输出为解包后的 data）
#  - createDocWithMd 返回值是 JSON 字符串字面量（带引号）→ tr -d '"'
#  - 加列端点实名 addAttributeViewKey（keyID 留空由内核生成）；addAttributeViewColumn 不存在
#  - renderAttributeView 默认分页：rowCount 全量计数，rows 只回视图 pageSize（默认 50）
#  - getAttributeViewPrimaryKeyValues：pageSize 封顶、page 翻页无重叠
#  - removeDoc(path) 报 block not found（open 笔记本后依旧）→ removeDocByID(id) 可用
#  - sy 包装器对大响应（>~64KB）静默截断 → render/PK 等大响应用原始 curl；MSYS 禁转换下
#    curl 的 -o/-F 文件参数需 cygpath 转 Windows 路径
LOG=/tmp/lvh-e2e.log
sy="C:\Users\sunku\.zcode\skills\siyuan-kernel-api\scripts\sy"
# 靶场参数化（约定 1）：SIYUAN_BASE_URL / SIYUAN_TOKEN 环境变量优先，缺 token 明确 SKIP；
# sy 包装器同样优先读 SIYUAN_URL/SIYUAN_TOKEN 环境变量（缺省回落 env 文件）
TOKEN="${SIYUAN_TOKEN:-$(grep SIYUAN_TOKEN "$APPDATA/siyuan/env" 2>/dev/null | cut -d= -f2)}"
BASE="${SIYUAN_BASE_URL:-${SIYUAN_URL:-http://127.0.0.1:6806}}"
export SIYUAN_URL="$BASE" SIYUAN_TOKEN="$TOKEN"
if [ -z "$TOKEN" ]; then
  echo "SKIP：缺 SIYUAN_TOKEN（靶场 token 从该实例 设置→关于 获取）；绝不使用默认凭据"
  exit 0
fi
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
echo "=== $(date '+%H:%M:%S') start" >> "$LOG"

# 1) 等内核稳定且工作区是我们的（带鉴权探测：token 只对本工作区有效）
ok=0; i=0
while [ $i -lt 24 ]; do
  v=$("$sy" /api/notebook/lsNotebooks -d '{}' 2>/dev/null)
  if [ -n "$v" ]; then ok=$((ok+1)); else ok=0; fi
  [ $ok -ge 3 ] && break
  i=$((i+1)); sleep 20
done
if [ $ok -lt 3 ]; then echo "RESULT: kernel/workspace never stabilized (auth probe)" >> "$LOG"; exit 1; fi
echo "kernel+workspace stable (waited ~$((i*20))s)" >> "$LOG"

# 1.5) 靶场守卫（约定 2/3）：清扫本插件前缀的崩溃残留；存在非冒烟笔记本即拒跑
node "$SCRIPT_DIR/lib/smoke-kernel.mjs" "$BASE" "$TOKEN" || { echo "RESULT: guard rejected target" >> "$LOG"; exit 1; }

# 2) 测试笔记本（幂等）。注意：/api/query/sql 不暴露 notebooks 表（2026-10-04 实测），
#    只能走 lsNotebooks JSON 反查 id（node 解析，UTF-8 安全）
nbid() { node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));const list=(d.data&&d.data.notebooks)||(d.notebooks)||[];const n=list.find(n=>n.name==='siyuan-home-smoke-端点实测'&&(!n.closed));console.log(n?n.id:'')}catch(e){}" 2>/dev/null; }
NB=$("$sy" /api/notebook/lsNotebooks -d '{}' --max 50000 2>/dev/null | nbid)
if [ -z "$NB" ]; then
  "$sy" /api/notebook/createNotebook -d '{"name":"siyuan-home-smoke-端点实测"}' >> "$LOG" 2>&1
  NB=$("$sy" /api/notebook/lsNotebooks -d '{}' --max 50000 2>/dev/null | nbid)
fi
# 复用的笔记本可能是关闭态（removeDoc 等操作要求打开）→ 无条件 open
[ -n "$NB" ] && "$sy" /api/notebook/openNotebook -d "{\"notebook\":\"$NB\"}" >> "$LOG" 2>&1
[ -n "$NB" ] || { echo "RESULT: no notebook" >> "$LOG"; exit 1; }
echo "notebook=$NB" >> "$LOG"

# 3) 测试文档 + AV（div 占位 → renderAttributeView createIfNotExist 实体化，与 provisioner 同路径）
TS=$(date +%s)
DOC=$("$sy" /api/filetree/createDocWithMd -d "{\"notebook\":\"$NB\",\"path\":\"/render-分页实测-$TS\",\"markdown\":\"# t\"}" 2>/dev/null | tr -d '"')
[ -n "$DOC" ] || { echo "RESULT: no doc" >> "$LOG"; exit 1; }
echo "doc=$DOC" >> "$LOG"
INS=$("$sy" /api/block/insertBlock -d "{\"dataType\":\"markdown\",\"data\":\"<div data-type=\\\"NodeAttributeView\\\" data-av-id=\\\"lvh-av-$TS\\\" data-av-type=\\\"table\\\"></div>\",\"parentID\":\"$DOC\"}" 2>>"$LOG")
# av 块 id 直接从 insertBlock 响应提取（同步可靠）；SQL 索引仅作回退
AV=$(node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));const ops=Array.isArray(d)?d[0].doOperations:(d.data&&d.data.doOperations)||d.doOperations||[];const op=ops.find(o=>o.action==='insert');const m=op&&op.data&&op.data.match(/data-node-id=\\\"([0-9]{14}-[a-z0-9]+)\\\"/);console.log(m?m[1]:'')}catch(e){}" <<< "$INS" 2>/dev/null)
[ -n "$AV" ] || sleep 3
[ -n "$AV" ] || AV=$("$sy" sql "SELECT id FROM blocks WHERE type='av' AND markdown LIKE '%lvh-av-$TS%' LIMIT 1" -q '.[0].id' 2>/dev/null | tr -d '"')
[ -n "$AV" ] || { echo "RESULT: no av block" >> "$LOG"; exit 1; }
echo "av=$AV" >> "$LOG"
"$sy" /api/av/renderAttributeView -d "{\"id\":\"$AV\",\"createIfNotExist\":true}" >> "$LOG" 2>&1

# 4) 加一列 text（端点实名 addAttributeViewKey）。
#    [81 波修正] keyID 必须自造（YYYYMMDDHHMMSS-xxxxxx 形态）——留空会建出 id 为空串的不可用列（E4'）
"$sy" /api/av/addAttributeViewKey -d "{\"avID\":\"$AV\",\"keyID\":\"$(date +%Y%m%d%H%M%S)-wpkey1\",\"keyIcon\":\"\",\"keyName\":\"备注\",\"keyType\":\"text\",\"previousKeyID\":\"\"}" >> "$LOG" 2>&1

# 5) 加 250 行（5 批 × 50 detached）——超过 PK 单页上限，验证翻页循环终止条件；
#    addAttributeViewBlocks 的响应被包装器吞掉（大 payload）→ 行数以最终 render rowCount 为准
ADDED=0
for batch in 0 1 2 3 4; do
  SRCS=""
  for j in $(seq 1 50); do
    n=$((batch*50+j))
    SRCS="$SRCS{\"content\":\"行$n\",\"isDetached\":true},"
  done
  SRCS=${SRCS%,}
  "$sy" /api/av/addAttributeViewBlocks -d "{\"avID\":\"$AV\",\"srcs\":[$SRCS]}" >> "$LOG" 2>&1
  echo "batch$batch: sent" >> "$LOG"
  sleep 1
done

# 6) render 分页验证（[已实测 2026-10-04]：rowCount=全量计数，rows 只返回视图 pageSize 默认 50 行）
# 大响应走原始 curl——sy 包装器对 >~64KB 响应静默截断（JSON 中段被砍 → parse-fail）
ROUT=$(cygpath -m /tmp/lvh-render.json)
curl -s -m 60 -X POST "$BASE/api/av/renderAttributeView" -H "Authorization: Token $TOKEN" -H "Content-Type: application/json" -d "{\"id\":\"$AV\"}" -o "$ROUT"
RCOUNT=$(grep -o '"rowCount":[0-9]*' "$ROUT" | head -1)
RLEN=$(node -e "try{const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));const r=(d.data&&d.data.view&&d.data.view.rows)||[];console.log('rows.len='+r.length+' (pageSize='+d.data.view.pageSize+')')}catch(e){console.log('rows.len=parse-fail')}" "$ROUT" 2>/dev/null)
echo "render: $RCOUNT $RLEN" >> "$LOG"

# 7) PK 分页验证（[已实测]：pageSize 封顶语义；250 行 @pageSize200 → 200+50 且无重叠 = 循环"返回数<pageSize 即止"成立）
P1=$(cygpath -m /tmp/lvh-pk1.json)
curl -s -m 60 -X POST "$BASE/api/av/getAttributeViewPrimaryKeyValues" -H "Authorization: Token $TOKEN" -H "Content-Type: application/json" -d "{\"id\":\"$AV\",\"page\":1,\"pageSize\":200}" -o "$P1"
PK1=$(node -e "try{const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log('pk1.len='+(((d.data||{}).rows||{}).values||[]).length)}catch(e){console.log('pk1.len=parse-fail')}" "$P1" 2>/dev/null)
P2=$(cygpath -m /tmp/lvh-pk2.json)
curl -s -m 60 -X POST "$BASE/api/av/getAttributeViewPrimaryKeyValues" -H "Authorization: Token $TOKEN" -H "Content-Type: application/json" -d "{\"id\":\"$AV\",\"page\":2,\"pageSize\":200}" -o "$P2"
PK2=$(node -e "try{const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));const a=(((d.data||{}).rows||{}).values||[]).map(v=>v.id);console.log('pk2.len='+a.length)}catch(e){console.log('pk2.len=parse-fail')}" "$P2" 2>/dev/null)
OVERLAP=$(node -e "try{const f=p=>JSON.parse(require('fs').readFileSync(p,'utf8')).data.rows.values.map(v=>v.id);const a=f(process.argv[1]),b=f(process.argv[2]);console.log('overlap='+a.filter(x=>b.includes(x)).length)}catch(e){console.log('overlap=?')}" "$P1" "$P2" 2>/dev/null)
echo "pk: $PK1 $PK2 $OVERLAP" >> "$LOG"

# 8) asset 上传（multipart；MSYS 禁转换下 curl 需 Windows 路径）
echo "lvh-e2e-upload-test" > /tmp/lvh-upload-test.txt
TMPW=$(cygpath -w /tmp/lvh-upload-test.txt 2>/dev/null || echo /tmp/lvh-upload-test.txt)
UP=$(curl -s -m 15 -X POST "$BASE/api/asset/upload" -H "Authorization: Token $TOKEN" -F "file[]=@$TMPW" 2>>"$LOG")
echo "upload: $(echo "$UP" | grep -o '"code":[0-9-]*' | head -1) $(echo "$UP" | grep -o '"path":"[^"]*"' | head -1)" >> "$LOG"

# 9) 清理：removeDocByID 可用（removeDoc(path) 报 block not found，2026-10-04 实测）；
#    包装器对 HIGH 不可逆操作要求 -y（对象是本脚本自建的测试文档）
sleep 3
"$sy" /api/filetree/removeDocByID -y -d "{\"id\":\"$DOC\"}" >> "$LOG" 2>&1
# 9.1) 测试笔记本一并移除（约定：结束时不留任何临时笔记本；对象是本脚本自建的 siyuan-home-smoke- 前缀库）
"$sy" /api/notebook/removeNotebook -y -d "{\"notebook\":\"$NB\"}" >> "$LOG" 2>&1
LEFT=$("$sy" /api/notebook/lsNotebooks -d '{}' 2>/dev/null | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));const l=(d.data&&d.data.notebooks)||(d.notebooks)||[];console.log(l.filter(n=>n.name.startsWith('siyuan-home-smoke-')).length)}catch(e){console.log('?')}")
echo "temp notebooks left: $LEFT (expect 0)" >> "$LOG"
echo "=== $(date '+%H:%M:%S') done" >> "$LOG"
echo "RESULT: render 行 rowCount vs rows.len——不相等即默认分页成立（250 行只回 50）；pk 应 200+50 且 overlap=0（循环终止条件成立）" >> "$LOG"
