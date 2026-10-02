/**
 * Svelte 错误边界（32 组）：单屏崩溃不拖垮整个管家面板。
 * 用法：包裹 tab-panel 中的每个 <main> 子组件。
 * Svelte 5 没有 built-in error boundary，用 onErrorDescribe + 条件渲染实现。
 * 注意：只捕获渲染期错误，不捕获事件处理器/onMount 中的异常（Svelte 5 设计）。
 */

// 由于 Svelte 5 不提供声明式 error boundary 组件，
// 采用 svelte:boundary（Svelte 5.3+）或降级为手工 try-catch 包装。
// 这里提供安全的模块初始化工具：如果组件导入/初始化失败，显示降级 UI。

import type { Component } from "svelte";
import { mount, unmount } from "svelte";

export interface SafeMountOptions<T> {
    target: HTMLElement;
    props: T;
    /** 渲染失败时在 target 中显示降级 HTML */
    fallbackHtml: string;
}

/**
 * 安全挂载 Svelte 组件：初始化异常时用降级 HTML 替代，不抛到调用方。
 * 返回 unmount 函数（失败时返回 cleanup fallback 的空函数）。
 */
export function safeMount<T extends Record<string, unknown>>(
    component: Component<T>,
    options: SafeMountOptions<T>,
): () => void {
    try {
        const unmountFn = mount(component, { target: options.target, props: options.props });
        return () => { try { unmount(unmountFn); } catch { /* already unmounted */ } };
    } catch (e) {
        console.error("[siyuan-home] component mount failed:", e);
        options.target.innerHTML = options.fallbackHtml;
        return () => { options.target.innerHTML = ""; };
    }
}
