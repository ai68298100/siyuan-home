/**
 * 同键通知合并（17 组通知防轰炸的适配版）：
 * 宿主 showMessage 无"关闭最旧"句柄（单例队列 MAX=5 不可行），
 * 以同键时间窗抑制代替——连续重试/批量动作场景不重复轰炸。
 */
const DEFAULT_WINDOW_MS = 60_000;
const lastShown = new Map<string, number>();

/** 同键消息在窗口期内只弹一次；返回是否实际弹出（供测试与调用方感知） */
export function coalescedNotify(
    key: string,
    show: () => void,
    now = Date.now(),
    windowMs = DEFAULT_WINDOW_MS,
): boolean {
    const last = lastShown.get(key) ?? 0;
    if (now - last < windowMs) return false;
    lastShown.set(key, now);
    show();
    return true;
}

/** 测试隔离用：清空抑制记录 */
export function resetNotifyState(): void {
    lastShown.clear();
}
