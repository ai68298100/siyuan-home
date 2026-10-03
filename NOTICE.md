# 第三方组件与数据声明（NOTICE）

本插件（小驴管家 / Lv Home，MIT 许可）使用的第三方数据与组件如下。组件许可清单随依赖变更维护于 `package.json`；`pnpm audit` 纳入检查链。

## WHO Child Growth Standards（儿童生长标准数据）

- **来源**：WHO Child Growth Standards (2006) 官方 LMS 参数表（www.who.int / cdn.who.int，weight-for-age 与 length-height-for-age 的月粒度与 0–13 周周粒度 z-score 表）。
- **许可**：CC BY-NC 3.0 IGO——要求署名，非商用。
- **使用方式**：构建期由 `scripts/fetch-who-data.mjs` 下载官方 xlsx 并转换为 `src/core/data/who-refs.ts`（P3/P15/P50/P85/P97 百分位带与 L/M/S 原参数）；运行时零网络、离线可用。
- **展示署名**：生长曲线图注标明 "WHO 儿童生长标准 (2006)，© WHO，CC BY-NC 3.0 IGO（署名，非商用）"。
- **免责声明**：图注同时声明"仅供家庭参考，不构成医疗建议；生长评估请咨询专业医师"。
- 依据许可条款明确声明：**WHO 不为本插件及其数据的任何使用背书**。
