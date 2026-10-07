# 真机批执行手册（Device Batch Runbook）

> 一页编排：把散在 §7/§7.7/§8/B 类/UG 的真机验证按执行顺序串起来。**详细清单以链接为准，本文不复制**。
> 编制：2026-10-07（v0.3.9）；下表只描述需要复核的前置条件，不把历史实例结果当作当前证据。
> **一键预检**：在 Git Bash 中运行 `bash scripts/device-batch-preflight.sh`——核对工作区、凭据、dist 部署、插件启用、兄弟插件和首启状态；它不替代 Android/独立窗口的人机验收。

## 执行前必须准备

1. 一台隔离的 SiYuan 靶场实例（不要把写型脚本直打日常工作区），并取得该实例的 API token。Git Bash 中设置 `SIYUAN_URL`、`SIYUAN_TOKEN`，或通过 `SIYUAN_CONF` 指向包含这两个变量的 env 文件；不能只提供桌面浏览器登录态或授权码。
2. Windows Git Bash、Node.js 24、pnpm 12、`curl`、`node`、`sha256sum`，以及 kernel-api skill 的 `sy` 包装器。若包装器不在默认路径，设置 `SIYUAN_SY=/path/to/sy`。
3. 运行浏览器版独立 e2e 还需要安装 Playwright 依赖和 Edge；靶场地址必须显式传给脚本：`TEST_WS_URL="$SIYUAN_URL" SIYUAN_TOKEN="$SIYUAN_TOKEN" pnpm run e2e:device`。该脚本只覆盖 Chromium/Android UA 模拟，不能作为 Android WebView 通过证据。
4. 阶段 5 需要实际安装并启用 `siyuan-checkin`、`siyuan-contacts`、`siyuan-glean`、`siyuan-exam`；阶段 6 的 S7 需要第二台设备或同一工作区的第二个独立前端会话。

## 前置状态（2026-10-07，执行时复核）

| 项 | 状态 |
|---|---|
| 构建部署 | 待执行 `pnpm run build` 后，用预检对 `/data/plugins/siyuan-home/` 下 dist 全部文件做字节校验 |
| 工作区 | 待用 `SIYUAN_URL`/`SIYUAN_TOKEN` 运行鉴权探活；当前工作区结果不能从历史记录推断 |
| 端点脚本 | 待在同一隔离靶场运行 `bash scripts/e2e-endpoints.sh`；它会创建并删除临时笔记本 |
| 兄弟插件 | 待预检确认四个插件目录和 desktop petals；缺失时阶段 5 不可执行 |
| 插件运行时 | 由预检读取 `settings.json` 状态；不存在才执行首启向导，存在则改为恢复/复核路径 |

## 执行顺序

### 阶段 1 · 首启与引导（~15 分钟）
1. 前端打开思源 → 启用小驴管家 → **onboarding 向导走完**（角色预选/推荐模块/建库 loading/直达证件快速录入；skip 路径另开一次面板验证容错）
2. 设置 → 关于 → 深度健康检查：全模块"已入库"无缺列
3. 对照 [§7.1 引导与建库](v0.2.md)

### 阶段 2 · 新特性验收（§7.7，12 项，~40 分钟）
时间线四类/换证链/模板生成（注意 G2 落点确认框）/处方→药箱/购入→囤货/生长曲线（WHO 带 + 性别选择器 + 点位 P 值悬停 + 周粒度）/同名确认（D24）/农历 🌙/name 必填——逐项见 [§7.7](v0.2.md)。
**顺带观察**：G5 生长数值单位（有否 m/斤 误录案例，定合理性提示阈值）。

### 阶段 3 · 遗留回归（§7，42 项，~90 分钟）
[§7 全清单](v0.2.md)。失败项按"已知问题"节记录端点实际响应形态。

### 阶段 4 · 端点与集成收尾（§8，~20 分钟）
1. 重跑 `bash scripts/e2e-endpoints.sh` 确认仍绿
2. **活体集成测试**（177 波新增）：先用严格门禁 `pnpm test:live`（缺凭据/不可达/401/429 会阻断），或在明确接受可选跳过语义时运行 `bash scripts/e2e-core.sh`——插件自己的 core 代码路径（provisioner 语义/D01 分页/D02 行确认/删行/CertsProvider 真实派生/健康检查）打真实内核；数据专用笔记本自清理
3. IT-04（renderLedger rows==rowCount，≤50 行时）、IT-08（用户视图筛选影响）——见 [§8 清单](v0.2.md)

### 阶段 5 · B 类兄弟互测（EC30，~45 分钟）
- **checkin**：打卡后管家摘要更新（EC09 绑定×强度）
- **contacts**：人脉选人/绑定/交集记录（EC13/EC16 桥）
- **glean**：雷切动作注册与注销（EC10）
- **exam**：lv-exam:stats 聚合展示（EC21）
- 全部走 `window.LvHome` 桥与事件订阅，[契约](../BRIDGE.md)

### 阶段 6 · 设备批研究项（~60 分钟，可与日常使用并行数日）
- **S6 前端调度实测**（R3）：休眠/唤醒、后台/锁屏、跨天及重复扫描行为记录（自动补扫/静默时段表现）——kernel 无计时器方案已定案，实测只为记录
- **S7 双端冲突**（R6，需第二台设备或同工作空间双开）：两设备同时编辑同一行 → 提醒写回幂等、冲突提示与恢复
- **UG05** 检索可发现性：搜索/筛选命中与空态解释
- **UG07** 低端设备能耗：移动 WebView 前后台、锁屏、长列表帧率（与 S6 同场景可并测）
- **UG09** 教育可测试性：找非技术家人按指南完成一次录入，记录卡点
- **PL24** 演示数据：示例生成→截图（标注版本/合成资料）→一键清除→恢复验证

## 收尾

1. 结果回填 [docs/testing/v0.2.md](v0.2.md)（勾选 + 已知问题节）
2. TODO 对应条目勾选 + 轮次日志行
3. **发版触发**：全绿后按 D18 另议（管线已彩排就绪：release-notes/check-meta/update_version）
