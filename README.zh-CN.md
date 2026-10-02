<div align="center">

# 🏠 小驴管家 (Lv Home)

**一本会主动提醒你的家庭档案** —— 思源笔记的家庭与生活管家插件

[![CI](https://github.com/ai68298100/siyuan-home/actions/workflows/ci.yml/badge.svg)](https://github.com/ai68298100/siyuan-home/actions/workflows/ci.yml) [![Release](https://img.shields.io/github/v/release/ai68298100/siyuan-home)](https://github.com/ai68298100/siyuan-home/releases/latest) [![License](https://img.shields.io/github/license/ai68298100/siyuan-home)](./LICENSE) [![Tests](https://img.shields.io/badge/tests-33%20passing-brightgreen)](./tests)

家庭私有档案库 · 全家到期提醒中枢 · 家庭事务工作台

**[⬇️ 下载安装](https://github.com/ai68298100/siyuan-home/releases/latest)** · **[📖 使用文档](./docs/FAQ.md)** · **[🗺 路线图](./ROADMAP.md)** · **[🌐 English](./README.md)**

*本地优先 · 无遥测 · 数据不锁定*

</div>

---

## ✨ 它解决什么问题

家里的证件会过期、药品会过期、保单要续费、订阅在扣款、生日（农历）会忘记、孩子的疫苗和升学节点记不住……这些信息散落在聊天记录、备忘录和脑子里。

**小驴管家把它们收进思源笔记**：一张家庭台账 + 一个会主动提醒的中枢。

| 能力 | 说明 |
|---|---|
| ⏰ **统一到期提醒** | 证件、药品、保单、订阅、年检、生日……全部自动派生提醒，提前量按类型可配（护照提前 1 年、药品提前 30 天），逾期红色置顶 |
| 👥 **成员为一等公民** | 自己 / 配偶 / 伴侣 / 子女 / 老人 / 亲属——一切台账按人组织，一键过滤"儿子的所有事项" |
| 🗃 **31 个生活模块** | 人员档案 · 资产购物 · 生活服务 · 育儿上学 · 出行旅行 · 影音书库（下方详表） |
| 🔒 **本地优先** | 数据全在你的思源笔记里，无遥测、无网络依赖；支持笔记本共享给家人 |
| 🔗 **行即块** | 台账行是思源块，可在日记里双链引用（"妈妈的护照"能在日记中出现） |
| 🧩 **按需开启** | 未启用的模块不建库、不占界面；有子女才被建议开"育儿/上学" |

## 📦 安装（v0.2.0）

1. 从 [Releases](https://github.com/ai68298100/siyuan-home/releases/latest) 下载 `package.zip`
2. 思源笔记 → 设置 → 集市 → 下载页 → 顶部 **导入安装** 选择 zip
3. 启用插件 → 完成三步首次引导（家庭构成 → 模块推荐 → 建库）
4. 随时按 `Ctrl+Alt+H` 打开管家面板

> 家庭共用：用思源"协作"把台账笔记本共享给家人即可，零额外设置。
> 隐私与常见问题：[隐私声明](./docs/privacy.md) · [FAQ](./docs/FAQ.md)

## 🧩 模块总览（6 组 31 模块）

<details open>
<summary><b>人员档案</b> —— 家庭成员（常开）· 证件管理 · 病历与健康 · 社保医保 · 保险管理 · 考证管理 · 宠物档案</summary>

证件效期规则化提醒（护照 1 年/驾驶证 90 天/签注另计）、体检与疫苗本、退休倒计时、保单台账、证书复审周期、宠物驱虫
</details>

<details open>
<summary><b>资产购物</b> —— 实物资产 · 虚拟资产 · 购物记录 · 会员与订阅 · 合同与文件</summary>

家具/家电/数码/玩具位置层级与保修跟踪、账号资产与密码位置索引（不存密码）、快递单号与取件码、储值卡余额、合同到期
</details>

<details open>
<summary><b>生活服务</b> —— 家庭药箱 · 囤货库存 · 礼尚往来 · 家务周期 · 餐饮 · 地址 · 网址 · 常用语 · 房屋与日程</summary>

药品效期+余量、囤货低库存、人情往来按人净额、周期家务、菜谱与忌口、缴费日与农历纪念日、应急物资清单
</details>

<details open>
<summary><b>育儿上学</b> —— 育儿管理 · 上学管理（幼儿园→大学）· 零花钱与压岁钱</summary>

国家免疫规划程序表（22 剂）、成长记录、学段与升学节点、学费缴费、压岁钱多账户
</details>

<details open>
<summary><b>出行旅行</b> —— 车辆 · 交通卡证 · 旅行计划 · 预订单据 · 行前清单 · 足迹</summary>

保养年检保险电池四类提醒、行程时间线、凭证归档、行前证件自查
</details>

<details open>
<summary><b>影音书库</b> —— 电影 / 电视剧 / 综艺 / 书籍 / 漫画 / 小说</summary>

想看/在看/看完状态机、评分进度、来源链接
</details>

> 🧮 **模块按需开启**：未启用的模块不建库、不出现在界面。全部 31 模块均为 schema 驱动——启用即自动建库并入提醒中枢。完整清单见 [MODULES.md](./MODULES.md)。

## 🚫 明确不做

记账流水 · 密码库 · 官方数据对接（违章/保单/社保余额） · 实时出行信息 · 条码出示 · 在线问诊 · 媒体在线播放

> 小驴管家只做**台账 + 提醒 + 归档**层——专业的事交给专业应用。

## 🗺 路线图

| 阶段 | 内容 |
|---|---|
| ✅ v0.2.0（当前） | 31 模块建库 · 提醒中枢 · Tab 四屏 · 引导向导 · 诊断区 |
| 🔜 v0.3 | 日历视图（思源原生）、Webhook 推手机、智能日期解析、QR 标签打印 |
| 🔭 远期 | 家庭共享协作、模板包分享、家庭年报、AI 能力 |

完整计划：[ROADMAP.md](./ROADMAP.md)

## 🤝 生态

与小驴系列插件联动：**打卡**（数值记录）、**人脉**（师傅/老师/医生联系人）、**快切**（网址/常用语注入）、**拾遗**（剪藏归档）。

## 🛠 开发

```bash
pnpm install
pnpm run dev      # 开发（app + kernel 双目标 watch）
pnpm run build    # 构建 dist/ + package.zip
pnpm run check    # 五重门禁（types + svelte + i18n + meta + smoke）
pnpm test         # 单元测试（33 个）
```

- 环境与约定：[CONTRIBUTING.md](./CONTRIBUTING.md)
- 发布包质量：CI 自动执行 check/test/build/smoke/体积门禁
- 回归清单：[docs/testing/v0.2.md](./docs/testing/v0.2.md)

## 📚 文档

| 类别 | 文档 |
|---|---|
| 使用 | [FAQ](./docs/FAQ.md) · [隐私声明](./docs/privacy.md) · [迁移指南](./docs/migration.md) |
| 设计 | [01 架构](./docs/design/01-架构总览.md) · [02 数据模型](./docs/design/02-数据模型与模块规格.md) · [03 提醒中枢](./docs/design/03-提醒中枢.md) · [04 交互原型](./docs/design/04-交互与UI原型.md) · [05 扩展](./docs/design/05-扩展设计.md) · [07 视觉](./docs/design/07-视觉设计语言.md) · [索引](./docs/design/00-index.md) |
| 交互原型 | [prototype/index.html](./prototype/index.html)（浏览器打开，明暗主题七屏 + 组件库样式指南） |

## License

[MIT](./LICENSE)

<div align="center">

*从一张证件开始，让家事不再依赖记性。*

</div>

---

### 🌐 English

**Lv Home** — a family & life butler plugin for SiYuan notes. 31 schema-driven ledgers (certificates, medicine, insurance, subscriptions, schooling, travel, media…), one unified expiry reminder hub, member-centric organization, local-first & zero telemetry. See [中文文档](./README.zh-CN.md) for the full introduction; [English install](#️-installation-v020).
