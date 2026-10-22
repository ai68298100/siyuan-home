# v0.5.41 · 小驴管家（内测版）全面接入思源官方命令面板（Command Palette），成套注册快速记录/全景检索/提醒/台账核心指令

## 变更

- **顶栏保持单一纯净入口**：顶栏保留唯一的 `siyuan-home-topbar` 图标，左键直达主面板，右键呼出快捷菜单，绝不冗余占用顶栏空间；
- **全面接入思源官方命令面板（Command Palette）**：
  - 将管家全部高频核心操作成套注册至思源官方命令面板（按下 `Ctrl+P` 即可随搜随用）：
    1. `小驴管家：打开主面板` (Ctrl+Alt+H)
    2. `小驴管家：快速记录流水/便签` (Ctrl+Alt+N)
    3. `小驴管家：全景生活检索 (Spotlight)` (Ctrl+Alt+F)
    4. `小驴管家：到期提醒中枢` (Ctrl+Alt+R)
    5. `小驴管家：家庭台账列表` (Ctrl+Alt+L)
    6. `小驴管家：家庭急救卡与医疗资料`
    7. `小驴管家：家庭成员档案`
    8. `小驴管家：管家设置选项`
- **键盘流全场景支持**：命令面板指令与系统热键、`siyuan-home:open-spotlight` / `siyuan-home:open-emergency` 事件完全联动。

## 验证

- 90 个测试文件，**791 项单测全部通过**（0 失败）。
- `tsc` 类型检查、Svelte 5 诊断（0 错误 0 警告）、i18n 1946 键严格对齐。
- 元数据校验与 `pnpm audit` 全部通过。
- 生产构建与 `smoke-test`、思源加载器语义测试（`verify-loader-semantics`）全部绿灯。

完整变更细节见 [CHANGELOG.md](./CHANGELOG.md)。
