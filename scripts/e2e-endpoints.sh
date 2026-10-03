#!/usr/bin/env bash
# LVH 端点实测（后台自动）：等"本工作区"内核稳定 → 建测试库 → 150 行 → render/PK 分页验证 → asset 上传 → 清理
# 用法：bash scripts/e2e-endpoints.sh   （结果写 /tmp/lvh-e2e.log；总时长上限 ~9 分钟）
# 背景（2026-10-04）：实例被多插件会话共用并切换工作区——token 只对本工作区有效，
# 所以稳定判定用【带鉴权探测】（lsNotebooks），正确拒绝外来工作区（version 端点免鉴权，不能作判据）。
LOG=/tmp/lvh-e2e.log
sy="C:\Users\sunku\.zcode\skills\siyuan-kernel-api\scripts\sy"
TOKEN=$(grep SIYUAN_TOKEN "$APPDATA/siyuan/env" | cut -d= -f2)
BASE=http://127.0.0.1:6806
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

# 2) 测试笔记本（幂等）
NB=$("$sy" sql "SELECT id FROM notebooks WHERE name='LVH-端点实测' AND closed=false" -q '.[0].id' 2>/dev/null)
if [ -z "$NB" ]; then
  "$sy" /api/notebook/createNotebook -d '{"name":"LVH-端点实测"}' >> "$LOG" 2>&1
  NB=$("$sy" sql "SELECT id FROM notebooks WHERE name='LVH-端点实测'" -q '.[0].id' 2>/dev/null)
  [ -n "$NB" ] && "$sy" /api/notebook/openNotebook -d "{\"notebook\":\"$NB\"}" >> "$LOG" 2>&1
fi
[ -n "$NB" ] || { echo "RESULT: no notebook" >> "$LOG"; exit 1; }
echo "notebook=$NB" >> "$LOG"

# 3) 测试文档 + AV（div 占位 → renderAttributeView createIfNotExist 实体化，与 provisioner 同路径）
TS=$(date +%s)
DOC=$("$sy" /api/filetree/createDocWithMd -d "{\"notebook\":\"$NB\",\"path\":\"/render-分页实测-$TS\",\"markdown\":\"# t\"}" 2>/dev/null)
[ -n "$DOC" ] || { echo "RESULT: no doc" >> "$LOG"; exit 1; }
echo "doc=$DOC" >> "$LOG"
"$sy" /api/block/insertBlock -d "{\"dataType\":\"markdown\",\"data\":\"<div data-type=\\\"NodeAttributeView\\\" data-av-id=\\\"lvh-av-$TS\\\" data-av-type=\\\"table\\\"></div>\",\"parentID\":\"$DOC\"}" >> "$LOG" 2>&1
sleep 2
AV=$("$sy" sql "SELECT id FROM blocks WHERE type='av' AND markdown LIKE '%lvh-av-$TS%' LIMIT 1" -q '.[0].id' 2>/dev/null)
[ -n "$AV" ] || { echo "RESULT: no av block" >> "$LOG"; exit 1; }
echo "av=$AV" >> "$LOG"
"$sy" /api/av/renderAttributeView -d "{\"id\":\"$AV\",\"createIfNotExist\":true}" >> "$LOG" 2>&1

# 4) 加一列 text
"$sy" /api/av/addAttributeViewColumn -d "{\"avID\":\"$AV\",\"keyID\":\"$(date +%Y%m%d%H%M%S)-xxxxxx\",\"keyIcon\":\"\",\"keyName\":\"备注\",\"keyType\":\"text\",\"previousKeyID\":\"\"}" >> "$LOG" 2>&1

# 5) 加 150 行（5 批 × 30 detached）
ADDED=0
for batch in 0 1 2 3 4; do
  SRCS=""
  for j in $(seq 1 30); do
    n=$((batch*30+j))
    SRCS="$SRCS{\"content\":\"行$n\",\"isDetached\":true},"
  done
  SRCS=${SRCS%,}
  RESP=$("$sy" /api/av/addAttributeViewBlocks -d "{\"avID\":\"$AV\",\"srcs\":[$SRCS]}" 2>/dev/null)
  RC=$(echo "$RESP" | grep -o '"code":[0-9-]*' | head -1)
  ADDED=$((ADDED+30))
  echo "batch$batch: $RC" >> "$LOG"
  sleep 1
done
echo "added=$ADDED" >> "$LOG"
sleep 2

# 6) render 分页验证（[待实测] 核心：rowCount vs 实际返回行数）
RENDER=$("$sy" /api/av/renderAttributeView -d "{\"id\":\"$AV\"}" --max 200000 2>/dev/null)
RCOUNT=$(echo "$RENDER" | grep -o '"rowCount":[0-9]*' | head -1)
RLEN=$(node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('rows.len='+((d.data&&d.data.view&&d.data.view.rows)?d.data.view.rows.length:'?'))}catch(e){console.log('rows.len=parse-fail')}" <<< "$RENDER" 2>/dev/null)
echo "render: $RCOUNT $RLEN" >> "$LOG"

# 7) PK 分页验证
PK=$("$sy" /api/av/getAttributeViewPrimaryKeyValues -d "{\"id\":\"$AV\",\"pageSize\":200}" --max 200000 2>/dev/null)
PKLEN=$(node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));const a=(d.data&&d.data.rows&&d.data.rows.values)?d.data.rows.values:[];console.log('pk.len='+a.length)}catch(e){console.log('pk.len=parse-fail')}" <<< "$PK" 2>/dev/null)
echo "pk: $PKLEN" >> "$LOG"

# 8) asset 上传（skill 认可的 curl 例外，multipart）
echo "lvh-e2e-upload-test" > /tmp/lvh-upload-test.txt
UP=$(curl -s -m 15 -X POST "$BASE/api/asset/upload" -H "Authorization: Token $TOKEN" -F "file[]=@/tmp/lvh-upload-test.txt" 2>/dev/null)
echo "upload: $(echo "$UP" | head -c 200)" >> "$LOG"

# 9) 清理（删测试文档即连带删 av；笔记本保留供复用）
"$sy" /api/filetree/removeDoc -y -d "{\"notebook\":\"$NB\",\"path\":\"/render-分页实测-$TS\"}" >> "$LOG" 2>&1
echo "=== $(date '+%H:%M:%S') done" >> "$LOG"
echo "RESULT: 见上方 render 行——rowCount 与 rows.len 一致=不分页（150 全量返回）；不一致=有分页" >> "$LOG"
