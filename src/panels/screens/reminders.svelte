<script lang="ts">
    import { Dialog, Menu, showMessage, confirm } from "siyuan";
    import { onDestroy } from "svelte";
    import { fade } from "svelte/transition";
    import type { HomePluginLike } from "@/types/plugin";
    import { removeCaptureDraft, saveRuntime, upsertNamedView, deleteNamedView, setPlanDate, type CaptureDraft, type HubNamedView } from "@/core/hub/runtime";
    import { escapeHtml } from "@/core/escape";
    import { buildDisplay as display } from "@/core/hub/display";
    import { relativeDue, weekdayKey, localDateKey } from "@/core/hub/rule";
    import { addDetachedRow, setCell } from "@/core/siyuan";
    import { provisionModule } from "@/core/provisioner";
    import { toggleMemoPin } from "@/core/hub/actions";
    import Calendar from "@/panels/screens/calendar.svelte";
    import UiIcon from "@/ui/icon.svelte";
    import { moduleUiIcon } from "@/ui/icons";
    import { memberHue } from "@/core/format";
    import type { Reminder } from "@/types";
    let { plugin, t, version, onCapture }: { plugin: HomePluginLike; t: (k: string) => string; version?: number; onCapture?: (moduleId?: string) => void } = $props();

    const captureDrafts = $derived.by(() => {
        void version;
        return plugin.runtime.captureDrafts ?? [];
    });

    function captureDraftLabel(moduleId: string): string {
        const key = `module.${moduleId}`;
        return t(key) !== key ? t(key) : moduleId;
    }

    function discardCaptureDraft(draft: CaptureDraft) {
        confirm(
            t("capture.recoveryDiscardConfirm").replace("${module}", captureDraftLabel(draft.moduleId)),
            t("capture.recoveryDiscardBody"),
            async () => {
                plugin.runtime.captureDrafts = removeCaptureDraft(plugin.runtime.captureDrafts, draft.id);
                plugin.hubListeners.forEach((listener) => listener());
                try {
                    await saveRuntime(plugin, plugin.runtime);
                    showMessage(t("capture.recoveryDiscarded"), 3000, "info");
                } catch (error) {
                    showMessage(String(error), 5000, "error");
                }
            },
        );
    }

    // UIX-06 / §17 智能筛选命名视图（滴答清单智能清单印证）
    const namedViews = $derived.by(() => {
        void version;
        return plugin.runtime.hubNamedViews ?? [];
    });

    function applyNamedView(v: HubNamedView) {
        filter = v.filter ?? "all";
        filterMember = v.memberId;
        filterModule = v.moduleId;
        dueWithin = v.dueWithin ?? "all";
        pruneSelection();
        void persistFilter();
    }

    function isNamedViewActive(v: HubNamedView): boolean {
        return (v.filter ?? "all") === filter &&
            v.memberId === filterMember &&
            v.moduleId === filterModule &&
            (v.dueWithin ?? "all") === dueWithin;
    }

    function openSaveViewDialog() {
        const dlg = new Dialog({
            title: t("hub.saveView"),
            content: `
                <div class="b3-dialog__content">
                    <label class="fn__flex" style="flex-direction:column;gap:8px">
                        <span class="ft__on-surface">${t("hub.viewName")}</span>
                        <input id="lv-view-name-input" class="b3-text-field" placeholder="${t("hub.viewNamePlaceholder")}" style="width:100%" />
                    </label>
                </div>
                <div class="b3-dialog__action">
                    <button class="b3-button b3-button--cancel" id="lv-view-cancel">${t("cancel")}</button>
                    <button class="b3-button b3-button--text" id="lv-view-confirm">${t("confirm")}</button>
                </div>
            `,
            width: "360px",
        });
        const input = dlg.element.querySelector("#lv-view-name-input") as HTMLInputElement;
        const cancelBtn = dlg.element.querySelector("#lv-view-cancel") as HTMLButtonElement;
        const confirmBtn = dlg.element.querySelector("#lv-view-confirm") as HTMLButtonElement;
        cancelBtn.onclick = () => dlg.destroy();
        confirmBtn.onclick = async () => {
            const name = input.value.trim();
            if (!name) {
                input.focus();
                return;
            }
            plugin.runtime.hubNamedViews = upsertNamedView(plugin.runtime.hubNamedViews, {
                name,
                filter,
                memberId: filterMember,
                moduleId: filterModule,
                dueWithin,
            });
            dlg.destroy();
            try {
                await saveRuntime(plugin, plugin.runtime);
                showMessage(t("hub.viewSaved").replace("${name}", name), 3000, "info");
            } catch (e) {
                showMessage(String(e), 5000, "error");
            }
        };
        setTimeout(() => input?.focus(), 50);
    }

    function handleDeleteView(v: HubNamedView, e: Event) {
        e.stopPropagation();
        confirm(t("hub.deleteViewConfirm").replace("${name}", v.name), "", async () => {
            plugin.runtime.hubNamedViews = deleteNamedView(plugin.runtime.hubNamedViews, v.id);
            try {
                await saveRuntime(plugin, plugin.runtime);
                showMessage(t("hub.viewDeleted"), 2500, "info");
            } catch (e) {
                showMessage(String(e), 5000, "error");
            }
        });
    }

    // version（H02）：hub 变更时递增，驱动派生重算（plugin.* 为普通对象引用）
    const all = $derived.by(() => {
        void version;
        return plugin.scan?.reminders ?? [];
    });
    const overdueCount = $derived(all.filter((r: Reminder) => r.level === "overdue").length);
    const permissionDenied = $derived((plugin.scan?.errors ?? []).some((error) => error.moduleId === "permission"));
    // C3d：筛选持久化（runtime.hubFilter）——初始快照为设计意图
    // svelte-ignore state_referenced_locally
    let filter = $state(plugin.runtime.hubFilter ?? "all");
    // C3a 成员/模块筛选（H16：成员删除后由成员页复位持久化值；本地 $state 驱动，runtime 只作持久化）
    // svelte-ignore state_referenced_locally
    let filterMember = $state<string | undefined>(plugin.runtime.hubMemberId);
    // svelte-ignore state_referenced_locally
    let filterModule = $state<string | undefined>(plugin.runtime.hubModuleId);
    // C3a 时间窗：all=不限 / 0=今天 / 7 / 30（含逾期）
    // svelte-ignore state_referenced_locally
    let dueWithin = $state<string>(plugin.runtime.hubDueWithin ?? "all");
    const memberOptions = $derived.by(() => {
        void version;
        return plugin.settings.members ?? [];
    });
    const moduleOptions = $derived.by(() => {
        void version;
        return [...new Set([
            ...(plugin.scan?.reminders ?? []).map((r: Reminder) => r.moduleId),
            ...(plugin.listHandled?.() ?? []).map((entry) => entry.moduleId).filter(Boolean),
        ])];
    });
    // 262 波（Todoist/Linear assignee avatar 语言）：行级成员微头像
    const memberOf = (id: string | undefined) => (id ? (memberOptions ?? []).find((m) => m.id === id) : undefined);
    async function persistFilter() {
        plugin.runtime.hubFilter = filter;
        plugin.runtime.hubMemberId = filterMember;
        plugin.runtime.hubModuleId = filterModule;
        plugin.runtime.hubDueWithin = dueWithin;
        try {
            await saveRuntime(plugin, plugin.runtime);
        } catch (e) {
            showMessage(t("hub.filterSaveFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        }
    }
    const filtered = $derived.by(() => {
        const level = filter;
        let list = level === "all" ? all : level === "handled" ? [] : all.filter((r: Reminder) => r.level === level);
        if (filterMember) list = list.filter((r: Reminder) => !r.memberId || r.memberId === filterMember);
        if (filterModule) list = list.filter((r: Reminder) => r.moduleId === filterModule);
        if (dueWithin !== "all") {
            // 时间窗含逾期：dueDate ≤ 今天+N（yyyy-MM-dd 字符串比较安全；逾期恒在窗内）
            const today = new Date();
            const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + Number(dueWithin));
            const endKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
            list = list.filter((r: Reminder) => r.dueDate <= endKey);
        }
        return list;
    });
    // Index the scan once so handled filtering does not repeatedly scan the
    // complete derived cache for every archived entry (O(n*m) on large hubs).
    const reminderById = $derived.by(() => {
        void version;
        const map = new Map<string, Reminder>();
        for (const reminder of plugin.runtime?.cache?.derived ?? []) map.set(reminder.id, reminder);
        return map;
    });
    // 225 波：行级级别徽章撤除（级别由色轨+右侧相对时间大字承载，避免重复）——levelBadge 随之移除

    // UG11 v1：提醒导出 .ics（当前筛选为范围；G1 同款——含高后果模块先点名确认）
    const HIGH_CONSEQUENCE_MODULES = new Set(["health", "parenting", "certs", "insurance", "assets-real", "assets-virtual", "contracts", "medicine", "schooling"]);
    let exportingIcs = $state(false);
    function exportIcs() {
        const list = filtered;
        if (list.length === 0) { showMessage(t("hub.icsEmpty"), 3000, "error"); return; }
        const download = async () => {
            if (exportingIcs) return;
            exportingIcs = true;
            try {
                const { buildIcs } = await import("@/core/ics");
                const events = list.map((r: Reminder) => ({
                    uid: `${r.id}@lvhome.local`,
                    date: r.dueDate,
                    summary: r.title, // 用户确认后才导出；文件保管责任由确认框声明
                    description: r.moduleId === "adhoc" ? t("adhoc.name") : (t(`module.${r.moduleId}`) !== `module.${r.moduleId}` ? t(`module.${r.moduleId}`) : r.moduleId),
                }));
                const ics = buildIcs(t("hub.title"), events);
                const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `lvhome-reminders-${new Date().toISOString().slice(0, 10)}.ics`;
                a.click();
                URL.revokeObjectURL(a.href);
                showMessage(t("hub.icsDone").replace("${n}", String(list.length)), 3000, "info");
            } catch (e) {
                showMessage(t("hub.icsFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
            } finally {
                exportingIcs = false;
            }
        };
        if (list.some((r: Reminder) => HIGH_CONSEQUENCE_MODULES.has(r.moduleId))) {
            confirm(t("hub.icsTitle"), t("hub.icsBody").replace("${n}", String(list.length)), () => { void download(); });
            return;
        }
        void download();
    }
    // H07：已处理视图真实数据源（runtime 留痕 + 缓存派生列表回查标题）
    const handledEntries = $derived.by(() => {
        void version;
        return plugin.listHandled?.() ?? [];
    });
    const handledFiltered = $derived.by(() => {
        let list = handledEntries;
        if (filterMember) {
            list = list.filter((entry) => {
                const reminder = reminderById.get(entry.id);
                // 运行态留痕可能比派生缓存更久（模块扫描失败、历史行删除或缓存迁移时尤甚）。
                // 无法确认成员归属时保留条目，避免用户在成员筛选下误以为已处理记录丢失。
                return !reminder || !reminder.memberId || reminder.memberId === filterMember;
            });
        }
        if (filterModule) list = list.filter((entry) => entry.moduleId === filterModule);
        if (dueWithin !== "all") {
            const today = new Date();
            const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + Number(dueWithin));
            const endKey = [end.getFullYear(), String(end.getMonth() + 1).padStart(2, "0"), String(end.getDate()).padStart(2, "0")].join("-");
            list = list.filter((entry) => !!entry.dueDate && entry.dueDate <= endKey);
        }
        return list;
    });
    function changeFilter(value: string) {
        filter = value;
        if (value === "handled") clearSelection();
        pruneSelection();
        void persistFilter();
    }
    const kindLabel: Record<string, string> = {
        done: "hub.handledDone", muted: "hub.handledMuted",
        year: "hub.handledYear", period: "hub.handledPeriod", memo: "hub.handledMemo",
    };
    async function restoreEntry(id: string) {
        await runReminderAction(async () => {
            await plugin.restore(id);
            showMessage(t("hub.restoreDone"), 3000, "info");
        }, id);
    }

    function confirmDeleteHandledMemo(id: string, title: string) {
        confirm(t("delete"), t("hub.memoDeleteBody").replace("${title}", title), async () => {
            await runReminderAction(async () => {
                await plugin.removeMemo(id);
                showMessage(t("hub.memoDeleted"), 2500, "info");
            }, id);
        });
    }

    let reminderBusy = $state<Set<string>>(new Set());
    async function runReminderAction(action: () => Promise<void>, key = "global") {
        if (reminderBusy.has(key)) return;
        reminderBusy = new Set([...reminderBusy, key]);
        try { await action(); }
        catch (e) {
            showMessage(t("hub.actionFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        }
        finally {
            const next = new Set(reminderBusy);
            next.delete(key);
            reminderBusy = next;
        }
    }

    async function completeItem(r: Reminder) {
        await runReminderAction(async () => {
            await plugin.complete(r);
            plugin.showUndo?.({
                message: t("act.completed").replace("${title}", r.title),
                action: async () => {
                    await plugin.restore(r.id);
                },
            });
        }, r.id);
    }

    // H03：未处理备忘的显式删除（确认后物理删除；这是备忘唯一的物理删除路径）
    function confirmDeleteMemo(r: Reminder) {
        confirm(t("delete"), t("hub.memoDeleteBody").replace("${title}", r.title), async () => {
            await runReminderAction(async () => {
                await plugin.removeMemo(r.id);
                showMessage(t("hub.memoDeleted"), 2500, "info");
            }, r.id);
        });
    }

    // 17 组：批量操作——选择模式下逐条勾选，批量完成/延后 7 天/忽略（H01 串行队列逐条落盘）
    let batchMode = $state(false);
    // 230 波：原生日历视图切换（列表 ⇄ 日历；批量模式仅在列表生效）
    // 263 波：视图偏好持久化（runtime.hubViewMode，跨会话记忆）
    // svelte-ignore state_referenced_locally
    let viewMode = $state<"list" | "calendar">(plugin.runtime.hubViewMode ?? "list");
    function setViewMode(mode: "list" | "calendar") {
        if (viewMode === mode) return;
        viewMode = mode;
        if (mode === "calendar") clearSelection();
        plugin.runtime.hubViewMode = mode;
        saveRuntime(plugin, plugin.runtime).catch((e) => showMessage(t("hub.preferenceSaveFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error"));
    }
    let selected = $state<Set<string>>(new Set());
    let batchBusy = $state(false);
    const selectedCount = $derived(selected.size);
    function toggleSelect(id: string) {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        selected = next;
    }
    function selectAllFiltered() {
        selected = new Set(filtered.map((r: Reminder) => r.id));
    }
    function pruneSelection() {
        const visibleIds = new Set(filtered.map((r: Reminder) => r.id));
        const next = new Set([...selected].filter((id) => visibleIds.has(id)));
        if (next.size !== selected.size) selected = next;
    }
    function clearSelection() {
        selected = new Set();
        batchMode = false;
    }
    async function runBatch(kind: "done" | "snooze7" | "mute") {
        if (batchBusy || selected.size === 0) return;
        const visibleIds = new Set(filtered.map((r: Reminder) => r.id));
        selected = new Set([...selected].filter((id) => visibleIds.has(id)));
        if (selected.size === 0) {
            showMessage(t("hub.selectionNoLongerVisible"), 3500, "info");
            return;
        }
        batchBusy = true;
        try {
            const byId = new Map<string, Reminder>(all.map((r: Reminder) => [r.id, r] as [string, Reminder]));
            let ok = 0;
            const failed: string[] = [];
            // 逐条容错：单项失败不中断批量（剩余项继续处理），失败清单在回执中报告
            for (const id of selected) {
                const r = byId.get(id);
                if (!r) continue;
                try {
                    if (kind === "done") await plugin.complete(r);
                    else if (kind === "snooze7") await plugin.snooze(id, 7);
                    else await plugin.mute(id);
                    ok++;
                } catch (e) {
                    failed.push((r as any).title || id);
                    console.warn("[siyuan-home] batch item failed:", e instanceof Error ? e.message : e);
                }
            }
            if (failed.length > 0) {
                showMessage(t("hub.batchPartial").replace("${ok}", String(ok)).replace("${failed}", failed.join("、")), 7000, "error");
            } else {
                showMessage(t("hub.batchDone").replace("${n}", String(ok)), 3000, "info");
            }
            selected = new Set();
        } finally {
            batchBusy = false;
        }
    }

    // B4b 续期：思源 Dialog 小窗（H10：失败保留 Dialog 与输入、错误就地显示，不提前销毁）
    // 19 组安全：HTML 模板不插值任何用户内容——标题/条目名经 textContent 挂载，防台账文本注入
    function renewDialog(r: Reminder) {
        const dlg = new Dialog({
            title: t("act.renew"),
            content: `<div class="b3-dialog__content"><div class="b3-dialog__content" id="lv-renew-sub" style="margin-bottom:8px"></div><input class="b3-text-field fn__block" id="lv-renew-date" type="date"><div class="lv-caption" id="lv-renew-err" role="alert" style="color:var(--b3-card-error-color);display:none"></div></div>
<div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-renew-cancel">${t("cancel")}</button><button class="b3-button" id="lv-renew-ok">${t("save")}</button></div>`,
            width: "380px",
        });
        // 33.4 弹层契约：初始焦点落在日期输入
        const dateInput = dlg.element.querySelector("#lv-renew-date") as HTMLInputElement;
        dateInput.value = r.dueDate; // 内部格式 yyyy-MM-dd，属性赋值不走 HTML 解析
        const sub = dlg.element.querySelector("#lv-renew-sub") as HTMLElement;
        sub.textContent = r.title; // textContent：用户内容不经 HTML 解析
        dateInput?.focus();
        dlg.element.querySelector("#lv-renew-cancel")?.addEventListener("click", () => dlg.destroy());
        dlg.element.querySelector("#lv-renew-ok")?.addEventListener("click", async () => {
            const v = dateInput?.value;
            const err = dlg.element.querySelector("#lv-renew-err") as HTMLElement;
            if (!v) {
                err.textContent = t("form.required");
                err.style.display = "block";
                dateInput?.focus();
                return;
            }
            const okBtn = dlg.element.querySelector("#lv-renew-ok") as HTMLButtonElement;
            try {
                okBtn.disabled = true;
                // plugin.renew 内部写回后触发 refreshHub（行数据已变，不走 notifyHubChanged）
                await plugin.renew(r, v);
                dlg.destroy();
            } catch (e) {
                // 写回失败：保留 Dialog 与已填值，可重试
                err.textContent = t("ledger.saveFailed").replace("${msg}", e instanceof Error ? e.message : String(e));
                err.style.display = "block";
                okBtn.disabled = false;
            }
        });
    }

    // C3c 延后天数菜单（1/3/7/30）
    function snoozeMenu(r: Reminder, ev: MouseEvent) {
        // 3.8.x 宿主的全局 click 关单监听在窗口层，且 Menu 为共享单例容器：同一次 click 的
        // 传播中打开的菜单会被立即清空（2026-10-09 分层采样实证——document 层 4 项可见，
        // window 层 0 项；仅延迟 open 会在重展示时拿到已被清空的共享壳）。整个构建+打开
        // 都放进宏任务，等打开它的这次 click 传播清算完毕后再新建。
        const target = ev.currentTarget instanceof HTMLElement ? ev.currentTarget : undefined;
        const rect = target?.getBoundingClientRect();
        const rawX = ev.detail > 0 ? ev.clientX : rect?.right ?? 0;
        const rawY = ev.detail > 0 ? ev.clientY : rect?.bottom ?? 0;
        const x = Math.max(8, Math.min(rawX, window.innerWidth - 8));
        const y = Math.max(8, Math.min(rawY, window.innerHeight - 8));
        setTimeout(() => {
            const menu = new Menu("lv-snooze");
            for (const d of [1, 3, 7, 30]) {
                menu.addItem({
                    label: t("act.snoozeN").replace("${n}", String(d)),
                    click: () => { void runReminderAction(() => plugin.snooze(r.id, d), r.id); },
                });
            }
            menu.open({ x, y });
        }, 0);
    }

    let activeMoreMenu: { button: HTMLButtonElement; menu: HTMLElement; dispose: () => void } | undefined;
    function closeMoreMenu(restoreFocus = false) {
        const active = activeMoreMenu;
        if (!active) return;
        activeMoreMenu = undefined;
        active.menu.dataset.open = "false";
        active.button.setAttribute("aria-expanded", "false");
        active.dispose();
        if (restoreFocus) active.button.focus();
    }
    function toggleMoreMenu(event: MouseEvent) {
        const button = event.currentTarget as HTMLButtonElement;
        const menu = button.nextElementSibling as HTMLElement | null;
        if (!menu) return;
        if (activeMoreMenu?.button === button) { closeMoreMenu(); return; }
        closeMoreMenu();
        menu.dataset.open = "true";
        button.setAttribute("aria-expanded", "true");
        const onPointerDown = (e: PointerEvent) => {
            const target = e.target;
            if (target instanceof Node && (menu.contains(target) || button.contains(target))) return;
            closeMoreMenu();
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            closeMoreMenu(true);
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown, true);
        activeMoreMenu = {
            button,
            menu,
            dispose: () => {
                document.removeEventListener("pointerdown", onPointerDown, true);
                document.removeEventListener("keydown", onKeyDown, true);
            },
        };
    }
    function closeMoreOnMenuClick(node: HTMLElement) {
        const onClick = (event: MouseEvent) => {
            if (event.target instanceof Element && event.target.closest("button") && !event.target.closest(".lv-rem-more-toggle")) {
                closeMoreMenu();
            }
        };
        node.addEventListener("click", onClick);
        return { destroy: () => node.removeEventListener("click", onClick) };
    }
    onDestroy(() => closeMoreMenu());

    // 246 波（收件箱深化）：备忘编辑对话框（标题/到期日修正 → updateMemo 落盘）
    function editMemoDialog(r: Reminder) {
        const dlg = new Dialog({ title: t("memo.edit"), content: `<div id="lv-memoedit" style="display:flex;flex-direction:column;gap:10px"></div>`, width: "460px" });
        const box = dlg.element.querySelector("#lv-memoedit") as HTMLElement;
        const row1 = document.createElement("div");
        row1.style.cssText = "display:flex;gap:8px;align-items:center";
        const l1 = document.createElement("span"); l1.className = "ft__on-surface"; l1.style.minWidth = "72px"; l1.textContent = t("triage.name");
        const titleInput = document.createElement("input"); titleInput.className = "b3-text-field"; titleInput.style.flex = "1"; titleInput.value = r.title;
        row1.append(l1, titleInput);
        const row2 = document.createElement("div");
        row2.style.cssText = "display:flex;gap:8px;align-items:center";
        const l2 = document.createElement("span"); l2.className = "ft__on-surface"; l2.style.minWidth = "72px"; l2.textContent = t("triage.due");
        const dateInput = document.createElement("input"); dateInput.className = "b3-text-field"; dateInput.type = "date"; dateInput.value = r.dueDate;
        row2.append(l2, dateInput);
        // 260 波：确认键升为描边按钮（幽灵样式的保存键没有动作感，与取消键主次不分）
        const save = document.createElement("button"); save.className = "b3-button"; save.textContent = t("save");
        const err = document.createElement("span"); err.className = "lv-caption"; err.setAttribute("role", "alert"); err.style.color = "var(--lv-danger)";
        let saving = false;
        save.addEventListener("click", async () => {
            if (saving) return;
            const title = titleInput.value.trim();
            if (!title) { err.textContent = t("ledger.nameRequired"); titleInput.focus(); return; }
            if (!dateInput.value) { err.textContent = t("form.required"); dateInput.focus(); return; }
            saving = true;
            save.disabled = true;
            try {
                await plugin.updateMemo(r.id, { title, dueDate: dateInput.value });
                dlg.destroy();
            } catch (e) {
                err.textContent = t("ledger.saveFailed").replace("${msg}", e instanceof Error ? e.message : String(e));
                save.disabled = false;
                saving = false;
            }
        });
        const row3 = document.createElement("div");
        row3.style.cssText = "display:flex;gap:8px;justify-content:flex-end";
        row3.append(save);
        box.append(row1, row2, err, row3);
        titleInput.focus();
    }

    // 246 波（收件箱深化）：备忘置顶——置顶项在所属分组内排最前
    function isPinned(r: Reminder): boolean {
        const id = r.id.startsWith("adhoc::") ? r.id.slice("adhoc::".length) : r.id;
        return (plugin.runtime?.pinnedMemoIds ?? []).includes(id);
    }
    function pinnedFirst(items: Reminder[]): Reminder[] {
        return [...items].sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)));
    }
    // 29 组：同成员同日多条合并为一条可展开卡；175 波 O(n) 分组、179 波抽纯函数（core/hub/display，带单测）
    // 181 波：DisplayEntry 平铺化（key/row/items 恒有值），模板无需联合收窄。
    // Keep grouping and pin sorting in one derived pass. The old template
    // rebuilt three filtered arrays and three sorted arrays on every update.
    const displayGroups = $derived.by(() => {
        void version;
        if (filter === "all") {
            return [
                { key: "overdue", label: t("hub.groupOverdue"), items: pinnedFirst(filtered.filter((r: Reminder) => r.level === "overdue")) },
                { key: "soon", label: t("hub.groupSoon"), items: pinnedFirst(filtered.filter((r: Reminder) => r.level === "soon")) },
                { key: "lead", label: t("hub.groupLead"), items: pinnedFirst(filtered.filter((r: Reminder) => r.level === "lead")) },
            ].filter((g) => g.items.length > 0);
        }
        return [{ key: filter, label: "", items: pinnedFirst(filtered) }];
    });
    // Rendering every reminder at once makes a large inbox expensive even
    // though filtering and batch actions still need the complete data set.
    // Keep the data model complete but progressively mount rows in chunks.
    const REMINDER_PAGE_SIZE = 120;
    let renderLimit = $state(REMINDER_PAGE_SIZE);
    $effect(() => {
        void filter;
        void filterMember;
        void filterModule;
        void dueWithin;
        void version;
        renderLimit = REMINDER_PAGE_SIZE;
    });
    const renderedGroups = $derived.by(() => {
        let remaining = renderLimit;
        return displayGroups
            .map((group) => {
                const items = remaining > 0 ? group.items.slice(0, remaining) : [];
                remaining -= items.length;
                return { ...group, items, total: group.items.length };
            })
            .filter((group) => group.items.length > 0);
    });
    const handledVisible = $derived(handledFiltered.slice(0, renderLimit));

    // 236 波（收件箱分诊）：备忘 → 正式台账行。目标限已建库的非成员模块；
    // 名称带入备忘标题、日期带入目标模块首个日期列；创建后完成备忘（可在"已处理"恢复）。
    async function toLedgerDialog(r: Reminder) {
        // 247 波：目标扩展到已启用未建库模块（选中后自动建库再入行）
        const targets = (plugin.settings.enabledModules ?? [])
            .filter((id) => id !== "adhoc" && id !== "members")
            .map((id) => ({ id, ref: plugin.settings.dbRefs[id] }));
        if (!targets.length) { showMessage(t("triage.noTarget"), 3500, "error"); return; }
        const modLabel = (id: string) => (t(`module.${id}`) !== `module.${id}` ? t(`module.${id}`) : id);
        const needProvision = (id: string) => !plugin.settings.dbRefs[id]?.avId;
        const dlg = new Dialog({ title: t("triage.title"), content: `<div id="lv-triage" style="display:flex;flex-direction:column;gap:10px"></div>`, width: "460px" });
        const box = dlg.element.querySelector("#lv-triage") as HTMLElement;
        const row1 = document.createElement("div");
        row1.style.cssText = "display:flex;gap:8px;align-items:center";
        const l1 = document.createElement("span"); l1.className = "ft__on-surface"; l1.style.minWidth = "72px"; l1.textContent = t("triage.module");
        const sel = document.createElement("select"); sel.className = "b3-select"; sel.style.flex = "1";
        for (const x of targets) {
            const o = document.createElement("option"); o.value = x.id;
            o.textContent = modLabel(x.id) + (needProvision(x.id) ? t("triage.needProvision") : "");
            sel.append(o);
        }
        row1.append(l1, sel);
        // 246 波（收件箱深化）：成员分配（relation 写入同台账快速表单；未分配=不写成员列）
        const rowM = document.createElement("div");
        rowM.style.cssText = "display:flex;gap:8px;align-items:center";
        const lM = document.createElement("span"); lM.className = "ft__on-surface"; lM.style.minWidth = "72px"; lM.textContent = t("field.member");
        const memberSel = document.createElement("select"); memberSel.className = "b3-select"; memberSel.style.flex = "1";
        const none = document.createElement("option"); none.value = ""; none.textContent = t("members.unassigned");
        memberSel.append(none);
        for (const m of plugin.settings.members ?? []) {
            const o = document.createElement("option");
            o.value = m.avItemId ?? "";
            o.disabled = !m.avItemId;
            o.textContent = `${m.name}${m.avItemId ? "" : ` · ${t("members.notLinked")}`}`;
            memberSel.append(o);
        }
        rowM.append(lM, memberSel);
        const row2 = document.createElement("div");
        row2.style.cssText = "display:flex;gap:8px;align-items:center";
        const l2 = document.createElement("span"); l2.className = "ft__on-surface"; l2.style.minWidth = "72px"; l2.textContent = t("triage.name");
        const nameInput = document.createElement("input"); nameInput.className = "b3-text-field"; nameInput.style.flex = "1"; nameInput.value = r.title;
        row2.append(l2, nameInput);
        const row3 = document.createElement("div");
        row3.style.cssText = "display:flex;gap:8px;align-items:center";
        const l3 = document.createElement("span"); l3.className = "ft__on-surface"; l3.style.minWidth = "72px"; l3.textContent = t("triage.due");
        const dateInput = document.createElement("input"); dateInput.className = "b3-text-field"; dateInput.type = "date"; dateInput.value = r.dueDate;
        row3.append(l3, dateInput);
        const ok = document.createElement("button"); ok.className = "b3-button"; ok.textContent = t("triage.create");
        const err = document.createElement("span"); err.className = "lv-caption"; err.setAttribute("role", "alert"); err.style.color = "var(--lv-danger)";
        // 一个转台账对话框对应一个业务操作。若首个请求超时、或用户点击重试，
        // 必须复用同一幂等 key，避免内核已落行但前端未拿到响应时再次建出重复行。
        const operationKey = (() => {
            try { return `triage:${crypto.randomUUID()}`; }
            catch { return `triage:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`; }
        })();
        let pendingRowId: string | undefined;
        let pendingModuleId: string | undefined;
        let identityPending = false;
        const doCreate = async () => {
            const title = nameInput.value.trim();
            if (!title) { err.textContent = t("ledger.nameRequired"); nameInput.focus(); return; }
            const mod = sel.value;
            if (pendingRowId && pendingModuleId !== mod) {
                err.textContent = t("triage.pendingTarget");
                return;
            }
            let ref = plugin.settings.dbRefs[mod];
            // 247 波：未建库模块自动建库（provisionModule 幂等；登记写入 settings 后 ref 即有效）
            if (!ref?.avId) {
                ok.textContent = t("triage.provisioning");
                await provisionModule(plugin.settings, mod, plugin.schemaCatalog?.[mod], t(`module.${mod}`), { resolveName: (key: string) => String(plugin.i18n[`field.${key}`] ?? key) });
                ref = plugin.settings.dbRefs[mod];
                if (!ref?.avId) { showMessage(t("triage.noTarget"), 3000, "error"); return; }
            }
            const selectedMember = memberSel.value;
            if (selectedMember && !(plugin.settings.members ?? []).some((m) => m.avItemId === selectedMember)) {
                err.textContent = t("members.notLinked");
                memberSel.focus();
                return;
            }
            let itemID = pendingRowId;
            if (!itemID) {
                try {
                    itemID = await addDetachedRow(ref.avId, title, { idempotencyKey: `${operationKey}:row`, retries: 1 });
                    pendingRowId = itemID;
                    pendingModuleId = mod;
                } catch (e) {
                    const { RowIdentityPendingError } = await import("@/core/siyuan");
                    if (e instanceof RowIdentityPendingError) {
                        identityPending = true;
                        ok.disabled = true;
                        err.textContent = t("triage.identityPending");
                        return;
                    }
                    throw e;
                }
            }
            // 新建行身份确认存在延迟：setCell 失败受控重试（同格重写不会重复建行）
            const setCellSafe = async (key: string, value: unknown) => {
                const keyID = ref.columns?.[key];
                if (!keyID) return;
                for (let attempt = 0; ; attempt++) {
                    try {
                        await setCell(ref.avId, keyID, itemID, value, {
                            idempotencyKey: `${operationKey}:cell:${keyID}`,
                            retries: 1,
                        });
                        return;
                    }
                    catch (e) {
                        if (attempt >= 2) throw e;
                        await new Promise((r2) => setTimeout(r2, 400));
                    }
                }
            };
            await setCellSafe("name", { type: "text", text: { content: title } });
            // 日期写入提醒规则所用字段（如 certs→expiry）——写入无关日期列会导致转行后不派生提醒；
            // 无规则字段的模块回退首个 date 列（行仍有到期日信息）
            const schemaCols = plugin.schemaCatalog?.[mod]?.columns ?? [];
            const ruleFields = (plugin.schemaCatalog?.[mod]?.reminders ?? []).map((x: any) => x.field);
            const dateCol = schemaCols.find((c: any) => c.type === "date" && ruleFields.includes(c.key))
                ?? schemaCols.find((c: any) => c.type === "date");
            if (dateCol && r.dueDate) await setCellSafe(dateCol.key, { type: "date", date: { content: new Date(`${r.dueDate}T00:00:00`).getTime(), isNotEmpty: true, isNotTime: true } });
            // 成员分配（246 波）：relation 写入（选了成员才写）
            if (selectedMember) await setCellSafe("member", { type: "relation", relation: { blockIDs: [selectedMember], contents: null } });
            await plugin.complete(r);
            dlg.destroy();
            showMessage(t("triage.done").replace("${mod}", modLabel(mod)), 4000, "info");
            // 转行改变了台账数据：全量重扫让新行立即派生提醒（缓存派生不含新行）。
            // The triage flow just created a new ledger row. The cached scan
            // does not contain it, so this refresh must bypass the debounce.
            try { await plugin.refreshHub(undefined, true); }
            catch (e) {
                console.warn("[siyuan-home] triage saved but refresh failed:", e);
                showMessage(t("triage.refreshFailed"), 5000, "error");
            }
        };
        ok.addEventListener("click", () => {
            if (identityPending) return;
            ok.disabled = true;
            doCreate().catch((e) => {
                err.textContent = t("ledger.saveFailed").replace("${msg}", e instanceof Error ? e.message : String(e));
            }).finally(() => { if (!identityPending) ok.disabled = false; });
        });
        box.append(row1, rowM, row2, row3, err, ok);
        nameInput.focus();
    }

    // 261 波：重扫 busy 态——31 模块串行扫描可达秒级，此前可连点堆积多次全量扫描
    let rescanning = $state(false);
    // 29 组：今日免打扰（runtime 非响应式——依赖 version prop 刷新；当日键比较即跨天自动失效）
    const todaySilentOn = $derived.by(() => {
        void version;
        return plugin.runtime.todaySilent === localDateKey(new Date());
    });
    async function rescan() {
        if (rescanning) return;
        rescanning = true;
        try {
            await plugin.refreshHub(undefined, true);
        } catch (e) {
            showMessage(t("hub.rescanFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        } finally {
            rescanning = false;
        }
    }
    function toggleTodaySilent() {
        void runReminderAction(() => plugin.toggleTodaySilent(), "today-silent");
    }

    // 260 波：首扫 loading 态（未知 ≠ "暂无事项"，33.3/13 §3.4）
    const firstScanPending = $derived.by(() => {
        void version;
        return !plugin.runtime?.scannedAt && !(plugin.scan?.errors?.length) && all.length === 0;
    });

    let expandedMerges = $state<Set<string>>(new Set());
    function toggleMerge(key: string) {
        const next = new Set(expandedMerges);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        expandedMerges = next;
    }
    let expandedSummaries = $state<Set<string>>(new Set());
    function toggleSummary(id: string, event?: Event) {
        if (event) event.stopPropagation();
        const next = new Set(expandedSummaries);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        expandedSummaries = next;
    }
    function memberName(id: string): string {
        return (plugin.settings.members ?? []).find((m) => m.id === id)?.name ?? t("members.unassigned");
    }
    // UIX-07 / §17 计划处理日弹窗（Things 3 智能双日期：计划日与硬截止日分离）
    function openPlanDateDialog(r: Reminder) {
        const currentPlan = r.planDate ?? "";
        const dlg = new Dialog({
            title: t("hub.planDateDialogTitle"),
            content: `
                <div class="b3-dialog__content fn__flex" style="flex-direction:column;gap:12px;padding:16px 20px">
                    <div style="font-size:13px;font-weight:600;color:var(--lv-tx)">${escapeHtml(r.title)}</div>
                    <div class="lv-caption" style="font-size:12px;line-height:1.4">${t("hub.planDateIntro")}</div>
                    <div style="display:flex;gap:16px;font-size:12px;color:var(--lv-tx-2);padding:8px 12px;border-radius:var(--lv-r-2);background:var(--lv-surface-2);border:1px solid var(--lv-line)">
                        <span>${t("hub.deadline")}：<b style="color:${r.level === 'overdue' ? 'var(--lv-danger)' : 'var(--lv-tx)'}">${r.dueDate}</b></span>
                    </div>
                    <div>
                        <label class="ft__on-surface" style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">${t("hub.planDate")}</label>
                        <input id="lv-plan-date-input" type="date" class="b3-text-field" value="${currentPlan}" style="width:100%" />
                    </div>
                </div>
                <div class="b3-dialog__action">
                    ${currentPlan ? `<button class="b3-button b3-button--cancel ft__error" id="lv-plan-clear" style="color:var(--lv-danger)">${t("hub.clearPlanDate")}</button>` : ""}
                    <button class="b3-button b3-button--cancel" id="lv-plan-cancel">${t("cancel")}</button>
                    <button class="b3-button b3-button--text" id="lv-plan-save">${t("save")}</button>
                </div>
            `,
            width: "400px",
        });

        const dateInput = dlg.element.querySelector("#lv-plan-date-input") as HTMLInputElement;
        const cancelBtn = dlg.element.querySelector("#lv-plan-cancel") as HTMLButtonElement;
        const saveBtn = dlg.element.querySelector("#lv-plan-save") as HTMLButtonElement;
        const clearBtn = dlg.element.querySelector("#lv-plan-clear") as HTMLButtonElement | null;

        cancelBtn.onclick = () => dlg.destroy();
        if (clearBtn) {
            clearBtn.onclick = async () => {
                setPlanDate(plugin.runtime, r.id, undefined);
                dlg.destroy();
                try {
                    await saveRuntime(plugin, plugin.runtime);
                    showMessage(t("hub.planDateCleared"), 2500, "info");
                    await plugin.refreshHub();
                } catch (err) {
                    showMessage(String(err), 4000, "error");
                }
            };
        }
        saveBtn.onclick = async () => {
            const val = dateInput.value.trim();
            setPlanDate(plugin.runtime, r.id, val || undefined);
            dlg.destroy();
            try {
                await saveRuntime(plugin, plugin.runtime);
                if (val) {
                    showMessage(t("hub.planDateSaved").replace("${date}", val), 2500, "info");
                } else {
                    showMessage(t("hub.planDateCleared"), 2500, "info");
                }
                await plugin.refreshHub();
            } catch (err) {
                showMessage(String(err), 4000, "error");
            }
        };
    }

    // 17 组/186 波：相对到期短语（今天/明天/N 天后/逾期 N 天）；完整日期走 title 悬浮 + 标题下方 meta 行
    function relDue(daysLeft: number, fallback: string): string {
        const rel = relativeDue(daysLeft);
        if (!rel) {
            // 225 波对齐原型：提醒中枢右侧 30 天内一律相对短语（扫描工作台视角）；
            // 星期几仍只对 ≤6 天附注（205 波）；>30 天沿用 ISO（行下方已带完整日期）
            if (daysLeft >= 7 && daysLeft <= 30) return t("days.after").replace("${n}", String(Math.floor(daysLeft)));
            return fallback;
        }
        const base = rel.n === undefined ? t(rel.key) : t(rel.key).replace("${n}", String(rel.n));
        if (rel.key === "days.after" && daysLeft <= 6) {
            const wk = weekdayKey(fallback);
            if (wk) return `${base} · ${t(wk)}`; // 205 波：N 天后附星期几（原待办「下周三」半边的补齐）
        }
        return base;
    }
</script>

{#snippet remRow(r: Reminder)}
    <!-- 261 波：完成/延后后行 150ms 淡出离场（瞬消失让用户怀疑误触；respects reduced-motion 由全局降级） -->
    <div class="lv-rem-entry" out:fade={{ duration: 150 }}>
        <div class="lv-rem {r.level}" class:lv-rem--batch={batchMode && viewMode === "list" && filter !== "handled"}>
            {#if batchMode && viewMode === "list" && filter !== "handled"}
                <input type="checkbox" class="b3-checkbox" aria-label={t("hub.select")}
                    checked={selected.has(r.id)} disabled={batchBusy} onchange={() => toggleSelect(r.id)} style="flex-shrink:0" />
            {/if}
            <!-- 259 波：图标砖收回中性（对齐原型 .rem .ic）——级别语义由色轨+右侧大字承载 -->
            <div class="lv-rem-ic" aria-hidden="true"><UiIcon name={moduleUiIcon(r.moduleId)} size={18} /></div>
            <div class="lv-rem-t" title={(r.autoRenew ? `${t("hub.autoRenew")} · ` : "") + r.dueDate}>
                <b>
                    {r.title}{r.ruleKey === "reciprocate" ? ` · ${t("rule.reciprocate")}` : ""}
                    <button type="button" class="lv-rem-expand-btn"
                        title={expandedSummaries.has(r.id) ? t("hub.collapseSummary") : t("hub.expandSummary")}
                        aria-expanded={expandedSummaries.has(r.id)}
                        aria-label={expandedSummaries.has(r.id) ? t("hub.collapseSummary") : t("hub.expandSummary")}
                        onclick={(e) => toggleSummary(r.id, e)}>
                        <span aria-hidden="true" style="display:inline-block;transition:transform 0.2s;transform:rotate({expandedSummaries.has(r.id) ? '90deg' : '0deg'})">▸</span>
                    </button>
                </b>
                <!-- 249 波：meta 补模块名（对齐原型三段 meta）；262 波：成员微头像前置（"这是谁的事"） -->
                <span class="lv-num">{#if memberOf(r.memberId)}{@const member = memberOf(r.memberId)}<span class="lv-miniava" style="background:linear-gradient(135deg, hsl({memberHue(member.id)} 62% 52%), hsl({(memberHue(member.id) + 42) % 360} 62% 40%))" aria-hidden="true">{member.name.slice(0, 1)}</span>{/if}{r.moduleId !== "adhoc" ? (t(`module.${r.moduleId}`) !== `module.${r.moduleId}` ? t(`module.${r.moduleId}`) : r.moduleId) + " · " : ""}{#if r.planDate}<span class="lv-badge" style="font-size:11px;margin-right:4px;color:var(--lv-accent);border-color:var(--lv-accent-line);background:var(--lv-accent-soft)" title={`${t("hub.planDate")}：${r.planDate}`}>📅 {t("hub.planDate")}: {r.planDate} · </span>{/if}{r.dueDate}{#if !r.memberId} · {t("members.unassigned")}{/if}{r.lunar ? " 🌙" : ""}{r.autoRenew ? " 🔄" : ""}</span>
            </div>
            <!-- 对齐原型：相对到期大字居右（颜色随级别；文字本身已承载逾期/N天后语义，级别徽章不再重复） -->
            <div class="lv-rem-when">
                <b class="lv-num" style="color:var(--lv-{r.level === 'overdue' ? 'danger' : r.level === 'soon' ? 'warn' : 'amber'})">{relDue(r.daysLeft, r.dueDate)}</b>
            </div>
            <div class="lv-rem-ops">
                <button class="b3-button b3-button--text" disabled={batchBusy || reminderBusy.has(r.id)} aria-busy={reminderBusy.has(r.id)} onclick={() => void completeItem(r)}>{reminderBusy.has(r.id) ? t("ledger.saving") : t("act.done")}</button>
                <div class="lv-rem-more">
                    <button class="b3-button b3-button--text lv-rem-more-toggle" type="button" aria-expanded="false" aria-controls={`lv-rem-more-${r.id}`}
                        onclick={toggleMoreMenu}>{t("ledger.detailMore")} <span aria-hidden="true">⌄</span></button>
                    <div id={`lv-rem-more-${r.id}`} class="lv-rem-more-menu" role="group" aria-label={t("ledger.detailMore")} use:closeMoreOnMenuClick>
                        {#if ["certs", "insurance", "contracts"].includes(r.moduleId)}
                            <!-- 续保/换证/合同续约：新到期日写回规则 field 列（26.6 + 98 波：contracts 规则带 field=expiry 与
                                 autoRenewField 升级路径，此前 🔄 决策提醒无"续"动作入口——漏项补齐） -->
                        <button class="b3-button b3-button--text" disabled={batchBusy || reminderBusy.has(r.id)} onclick={() => renewDialog(r)}>{t("act.renew")}</button>
                        {/if}
                        {#if r.moduleId !== "adhoc" && plugin.settings.dbRefs[r.moduleId]?.docId}
                            <button class="b3-button b3-button--text" disabled={batchBusy} title={t("act.locate")} onclick={() => plugin.showTabDocs(plugin.settings.dbRefs[r.moduleId].docId)}>{t("act.locate")}</button>
                        {/if}
                        <button class="b3-button b3-button--text" aria-haspopup="menu" disabled={batchBusy || reminderBusy.has(r.id)} aria-busy={reminderBusy.has(r.id)} onclick={(e) => snoozeMenu(r, e)}>{reminderBusy.has(r.id) ? t("ledger.saving") : `${t("act.snooze")} ▾`}</button>
                        <button class="b3-button b3-button--text" disabled={batchBusy || reminderBusy.has(r.id)} onclick={() => openPlanDateDialog(r)}>{t("hub.setPlanDate")}</button>
                        <button class="b3-button b3-button--text" disabled={batchBusy || reminderBusy.has(r.id)} aria-busy={reminderBusy.has(r.id)} onclick={() => void runReminderAction(() => plugin.mute(r.id), r.id)}>{reminderBusy.has(r.id) ? t("ledger.saving") : t("act.mute")}</button>
                        {#if r.moduleId === "adhoc"}
                            <!-- 246 波（收件箱深化）：备忘置顶（置顶项组内排最前） -->
                            <button class="b3-button b3-button--text" title={isPinned(r) ? t("act.unpin") : t("act.pin")}
                                disabled={batchBusy || reminderBusy.has(r.id)} aria-busy={reminderBusy.has(r.id)}
                                onclick={() => void runReminderAction(async () => { await toggleMemoPin(plugin, r.id); await plugin.refreshHub(); }, r.id)}>{reminderBusy.has(r.id) ? t("ledger.saving") : (isPinned(r) ? t("act.unpin") : t("act.pin"))}</button>
                            <!-- 246 波（收件箱深化）：备忘编辑（标题/到期日） -->
                            <button class="b3-button b3-button--text" disabled={batchBusy || reminderBusy.has(r.id)} onclick={() => editMemoDialog(r)}>{t("memo.edit")}</button>
                            <!-- H03：备忘的显式删除（唯一物理删除路径；未处理项不自动清理） -->
                            <button class="b3-button b3-button--text" disabled={batchBusy || reminderBusy.has(r.id)} onclick={() => confirmDeleteMemo(r)}>{t("delete")}</button>
                            <!-- 240 波（收件箱分诊）：备忘 → 正式台账行 -->
                            <button class="b3-button b3-button--text" disabled={batchBusy || reminderBusy.has(r.id)} onclick={() => toLedgerDialog(r)}>{t("triage.title")}</button>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
        {#if expandedSummaries.has(r.id)}
            <div class="lv-rem-summary">
                <div class="lv-rem-summary__grid">
                    <div class="lv-rem-summary__item">
                        <span class="lv-rem-summary__k">{t("hub.summaryModule")}：</span>
                        <span class="lv-rem-summary__v">{t(`module.${r.moduleId}`) !== `module.${r.moduleId}` ? t(`module.${r.moduleId}`) : r.moduleId}</span>
                    </div>
                    {#if r.ruleKey}
                        <div class="lv-rem-summary__item">
                            <span class="lv-rem-summary__k">{t("hub.summaryRule")}：</span>
                            <span class="lv-rem-summary__v">{t(`rule.${r.ruleKey}`) !== `rule.${r.ruleKey}` ? t(`rule.${r.ruleKey}`) : r.ruleKey}</span>
                        </div>
                    {/if}
                    <div class="lv-rem-summary__item">
                        <span class="lv-rem-summary__k">{t("hub.summaryMember")}：</span>
                        <span class="lv-rem-summary__v">{memberOf(r.memberId)?.name ? `${memberOf(r.memberId)!.name}（${t(`role.${memberOf(r.memberId)!.role}`) !== `role.${memberOf(r.memberId)!.role}` ? t(`role.${memberOf(r.memberId)!.role}`) : memberOf(r.memberId)!.role}）` : t("members.unassigned")}</span>
                    </div>
                    <div class="lv-rem-summary__item">
                        <span class="lv-rem-summary__k">{t("hub.summaryDue")}：</span>
                        <span class="lv-rem-summary__v">{r.dueDate}（{relDue(r.daysLeft, r.dueDate)}）</span>
                    </div>
                    {#if r.planDate}
                        <div class="lv-rem-summary__item">
                            <span class="lv-rem-summary__k">{t("hub.planDate")}：</span>
                            <span class="lv-rem-summary__v" style="color:var(--lv-accent);font-weight:600">📅 {r.planDate}</span>
                        </div>
                    {/if}
                    {#if r.kind}
                        <div class="lv-rem-summary__item">
                            <span class="lv-rem-summary__k">{t("hub.summaryKind")}：</span>
                            <span class="lv-rem-summary__v">{r.kind}</span>
                        </div>
                    {/if}
                    {#if r.lunar}
                        <div class="lv-rem-summary__item">
                            <span class="lv-rem-summary__k">{t("hub.summaryFeatures")}：</span>
                            <span class="lv-rem-summary__v">🌙 {t("hub.summaryLunar")}</span>
                        </div>
                    {/if}
                    {#if r.autoRenew}
                        <div class="lv-rem-summary__item">
                            <span class="lv-rem-summary__k">{t("hub.summaryFeatures")}：</span>
                            <span class="lv-rem-summary__v">🔄 {t("hub.summaryAutoRenew")}</span>
                        </div>
                    {/if}
                </div>
                {#if r.moduleId !== "adhoc" && plugin.settings.dbRefs[r.moduleId]?.docId}
                    <div class="lv-rem-summary__actions">
                        <button class="b3-button b3-button--outline b3-button--small" onclick={() => plugin.showTabDocs(plugin.settings.dbRefs[r.moduleId].docId)}>
                            {t("act.locate")} →
                        </button>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
{/snippet}

<section class="lv-hub-head" aria-labelledby="lv-hub-title">
    <div class="lv-hero lv-hub-title">
        <div><span class="lv-hub-eyebrow">{t("dash.upcoming")}</span><h1 id="lv-hub-title">{t("hub.title")}</h1><p>{t("hub.subtitle")}</p></div>
    </div>
    <div class="lv-hub-summary" aria-label={t("hub.title")}>
        <div class="lv-hub-summary__item"><span>{t("hub.filterAll")}</span><b class="lv-num">{all.length}</b></div>
        <div class="lv-hub-summary__item is-overdue"><span>{t("hub.groupOverdue")}</span><b class="lv-num">{overdueCount}</b></div>
    </div>
</section>

<section class="lv-hub-controls" aria-label={t("hub.title")}>
    <div class="lv-card lv-hub-filter-panel">
        <div class="lv-hub-panel-label">{t("hub.filterAll")}</div>
        <div class="lv-toolbar lv-hub-filters">
            <select class="b3-select" aria-label={t("hub.title")} value={filter} disabled={batchBusy} onchange={(e) => changeFilter((e.target as HTMLSelectElement).value)}>
                <option value="all">{t("hub.filterAll")}</option>
                <option value="overdue">{t("hub.filterOverdue")}</option>
                <option value="soon">{t("hub.filterSoon")}</option>
                <option value="lead">{t("hub.filterLead")}</option>
                <option value="handled">{t("hub.filterHandled")}</option>
            </select>
            <select class="b3-select" aria-label={t("field.member")} value={filterMember ?? ""} disabled={batchBusy} onchange={(e) => { filterMember = (e.target as HTMLSelectElement).value || undefined; pruneSelection(); persistFilter(); }}>
                <option value="">{t("field.member")}: {t("members.all")}</option>
                {#each memberOptions as m (m.id)}
                    <option value={m.id}>{m.name}</option>
                {/each}
            </select>
            <select class="b3-select" aria-label={t("hub.filterAllModule")} value={filterModule ?? ""} disabled={batchBusy} onchange={(e) => { filterModule = (e.target as HTMLSelectElement).value || undefined; pruneSelection(); persistFilter(); }}>
                <option value="">{t("hub.filterAllModule")}</option>
                {#each moduleOptions as mid (mid)}
                    <option value={mid}>{mid === "adhoc" ? t("adhoc.name") : (t(`module.${mid}`) !== `module.${mid}` ? t(`module.${mid}`) : mid)}</option>
                {/each}
            </select>
            <select class="b3-select" aria-label={t("hub.dueAll")} value={dueWithin} disabled={batchBusy} onchange={(e) => { dueWithin = (e.target as HTMLSelectElement).value; pruneSelection(); persistFilter(); }}>
                <option value="all">{t("hub.dueAll")}</option>
                <option value="0">{t("hub.dueToday")}</option>
                <option value="7">{t("hub.due7")}</option>
                <option value="30">{t("hub.due30")}</option>
            </select>
            <!-- 243 波（收件箱分诊）：一键切片到备忘项集合（转行/完成/延后集中处理） -->
            <button class="b3-button b3-button--outline" class:is-filtered={filterModule === "adhoc"} disabled={batchBusy}
                aria-pressed={filterModule === "adhoc"} onclick={() => { filterModule = filterModule === "adhoc" ? undefined : "adhoc"; persistFilter(); }}>
                {t("hub.triageChip")}{#if filterModule === "adhoc"} ✓{/if}
            </button>
        </div>
        <!-- UIX-06 / §17 智能筛选命名视图栏 -->
        <div class="lv-named-views">
            <span class="lv-named-views__label">{t("hub.namedViews")}：</span>
            {#each namedViews as v (v.id)}
                <div class="lv-named-view-chip" class:is-active={isNamedViewActive(v)}
                    role="button" tabindex="0" onclick={() => applyNamedView(v)}
                    onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); applyNamedView(v); } }}>
                    <span class="lv-named-view-chip__name">{v.name}</span>
                    <button type="button" class="lv-named-view-chip__del" title={t("delete")}
                        onclick={(e) => handleDeleteView(v, e)} aria-label={`${t("delete")} ${v.name}`}>×</button>
                </div>
            {/each}
            <button type="button" class="b3-button b3-button--text lv-named-views__add"
                title={t("hub.saveView")} onclick={openSaveViewDialog}>
                ＋ {t("hub.saveView")}
            </button>
        </div>
    </div>
    <div class="lv-card lv-hub-action-panel">
        <div class="lv-hub-panel-label">{t("view.list")}</div>
        <div class="lv-toolbar lv-hub-actions">
            <span class="lv-tabs lv-hub-view-toggle" role="group" aria-label={t("view.list") + "/" + t("view.calendar")}>
                <button class="lv-tabs__item" class:on={viewMode === "list"}
                    disabled={batchBusy} aria-pressed={viewMode === "list"} onclick={() => setViewMode("list")}>{t("view.list")}</button>
                <button class="lv-tabs__item" class:on={viewMode === "calendar"}
                    disabled={batchBusy} aria-pressed={viewMode === "calendar"} onclick={() => setViewMode("calendar")}>{t("view.calendar")}</button>
            </span>
            <button class="b3-button b3-button--outline" class:is-active={todaySilentOn}
                aria-pressed={todaySilentOn} title={t("hub.todaySilentTip")}
                disabled={batchBusy} onclick={toggleTodaySilent}>{todaySilentOn ? "🔕 " : ""}{t("hub.todaySilent")}{todaySilentOn ? " ✓" : ""}</button>
            <button class="b3-button b3-button--outline" class:is-active={batchMode} disabled={batchBusy} onclick={() => (batchMode ? clearSelection() : (batchMode = true))}>{t("hub.batch")}</button>
            <button class="b3-button b3-button--outline" disabled={batchBusy || rescanning} aria-busy={rescanning} onclick={rescan}>{t("hub.rescan")}</button>
            <button class="b3-button b3-button--outline" disabled={batchBusy || exportingIcs} aria-busy={exportingIcs} onclick={exportIcs}>{exportingIcs ? t("ledger.saving") : t("hub.icsExport")}</button>
        </div>
    </div>
</section>

{#if captureDrafts.length > 0}
    <section class="lv-card lv-capture-recovery" aria-labelledby="lv-capture-recovery-title">
        <div class="lv-capture-recovery__head">
            <div>
                <div class="lv-hub-panel-label" id="lv-capture-recovery-title">{t("capture.recoveryTitle")}</div>
                <p class="lv-caption">{t("capture.recoveryDescription")}</p>
            </div>
            <UiIcon name="alert" size={17} />
        </div>
        {#each captureDrafts as draft (draft.id)}
            <div class="lv-capture-recovery__row">
                <div class="lv-capture-recovery__meta">
                    <strong>{captureDraftLabel(draft.moduleId)}</strong>
                    <span class="lv-caption">{draft.status === "pending" ? t("capture.recoveryPending") : t("capture.recoveryFailed")}{draft.error ? ` · ${draft.error}` : ""}</span>
                </div>
                <div class="lv-capture-recovery__actions">
                    <button class="b3-button b3-button--outline" onclick={() => onCapture?.(draft.moduleId)}>{t("capture.recoveryOpen")}</button>
                    <button class="b3-button b3-button--text" onclick={(event) => { event.stopPropagation(); discardCaptureDraft(draft); }}>{t("capture.recoveryDiscard")}</button>
                </div>
            </div>
        {/each}
    </section>
{/if}

{#if permissionDenied}
    <div class="lv-card" role="alert" style="display:flex;align-items:center;gap:12px;padding:12px 16px">
        <UiIcon name="alert" size={18} />
        <span style="flex:1;min-width:0;overflow-wrap:anywhere">{t("permission.body")}</span>
        <button class="b3-button b3-button--outline" disabled={rescanning} aria-busy={rescanning} onclick={rescan}>
            {rescanning ? t("diag.rebuilding") : t("hub.rescan")}
        </button>
    </div>
{/if}

{#if batchMode && filter !== "handled" && viewMode === "list"}
    <div class="lv-card lv-toolbar lv-hub-batchbar">
        <b class="lv-caption">{t("hub.selectedN").replace("${n}", String(selectedCount))}</b>
        <button class="b3-button b3-button--text" disabled={batchBusy} onclick={selectAllFiltered}>{t("hub.selectAll")}</button>
        <span class="fn__flex-1"></span>
        <button class="b3-button b3-button--text" disabled={batchBusy || selectedCount === 0} onclick={() => runBatch("done")}>{t("act.done")}</button>
        <button class="b3-button b3-button--text" disabled={batchBusy || selectedCount === 0} onclick={() => runBatch("snooze7")}>{t("act.snooze7")}</button>
        <button class="b3-button b3-button--text" disabled={batchBusy || selectedCount === 0} onclick={() => runBatch("mute")}>{t("act.mute")}</button>
        <button class="b3-button b3-button--outline" disabled={batchBusy} onclick={clearSelection}>{t("cancel")}</button>
    </div>
{/if}



{#if filter === "handled"}
    {#if handledFiltered.length === 0 && handledEntries.length > 0}
        <div class="lv-card"><div class="lv-empty" role="status"><div class="eic"><UiIcon name="search" size={22} /></div><b>{t("hub.filteredEmpty")}</b><span>{t("hub.filteredEmptyHint")}</span>
            <button class="b3-button b3-button--outline" style="margin-top:8px" onclick={() => { filterMember = undefined; filterModule = undefined; dueWithin = "all"; void persistFilter(); }}>{t("hub.clearFilters")}</button>
        </div></div>
    {:else if handledFiltered.length === 0}
        <div class="lv-card"><div class="lv-empty"><div class="eic"><UiIcon name="check" size={22} /></div><b>{t("hub.handledTitle")}</b><span>{t("hub.handledHint")}</span></div></div>
    {:else}
        <div class="lv-card lv-rems">
            {#each handledVisible as h (h.id + h.kind)}
                <div class="lv-rem lead">
                    <div class="lv-rem-ic"><UiIcon name={h.kind === "memo" ? "note" : h.kind === "muted" ? "mute" : "check"} size={18} /></div>
                    <div class="lv-rem-t">
                        <b>{h.title || t("hub.handledUnknown")}</b>
                        <span class="lv-caption">{t(kindLabel[h.kind] ?? "hub.handledDone")}{h.dueDate ? ` · ${h.dueDate}` : ""}{h.moduleId && h.moduleId !== "adhoc" ? ` · ${t(`module.${h.moduleId}`)}` : ""}</span>
                    </div>
                    <div class="lv-rem-ops">
                        <button class="b3-button b3-button--text" disabled={reminderBusy.has(h.id)} aria-busy={reminderBusy.has(h.id)} onclick={() => restoreEntry(h.id)}>{reminderBusy.has(h.id) ? t("ledger.saving") : t("hub.restore")}</button>
                        {#if h.kind === "memo"}
                            <button class="b3-button b3-button--text" disabled={reminderBusy.has(h.id)} onclick={() => confirmDeleteHandledMemo(h.id, h.title || t("hub.handledUnknown"))}>{t("delete")}</button>
                        {/if}
                    </div>
                </div>
            {/each}
            {#if handledFiltered.length > handledVisible.length}
                <div style="display:flex;justify-content:center;padding:12px">
                    <button class="b3-button b3-button--outline" onclick={() => (renderLimit += REMINDER_PAGE_SIZE)}>
                        {t("ledger.loadMore").replace("${n}", String(handledFiltered.length - handledVisible.length))}
                    </button>
                </div>
            {/if}
        </div>
    {/if}
{:else if viewMode === "calendar" && filter !== "handled"}
    <!-- 日历在空筛选结果时仍提供日期浏览与新增备忘入口。 -->
    <Calendar items={filtered} {t} {version} initialMode={plugin.runtime.hubCalMode}
        onModeChange={(m: "month" | "week") => { plugin.runtime.hubCalMode = m; saveRuntime(plugin, plugin.runtime).catch((e) => showMessage(t("hub.preferenceSaveFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error")); }}
        onComplete={(r: Reminder) => completeItem(r)}
        onAddMemo={(title: string, due: string) => plugin.addMemo(title, due)}
        onConvert={(r: Reminder) => toLedgerDialog(r)} />
{:else if filtered.length === 0}
    {#if firstScanPending}
        <!-- 260 波：首扫骨架（未知 ≠ 全部完成） -->
        <div class="lv-card lv-rems" aria-busy="true" role="status">
            {#each [0, 1, 2] as i (i)}
                <div class="lv-rem">
                    <div class="lv-skel" style="width:38px;height:38px;border-radius:11px;flex:none"></div>
                    <div style="flex:1;display:flex;flex-direction:column;gap:7px;min-width:0">
                        <div class="lv-skel" style="height:13px;width:42%"></div>
                        <div class="lv-skel" style="height:11px;width:26%"></div>
                    </div>
                </div>
            {/each}
        </div>
        <p class="lv-caption" style="margin:8px 2px">{t("hub.firstScan")}</p>
    {:else if plugin.scan?.errors?.length}
        <div class="lv-card"><div class="lv-empty" role="alert"><div class="eic"><UiIcon name="alert" size={22} /></div><b>{t("hub.partialScanTitle")}</b><span>{t("hub.partialScanBody").replace("${n}", String(plugin.scan.errors.length))}</span>
            <button class="b3-button b3-button--outline" style="margin-top:8px" disabled={rescanning} onclick={rescan}>{rescanning ? t("diag.rebuilding") : t("hub.rescan")}</button>
        </div></div>
    {:else if filter !== "all" || filterMember || filterModule || dueWithin !== "all"}
        <div class="lv-card"><div class="lv-empty" role="status"><div class="eic"><UiIcon name="search" size={22} /></div><b>{t("hub.filteredEmpty")}</b><span>{t("hub.filteredEmptyHint")}</span>
            <button class="b3-button b3-button--outline" style="margin-top:8px" onclick={() => { filter = "all"; filterMember = undefined; filterModule = undefined; dueWithin = "all"; pruneSelection(); persistFilter(); }}>{t("hub.clearFilters")}</button>
        </div></div>
    {:else}
        <div class="lv-card"><div class="lv-empty"><div class="eic"><UiIcon name="checkCircle" size={22} /></div><b>{t("dash.allClear")}</b><span>{t("hub.emptyHint")}</span></div></div>
    {/if}
{:else}
    {#each renderedGroups as g (g.key)}
        {#if g.label}<div class="lv-group-label">{g.label} · {g.total}</div>{/if}
        <div class="lv-card lv-rems">
            {#each display(g.items) as entry (entry.key)}
                {#if entry.merged}
                    <!-- 29 组：同成员同日合并卡；PL13：Enter/Space 等价 + aria-expanded -->
                    <div class="lv-rem lead" role="button" tabindex="0"
                        aria-expanded={expandedMerges.has(entry.key)}
                        onkeydown={(e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggleMerge(entry.key))}
                        onclick={() => toggleMerge(entry.key)}>
                        <div class="lv-rem-ic" aria-hidden="true"><UiIcon name="users" size={18} /></div>
                        <div class="lv-rem-t" title={`${memberName(entry.memberId)} · ${entry.dueDate}`}><b>{memberName(entry.memberId)} · {relDue(entry.row.daysLeft, entry.dueDate)}</b><span class="lv-caption">{t("hub.mergeHint")}</span></div>
                        <span class="lv-badge orange">{entry.items.length}</span>
                        <div class="lv-rem-ops"><span class="lv-caption" aria-hidden="true">{expandedMerges.has(entry.key) ? "▾" : "▸"}</span></div>
                    </div>
                    {#if expandedMerges.has(entry.key)}
                        {#each entry.items as sub (sub.id)}
                            {@render remRow(sub)}
                        {/each}
                    {/if}
                {:else}
                    {@render remRow(entry.row)}
                {/if}
            {/each}
        </div>
    {/each}
    {#if filtered.length > renderLimit}
        <div class="lv-card" style="display:flex;justify-content:center;padding:12px">
            <button class="b3-button b3-button--outline" onclick={() => (renderLimit += REMINDER_PAGE_SIZE)}>
                {t("ledger.loadMore").replace("${n}", String(filtered.length - renderLimit))}
            </button>
        </div>
    {/if}
{/if}

<style>
    /* 提醒页局部视觉层级：页头负责摘要，控制区分成筛选与动作两层，避免长工具条抢占内容。 */
    .lv-hub-head {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 20px;
        margin: 4px 2px 18px;
    }
    .lv-hub-title { margin: 0; }
    .lv-hub-title h1 { margin: 2px 0 0; }
    .lv-hub-eyebrow {
        display: block;
        color: var(--lv-accent);
        font-size: 11px;
        font-weight: 650;
        letter-spacing: .08em;
        text-transform: uppercase;
    }
    .lv-hub-summary {
        display: flex;
        align-items: stretch;
        gap: 1px;
        flex: none;
        overflow: hidden;
        border: 1px solid var(--lv-line);
        border-radius: var(--lv-r-3);
        background: var(--lv-surface);
        box-shadow: var(--lv-shadow-1), inset 0 1px 0 var(--lv-inset);
    }
    .lv-hub-summary__item {
        min-width: 74px;
        padding: 9px 13px;
        display: flex;
        flex-direction: column-reverse;
        gap: 2px;
        text-align: right;
        background: var(--lv-surface);
    }
    .lv-hub-summary__item + .lv-hub-summary__item { border-left: 1px solid var(--lv-line); }
    .lv-hub-summary__item span { color: var(--lv-tx-3); font-size: 11px; white-space: nowrap; }
    .lv-hub-summary__item b { font-size: 19px; line-height: 1.1; font-weight: 650; }
    .lv-hub-summary__item.is-overdue b { color: var(--lv-danger); }
    .lv-hub-controls { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, .65fr); gap: 10px; margin-bottom: 18px; }
    .lv-hub-filter-panel, .lv-hub-action-panel { padding: 11px 13px; min-width: 0; }
    .lv-hub-panel-label {
        margin: 0 0 7px 2px;
        color: var(--lv-tx-3);
        font-size: 10.5px;
        font-weight: 600;
        letter-spacing: .06em;
        text-transform: uppercase;
    }
    .lv-hub-filters, .lv-hub-actions { margin: 0; gap: 6px; }
    .lv-hub-filters .b3-select { flex: 1 1 120px; min-width: 0; }
    .lv-hub-actions { align-items: center; }
    .lv-hub-actions .b3-button { flex: 1 1 auto; min-width: 0; }
    .lv-hub-view-toggle { flex: 0 0 auto; padding: 2px; }
    .lv-hub-view-toggle .lv-tabs__item { min-height: 28px; padding: 4px 10px; font-size: 12px; }
    .lv-hub-filters .is-filtered, .lv-hub-actions .is-active { color: var(--lv-accent); border-color: var(--lv-accent-line); background: var(--lv-accent-soft); }
    .lv-capture-recovery { margin-bottom: 12px; padding: 11px 13px; border-color: var(--lv-accent-line); }
    .lv-capture-recovery__head, .lv-capture-recovery__row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .lv-capture-recovery__head { margin-bottom: 8px; }
    .lv-capture-recovery__head .lv-caption { margin: 3px 0 0; }
    .lv-capture-recovery__row { padding: 7px 0; border-top: 1px solid var(--lv-line); }
    .lv-capture-recovery__meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .lv-capture-recovery__meta strong, .lv-capture-recovery__meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lv-capture-recovery__actions { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; }
    .lv-hub-batchbar { padding: 8px 13px; margin-bottom: 12px; border-color: var(--lv-accent-line); background: var(--lv-surface); }
    .lv-hub-batchbar .lv-caption { color: var(--lv-tx-2); font-weight: 600; }
    .lv-named-views {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px dashed var(--lv-line);
        flex-wrap: wrap;
    }
    .lv-named-views__label {
        font-size: 11px;
        color: var(--lv-tx-3);
        white-space: nowrap;
        font-weight: 500;
    }
    .lv-named-view-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11.5px;
        background: var(--lv-surface-2);
        border: 1px solid var(--lv-line);
        color: var(--lv-tx-2);
        cursor: pointer;
        transition: all 0.15s ease;
    }
    .lv-named-view-chip:hover {
        background: var(--lv-surface);
        border-color: var(--lv-line-strong);
        color: var(--lv-tx);
    }
    .lv-named-view-chip.is-active {
        background: var(--lv-accent-soft);
        border-color: var(--lv-accent-line);
        color: var(--lv-accent);
        font-weight: 600;
    }
    .lv-named-view-chip__del {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: var(--lv-tx-3);
        font-size: 13px;
        line-height: 1;
        cursor: pointer;
    }
    .lv-named-view-chip__del:hover {
        background: var(--lv-danger);
        color: #fff;
    }
    .lv-named-views__add {
        font-size: 11.5px;
        padding: 2px 6px;
        color: var(--lv-tx-3);
    }
    .lv-named-views__add:hover {
        color: var(--lv-accent);
    }
    @media (max-width: 760px) {
        .lv-hub-head { align-items: flex-start; flex-direction: column; gap: 10px; margin-bottom: 14px; }
        .lv-hub-summary { align-self: stretch; width: 100%; }
        .lv-hub-summary__item { flex: 1; min-width: 0; text-align: left; }
        .lv-hub-controls { grid-template-columns: 1fr; gap: 8px; }
        .lv-hub-filter-panel, .lv-hub-action-panel { padding: 10px; }
        .lv-hub-actions .b3-button { flex: 1 1 110px; }
    }
    @media (max-width: 420px) {
        .lv-hub-filters .b3-select { flex-basis: calc(50% - 4px); }
        .lv-hub-filters .b3-button { flex-basis: 100%; }
        .lv-hub-actions .b3-button { flex-basis: calc(50% - 4px); }
        .lv-hub-view-toggle { width: 100%; }
        .lv-hub-view-toggle .lv-tabs__item { flex: 1; }
    }
    /* 嵌入思源侧栏时 viewport 仍可能很宽，使用面板容器宽度复用移动布局。 */
    @container lv-home (max-width: 760px) {
        .lv-hub-head { align-items: flex-start; flex-direction: column; gap: 10px; margin-bottom: 14px; }
        .lv-hub-summary { align-self: stretch; width: 100%; }
        .lv-hub-summary__item { flex: 1; min-width: 0; text-align: left; }
        .lv-hub-controls { grid-template-columns: 1fr; gap: 8px; }
        .lv-hub-filter-panel, .lv-hub-action-panel { padding: 10px; }
        .lv-hub-actions .b3-button { flex: 1 1 110px; }
    }
    @container lv-home (max-width: 420px) {
        .lv-hub-filters .b3-select { flex-basis: calc(50% - 4px); }
        .lv-hub-filters .b3-button { flex-basis: 100%; }
        .lv-hub-actions .b3-button { flex-basis: calc(50% - 4px); }
        .lv-hub-view-toggle { width: 100%; }
        .lv-hub-view-toggle .lv-tabs__item { flex: 1; }
        .lv-hub-summary__item { padding-inline: 9px; }
        .lv-hub-summary__item b { font-size: 17px; }
    }
</style>
