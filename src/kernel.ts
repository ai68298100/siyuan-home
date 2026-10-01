import type * as kernel from "siyuan/kernel";

// 小驴管家内核插件（v0.1 暂无常驻任务；预留将来到期扫描 / 多端 broadcast 入口）
const api: kernel.ISiyuan = siyuan;

api.plugin.lifecycle.onload = async () => {
    await api.logger.info(`[${api.plugin.name}] Lv Home kernel plugin loaded`);
};

api.plugin.lifecycle.onrunning = async () => {
    // 常驻阶段暂无工作
};

api.plugin.lifecycle.onunload = async () => {
    await api.logger.info(`[${api.plugin.name}] Lv Home kernel plugin unloaded`);
};
