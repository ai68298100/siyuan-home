/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @FilePath     : /src/libs/dialog.ts
 * @Description  : Dialog kits（204 波循环 A 清除死导出：inputDialog/inputDialogSync/
 *                 confirmDialog/confirmDialogSync 零调用移除——仅保留在用的
 *                 simpleDialog + svelteDialog；确认类交互统一走 siyuan confirm()）
 */
import { Dialog } from "siyuan";
import { Component, mount, unmount } from "svelte";

export const simpleDialog = (args: {
    title: string, ele: HTMLElement | DocumentFragment,
    width?: string, height?: string,
    callback?: () => void;
}) => {
    const dialog = new Dialog({
        title: args.title,
        content: `<div class="dialog-content" style="display: flex; height: 100%;"/>`,
        width: args.width,
        height: args.height,
        destroyCallback: args.callback
    });
    dialog.element.querySelector(".dialog-content").appendChild(args.ele);
    return {
        dialog,
        close: dialog.destroy.bind(dialog)
    };
}

export const svelteDialog = (args: {
    title: string,
    component: Component<any>, // Svelte 5 component constructor
    props?: Record<string, any>,
    width?: string,
    height?: string,
    callback?: () => void;
}) => {
    let container = document.createElement('div')
    container.style.display = 'contents';

    // 内部处理 mount
    let componentInstance = mount(args.component, {
        target: container,
        props: args.props || {}
    });

    const { dialog, close } = simpleDialog({
        ...args,
        ele: container,
        callback: () => {
            // 内部处理 unmount
            unmount(componentInstance);
            if (args.callback) args.callback();
        }
    });

    return {
        component: componentInstance,
        dialog,
        close
    }
}
