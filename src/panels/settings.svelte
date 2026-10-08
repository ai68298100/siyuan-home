<script lang="ts">
    import { showMessage, confirm, Dialog } from "siyuan";
    import { MODULE_GROUPS, modulesByGroup } from "@/core/modules";
    import { newMember, saveSettings, normalizeCheckinBindings } from "@/core/settings";
    import type { HomeSettings, MemberRole, FamilyMember, CheckinBinding } from "@/types";

    interface IHomePluginLike {
        i18n: Record<string, unknown>;
        settings: HomeSettings;
        runtime?: { favorSyncs?: Record<string, Record<string, { docId: string; at: string }>> };
        getDiagnostics?: () => any;
        /** moduleId → schema 目录（D12 深度健康检查 / C8c leadOverrides 枚举用） */
        schemaCatalog?: Record<string, { columns?: { key: string }[]; reminders?: { key: string; field: string; kind: string; leadDays: number }[] }>;
        /** 保存后广播到全部页签（H02）；force=设置变更不受去抖限制 */
        refreshHub?: (only?: string | string[], force?: boolean) => Promise<unknown>;
        /** C8b：新启用模块立即建库 */
        ensureCoreLedgers?: () => Promise<void>;
        /** UG03/DL07：导入前备份探测与恢复 */
        loadData?: (name: string) => Promise<unknown>;
    }

    let { plugin, settings }: {
        plugin: IHomePluginLike;
        settings: HomeSettings;
    } = $props();

    // i18n 取值统一转 string（1.2.8 起 JSONValue）
    const t = (key: string) => String(plugin.i18n[key] ?? key);

    let tab: "modules" | "members" | "reminders" | "about" = $state("modules");
    let saving = $state(false);
    // 33.4 编辑事务：draft 副本，保存才落盘（取消/关闭不污染 settings）。
    // 此处捕获初始快照是设计意图，抑制 svelte 的 locally-referenced 提示。
    // svelte-ignore state_referenced_locally
    let draftEnabled: string[] = $state([...settings.enabledModules]);
    // svelte-ignore state_referenced_locally
    let draftMembers: FamilyMember[] = $state(settings.members.map((m: FamilyMember) => ({ ...m })));
    // C8c 提醒分区 draft：摘要时段/静默时段 + 提前量覆盖（key → 空串=用默认）
    // svelte-ignore state_referenced_locally
    let draftNotifyHour = $state(settings.notifyHour);
    // svelte-ignore state_referenced_locally
    let draftSilentFrom = $state(settings.silentFrom);
    // svelte-ignore state_referenced_locally
    let draftSilentTo = $state(settings.silentTo);
    // svelte-ignore state_referenced_locally
    let draftLeads = $state<Record<string, string>>(
        Object.fromEntries(Object.entries(settings.leadOverrides ?? {}).map(([k, v]) => [k, String(v)])),
    );
    // 229 波：Webhook 推送 draft（Bark / ntfy；发送测试用 draft 值，无需先保存）
    // svelte-ignore state_referenced_locally
    let draftWebhookEnabled = $state(settings.webhookEnabled ?? false);
    // svelte-ignore state_referenced_locally
    let draftWebhookMode = $state<"bark" | "ntfy">(settings.webhookMode === "ntfy" ? "ntfy" : "bark");
    // svelte-ignore state_referenced_locally
    let draftWebhookUrl = $state(settings.webhookUrl ?? "");
    let testingWebhook = $state(false);
    async function testWebhook() {
        testingWebhook = true;
        try {
            const { sendWebhook } = await import("@/core/webhook");
            const r = await sendWebhook({
                ...settings,
                webhookEnabled: true,
                webhookUrl: draftWebhookUrl,
                webhookMode: draftWebhookMode,
            } as HomeSettings, { title: t("hub.title"), body: t("settings.webhookTestBody") });
            showMessage(r === "ok" ? t("settings.webhookTestOk") : t("settings.webhookTestFail"), 3000, r === "ok" ? "info" : "error");
        } finally {
            testingWebhook = false;
        }
    }
    /** C8c：枚举所有模块的提醒规则（leadOverrides 编辑行） */
    const leadRules = $derived.by(() => {
        const catalog = plugin.schemaCatalog ?? {};
        const rows: { key: string; moduleId: string; ruleKey: string; def: number }[] = [];
        for (const [moduleId, schema] of Object.entries(catalog) as [string, any][]) {
            for (const rule of schema?.reminders ?? []) {
                rows.push({ key: `${moduleId}.${rule.key}`, moduleId, ruleKey: rule.key, def: rule.leadDays });
            }
        }
        return rows.sort((a, b) => a.key.localeCompare(b.key));
    });

    const ROLES: MemberRole[] = ["self", "spouse", "partner", "child", "elder", "kin", "other"];
    const enabledIds = $derived(new Set(draftEnabled));
    // C8c 收尾：leadOverrides 编辑行只列启用模块（25+ 全量行过长）；未启用模块的
    // 覆盖值保留在 draftLeads 里不动——关模块保存再开，自定义值原样回来。
    let showAllLeads = $state(false);
    const enabledLeadRules = $derived(leadRules.filter((lr) => enabledIds.has(lr.moduleId)));
    const visibleLeadRules = $derived(showAllLeads ? leadRules : enabledLeadRules);

    // EC09（D20）：打卡绑定 draft——习惯→成员指标映射，只读消费不写打卡数据
    // svelte-ignore state_referenced_locally
    let draftBindings: CheckinBinding[] = $state((settings.checkinBindings ?? []).map((b) => ({ ...b })));
    const METRICS: CheckinBinding["metric"][] = ["count", "quantity", "duration"];
    let checkinItems: { id: string; name: string; kind: string }[] = $state([]);
    let checkinPresent = $state<boolean | null>(null); // null=探测中

    $effect(() => {
        let alive = true;
        (async () => {
            try {
                const ck = (window as { siyuanCheckin?: { whenReady?: () => Promise<boolean>; queryItems?: (o?: { limit?: number }) => { id: string; name: string; kind: string }[] } }).siyuanCheckin;
                if (!ck?.whenReady || !ck?.queryItems) { if (alive) checkinPresent = false; return; }
                const ready = await ck.whenReady();
                if (!alive) return;
                checkinPresent = !!ready;
                if (ready) checkinItems = (ck.queryItems({ limit: 200 }) ?? []).map((it) => ({ id: String(it.id), name: String(it.name), kind: String(it.kind) }));
            } catch { if (alive) checkinPresent = false; }
        })();
        return () => { alive = false; };
    });

    /** kind → 默认指标（binary/count→次数；duration→时长；quantity/custom→数量） */
    function defaultMetric(kind: string): CheckinBinding["metric"] {
        if (kind === "duration") return "duration";
        if (kind === "quantity" || kind === "custom") return "quantity";
        return "count";
    }
    function addBinding() {
        if (!checkinItems.length) return;
        const it = checkinItems[0];
        draftBindings = [...draftBindings, {
            itemId: it.id, itemName: it.name,
            memberId: draftMembers[0]?.id ?? "",
            metric: defaultMetric(it.kind),
        }];
    }
    function removeBinding(i: number) {
        draftBindings = draftBindings.filter((_, idx) => idx !== i);
    }
    function syncBindingItem(b: CheckinBinding) {
        const it = checkinItems.find((x) => x.id === b.itemId);
        if (it) { b.itemName = it.name; b.metric = defaultMetric(it.kind); }
    }

    // 263 波（脏检查）：归一化 helper 与 save() 共用同一份实现——判断口径=落盘口径，永不漂移
    const clampHour = (v: number, fallback: number) => (Number.isFinite(v) ? Math.min(23, Math.max(0, Math.round(v))) : fallback);
    const normWebhookUrl = (u: string) => u.trim().replace(/\/+$/, "");
    const normLeads = (d: Record<string, string>) => Object.fromEntries(
        Object.entries(d)
            .map(([k, v]) => [k, v.trim() === "" ? null : Number(v)] as [string, number | null])
            .filter(([, v]) => v !== null && Number.isFinite(v as number) && (v as number) >= 0)
            .map(([k, v]) => [k, Math.min(3650, v as number)]),
    );
    const memberKey = (m: FamilyMember) => JSON.stringify([m.id, m.name.trim() || "?", m.role, m.birthday ?? "", m.sex ?? "", m.lunarBirthday === true]);

    // settings 是普通对象（属性写不触发响应）——保存落盘后 bump 一次，强迫 dirty 重评
    let savedTick = $state(0);

    /** 草稿是否偏离已保存设置（footer 徽章；四种生效参数全部覆盖） */
    const dirty = $derived.by(() => {
        void savedTick;
        const s = settings;
        const normModules = (ids: string[]) => [...new Set(ids)].sort();
        if (JSON.stringify(normModules(draftEnabled)) !== JSON.stringify(normModules(s.enabledModules))) return true;
        if (draftMembers.map(memberKey).join("|") !== s.members.map(memberKey).join("|")) return true;
        if (clampHour(draftNotifyHour, 8) !== s.notifyHour) return true;
        if (clampHour(draftSilentFrom, 22) !== s.silentFrom || clampHour(draftSilentTo, 8) !== s.silentTo) return true;
        if (draftWebhookMode !== (s.webhookMode === "ntfy" ? "ntfy" : "bark")) return true;
        if (normWebhookUrl(draftWebhookUrl) !== (s.webhookUrl ?? "")) return true;
        if ((draftWebhookEnabled && normWebhookUrl(draftWebhookUrl) !== "") !== (s.webhookEnabled ?? false)) return true;
        if (JSON.stringify(normLeads(draftLeads)) !== JSON.stringify(s.leadOverrides ?? {})) return true;
        if (JSON.stringify(normalizeCheckinBindings(draftBindings)) !== JSON.stringify(s.checkinBindings ?? [])) return true;
        return false;
    });

    // C8b：禁用模块需确认（数据保留语义：只隐藏入口与提醒，台账行不动）
    function toggleModule(id: string, alwaysOn?: boolean) {
        if (alwaysOn) return;
        if (enabledIds.has(id)) {
            confirm(t("settings.disableTitle"), t("settings.disableBody").replace("${name}", t(`module.${id}`)), () => {
                draftEnabled = draftEnabled.filter((x) => x !== id);
            });
        } else {
            draftEnabled = [...draftEnabled, id];
            const mod = modulesByGroup("kids").find((m) => m.id === id);
            if (mod?.suggestRoles?.length) {
                const has = draftMembers.some((m) => mod.suggestRoles!.includes(m.role));
                if (!has) showMessage(t("members.suggestOn"), 3200, "info");
            }
        }
    }

    function enableAll() {
        draftEnabled = MODULE_GROUPS.flatMap((g) => modulesByGroup(g).map((m) => m.id));
    }

    function coreOnly() {
        draftEnabled = MODULE_GROUPS.flatMap((g) => modulesByGroup(g))
            .filter((m) => m.defaultEnabled || m.alwaysOn)
            .map((m) => m.id);
    }

    function addMember() {
        draftMembers = [...draftMembers, newMember(" ", "other")];
    }

    function removeMember(id: string) {
        confirm(t("delete"), t("delete") + "?", () => {
            draftMembers = draftMembers.filter((m) => m.id !== id);
        });
    }

    // 24 组：设置导出/导入（跨设备/重装迁移辅助）
    let importInput: HTMLInputElement | undefined = $state();
    // UG03/DL07：导入前自动备份当前设置，可一键恢复（导入链的数据安全闭环）
    let preImportBackupExists = $state(false);
    $effect(() => {
        // 面板打开时探测一次（备份文件是否存在）
        plugin.loadData?.("settings.pre-import.json").then((v: unknown) => { preImportBackupExists = !!v; }).catch(() => undefined);
    });

    function exportSettings() {
        // G1：设置文件含成员档案/台账引用/提醒运行态——导出前提示保管责任
        confirm(t("settings.exportWarningTitle"), t("settings.exportWarningBody"), () => {
            const payload = JSON.stringify(plugin.settings, null, 2);
            const blob = new Blob([payload], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `siyuan-home-settings-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
        });
    }

    // UG02：脱敏诊断包——确认框声明内容与残余风险，本地组装下载
    function exportDiagnostics() {
        const diag = plugin.getDiagnostics?.();
        if (!diag) { showMessage(t("settings.diagExportNone"), 3000, "error"); return; }
        confirm(t("settings.diagExport"), t("settings.diagExportBody"), () => {
            import("@/core/diagnostics").then(({ buildDiagnosticPackage }) => {
                const payload = buildDiagnosticPackage({
                    diag,
                    enabledModules: [...(plugin.settings.enabledModules ?? [])],
                    platform: navigator.userAgent,
                    generatedAt: new Date().toISOString(),
                });
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `siyuan-home-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(a.href);
                showMessage(t("settings.diagExportDone"), 3000, "info");
            });
        });
    }

    // D06 收尾：同名歧义人工选择对话框——按候选摘要单选，保存写 avItemId（DOM 构建用户内容，不走 HTML 模板——19 组安全）
    function openAmbiguityDialog(ambiguous: { member: string; candidates: { id: string; summary: string }[] }[]) {
        const picks: Record<number, string> = {};
        const dlg = new Dialog({
            title: t("diag.ambigTitle"),
            content: `<div class="b3-dialog__content" id="lv-ambig-body" style="max-height:60vh;overflow:auto"></div>
<div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-ambig-cancel">${t("cancel")}</button><button class="b3-button" id="lv-ambig-ok">${t("save")}</button></div>`,
            width: "520px",
        });
        const body = dlg.element.querySelector("#lv-ambig-body") as HTMLElement;
        ambiguous.forEach((a, ai) => {
            const head = document.createElement("div");
            head.className = "ft__on-surface";
            head.style.cssText = "margin-top:10px;font-size:12px";
            head.textContent = a.member;
            body.appendChild(head);
            for (const c of a.candidates) {
                const line = document.createElement("label");
                line.style.cssText = "display:flex;gap:6px;align-items:center;padding:2px 0 2px 14px;font-size:13px";
                const radio = document.createElement("input");
                radio.type = "radio";
                radio.name = `lv-ambig-${ai}`;
                radio.value = c.id;
                radio.onchange = () => { picks[ai] = c.id; };
                const sp = document.createElement("span");
                sp.textContent = c.summary || t("diag.ambigNoInfo");
                line.append(radio, sp);
                body.appendChild(line);
            }
        });
        (dlg.element.querySelector("#lv-ambig-cancel") as HTMLButtonElement).onclick = () => dlg.destroy();
        (dlg.element.querySelector("#lv-ambig-ok") as HTMLButtonElement).onclick = async () => {
            let applied = 0;
            ambiguous.forEach((a, ai) => {
                const pick = picks[ai];
                if (!pick) return;
                const m = plugin.settings.members.find((x) => x.name === a.member);
                if (m) { m.avItemId = pick; m.syncError = undefined; applied++; }
            });
            dlg.destroy();
            if (applied > 0) {
                await import("@/core/settings").then((m) => m.saveSettings(plugin as any, plugin.settings));
                await plugin.refreshHub?.();
            }
            showMessage(t("diag.ambigDone").replace("${n}", String(applied)), 3000, "info");
        };
    }

    async function restorePreImport() {
        confirm(t("settings.restoreTitle"), t("settings.restoreBody"), async () => {
            try {
                const backup = await plugin.loadData?.("settings.pre-import.json");
                if (!backup) { showMessage(t("settings.importBad"), 4000, "error"); return; }
                plugin.settings = backup as HomeSettings;
                await import("@/core/settings").then((m) => m.saveSettings(plugin as any, plugin.settings));
                await plugin.ensureCoreLedgers?.();
                await plugin.refreshHub?.();
                showMessage(t("settings.restoreDone"), 3000, "info");
            } catch (e) {
                showMessage(t("settings.importBad"), 4000, "error");
            }
        });
    }

    async function importSettings(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        (e.target as HTMLInputElement).value = ""; // 允许重复选择同一文件
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            // 形状校验（33.2：坏文件拒绝导入，不覆盖当前设置）
            if (!Array.isArray(data?.enabledModules) || !Array.isArray(data?.members) || typeof data?.dbRefs !== "object") {
                throw new Error("invalid settings shape");
            }
            confirm(t("settings.importTitle"), t("settings.importBody").replace("${file}", file.name), async () => {
                // UG03/DL07：覆盖前自动备份当前设置（可经"恢复导入前设置"一键回滚）
                try {
                    await (plugin as any).saveData?.("settings.pre-import.json", JSON.parse(JSON.stringify(plugin.settings)));
                    preImportBackupExists = true;
                } catch {
                    // 备份失败不阻断导入（导出的 JSON 文件仍是用户侧备份）
                }
                // 24 组/16 轮：导入归一化——未知模块剔除进报告、成员字段修复，不再静默丢弃
                const { normalizeImportedSettings } = await import("@/core/settings");
                const norm = normalizeImportedSettings(data);
                plugin.settings = norm.settings;
                await import("@/core/settings").then((m) => m.saveSettings(plugin as any, plugin.settings));
                await plugin.ensureCoreLedgers?.();
                await plugin.refreshHub?.();
                if (norm.droppedModules.length > 0 || norm.repairedMembers > 0) {
                    showMessage(t("settings.importNormalized")
                        .replace("${m}", String(norm.droppedModules.length))
                        .replace("${r}", String(norm.repairedMembers)), 6000, "info");
                } else {
                    showMessage(t("settings.importDone"), 3000, "info");
                }
            });
        } catch (err) {
            showMessage(`${t("settings.importBad")}${err instanceof Error ? ` (${err.message})` : ""}`, 5000, "error");
        }
    }

    async function save() {
        saving = true;
        try {            const prevMembers = plugin.settings.members;
            const prevModules = new Set(plugin.settings.enabledModules);
            const modulesChanged = draftEnabled.length !== prevModules.size || draftEnabled.some((id) => !prevModules.has(id));
            plugin.settings.enabledModules = [...draftEnabled];
            plugin.settings.members = draftMembers.map((m) => ({ ...m, name: m.name.trim() || "?" }));
            // C8c：提醒设置落盘（无效时段值忽略，保持 0-23 界内）；263 波起与脏检查共用 clampHour
            plugin.settings.notifyHour = clampHour(draftNotifyHour, 8);
            plugin.settings.silentFrom = clampHour(draftSilentFrom, 22);
            plugin.settings.silentTo = clampHour(draftSilentTo, 8);
            // 229 波：Webhook 落盘（URL 归一去尾斜杠/空白；空串=不推送）；263 波起与脏检查共用 normWebhookUrl
            plugin.settings.webhookEnabled = draftWebhookEnabled && normWebhookUrl(draftWebhookUrl) !== "";
            plugin.settings.webhookUrl = normWebhookUrl(draftWebhookUrl);
            plugin.settings.webhookMode = draftWebhookMode;
            // 263 波：与脏检查共用 normLeads
            plugin.settings.leadOverrides = normLeads(draftLeads);
            // EC09：打卡绑定落盘（清洗在 normalize——缺 id/metric 非法剔除、去重）
            plugin.settings.checkinBindings = normalizeCheckinBindings(draftBindings);
            await saveSettings(plugin as any, plugin.settings);
            // C8b：模块开关接线——新启用模块立即建库（禁用只隐藏保留数据）
            if (modulesChanged) {
                // EC15：禁用模块时清理其 favorSyncs 运行态数据
                const disabledModules = [...prevModules].filter((id) => !draftEnabled.includes(id));
                if (disabledModules.length > 0 && plugin.runtime?.favorSyncs) {
                    for (const mid of disabledModules) delete plugin.runtime.favorSyncs[mid];
                }
                await plugin.ensureCoreLedgers?.();
            }
            // D05：设置页与成员页同走成员 DAL——差异同步到 members 台账行（新增建行/变更写回）
            const { syncMembersToAv } = await import("@/core/members");
            const rep = await syncMembersToAv(plugin as any, plugin.settings, prevMembers);
            // H02：设置变更（模块开关/成员）广播到全部页签（强制全量重扫——设置变更不受去抖限制）
            await plugin.refreshHub?.(undefined, true);
            if (rep.failed.length > 0) {
                showMessage(t("members.syncPartial").replace("${n}", String(rep.failed.length)), 5000, "error");
            } else {
                showMessage(t("saved"), 2000, "info");
            }
            savedTick += 1; // 263 波：落盘完成后重评 dirty（settings 非响应式，见上）
        } catch (e) {
            // §15/186 波：saveSettings 重试仍失败（或成员同步抛错）→ 显式上报，不静默假成功
            showMessage(`${t("settings.saveFailed")}${e instanceof Error ? ` (${e.message})` : ""}`, 6000, "error");
        } finally {
            saving = false;
        }
    }
</script>

<div class="lv-home lv-settings">
    <!-- 251 波（对齐原型设置屏）：左侧锚点导航 + 右侧分组卡片；b3-tab-bar 横排页签退役 -->
    <nav class="lv-setnav" aria-label={t("settingsTitle")}>
        <button class="lv-setnav__item {tab === 'modules' ? 'on' : ''}" aria-current={tab === 'modules' ? 'true' : undefined} onclick={() => (tab = "modules")}>🧩 {t("tabModules")}</button>
        <button class="lv-setnav__item {tab === 'members' ? 'on' : ''}" aria-current={tab === 'members' ? 'true' : undefined} onclick={() => (tab = "members")}>👪 {t("tabMembers")}</button>
        <button class="lv-setnav__item {tab === 'reminders' ? 'on' : ''}" aria-current={tab === 'reminders' ? 'true' : undefined} onclick={() => (tab = "reminders")}>⏰ {t("tabReminders")}</button>
        <button class="lv-setnav__item {tab === 'about' ? 'on' : ''}" aria-current={tab === 'about' ? 'true' : undefined} onclick={() => (tab = "about")}>ℹ️ {t("tabAbout")}</button>
    </nav>

    <div class="lv-setpane">
    {#if tab === "modules"}
        <div class="lv-card lv-setcard lv-setcard--hint">{t("settings.modulesHint")}</div>
        {#each MODULE_GROUPS as gid (gid)}
            <div class="lv-card lv-setcard">
                <div class="lv-setcard__title">{t(`group.${gid}`)}</div>
                {#each modulesByGroup(gid) as mod (mod.id)}
                    <div class="fn__flex lv-settings__row">
                        <input
                            type="checkbox"
                            class="b3-switch"
                            checked={enabledIds.has(mod.id)}
                            disabled={mod.alwaysOn}
                            onchange={() => toggleModule(mod.id, mod.alwaysOn)}
                        />
                        <div class="fn__flex-1 fn__flex-column">
                            <span>
                                {t(`module.${mod.id}`)}
                                <!-- 259 波：徽章归入 lv 体系（灰阶）——此前 31 行"开发中"全蓝 b3-chip
                                     让整个模块页充满主色噪点；徽章=属性标注，不抢开关的主角色 -->
                                {#if mod.alwaysOn}<span class="lv-badge gray">{t("alwaysOn")}</span>{/if}
                                {#if mod.devStatus === "skeleton"}<span class="lv-badge gray">{t("skeleton")}</span>{/if}
                            </span>
                            <span class="b3-card__info-meta">{t(`module.${mod.id}.desc`)}</span>
                            {#if mod.suggestRoles?.length && !enabledIds.has(mod.id)}
                                <span class="ft__smaller ft__on-surface">
                                    {t("settings.suggestRoles")}
                                    {mod.suggestRoles.map((r) => t(`role.${r}`)).join(" / ")}
                                </span>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        {/each}
    {:else if tab === "members"}
        <div class="lv-card lv-setcard">
            <div class="lv-setcard__hint">{t("settings.membersHint")}</div>
            {#if draftMembers.length === 0}
                <div class="lv-setcard__hint ft__on-surface">{t("members.empty")}</div>
            {/if}
            {#each draftMembers as m, i (m.id)}
                <div class="fn__flex lv-settings__row lv-settings__member">
                    <input class="b3-text-field fn__size200" placeholder={t("members.name")} bind:value={draftMembers[i].name} />
                    <select class="b3-select" bind:value={draftMembers[i].role}>
                        {#each ROLES as r (r)}
                            <option value={r}>{t(`role.${r}`)}</option>
                        {/each}
                    </select>
                    <select class="b3-select" bind:value={draftMembers[i].sex} title={t("members.sex")}>
                        <option value={undefined}>{t("members.sex.unknown")}</option>
                        <option value="male">{t("members.sex.male")}</option>
                        <option value="female">{t("members.sex.female")}</option>
                    </select>
                    <input class="b3-text-field" type="date" bind:value={draftMembers[i].birthday} title={t("members.birthday")} />
                    <label class="fn__flex">
                        <input type="checkbox" class="b3-switch" bind:checked={draftMembers[i].lunarBirthday} />
                        <span>{t("members.lunar")}</span>
                    </label>
                    <span class="fn__flex-1"></span>
                    <button class="b3-button b3-button--outline" onclick={() => removeMember(m.id)}>{t("delete")}</button>
                </div>
            {/each}
            <button class="b3-button b3-button--outline lv-setcard__action" onclick={addMember}>＋ {t("add")}</button>
        </div>
    {:else if tab === "reminders"}
        <div class="lv-card lv-setcard">
            <div class="lv-setcard__title">{t("tabReminders")}</div>
            <div class="lv-setcard__hint">{t("settings.remindersHint")}</div>
            <div class="fn__flex lv-settings__row">
                <span style="min-width:180px">{t("settings.notifyHour")}</span>
                <input class="b3-text-field" style="width:90px" type="number" min="0" max="23" bind:value={draftNotifyHour} />
                <span class="lv-caption fn__flex-1">{t("settings.notifyHourHint")}</span>
            </div>
            <div class="fn__flex lv-settings__row">
                <span style="min-width:180px">{t("settings.silentHours")}</span>
                <input class="b3-text-field" style="width:70px" type="number" min="0" max="23" bind:value={draftSilentFrom} />
                <span class="lv-caption" style="margin:0 6px">→</span>
                <input class="b3-text-field" style="width:70px" type="number" min="0" max="23" bind:value={draftSilentTo} />
                <span class="lv-caption fn__flex-1">{t("settings.silentHoursHint")}</span>
            </div>
        </div>
        <div class="lv-card lv-setcard">
            <div class="lv-setcard__title">{t("settings.webhookTitle")}</div>
            <div class="lv-setcard__hint">{t("settings.webhookHint")}</div>
            <div class="fn__flex lv-settings__row">
                <span style="min-width:180px">{t("settings.webhookEnable")}</span>
                <input type="checkbox" class="b3-switch" bind:checked={draftWebhookEnabled} />
                <span class="lv-caption fn__flex-1"></span>
            </div>
            <div class="fn__flex lv-settings__row">
                <span style="min-width:180px">{t("settings.webhookMode")}</span>
                <select class="b3-select" bind:value={draftWebhookMode}>
                    <option value="bark">Bark</option>
                    <option value="ntfy">ntfy</option>
                </select>
                <span class="lv-caption fn__flex-1"></span>
            </div>
            <div class="fn__flex lv-settings__row">
                <span style="min-width:180px">{t("settings.webhookUrl")}</span>
                <input class="b3-text-field fn__flex-1" style="min-width:0" bind:value={draftWebhookUrl}
                    placeholder="https://api.day.app/yourkey" />
            </div>
            <button class="b3-button b3-button--outline lv-setcard__action" disabled={testingWebhook || !draftWebhookUrl.trim()}
                onclick={testWebhook}>{testingWebhook ? t("settings.webhookTesting") : t("settings.webhookTest")}</button>
        </div>
        <div class="lv-card lv-setcard">
            <div class="lv-setcard__title">{t("settings.leadsTitle")}</div>
            <div class="lv-setcard__hint">{t("settings.leadsHint")}</div>
            {#if enabledLeadRules.length < leadRules.length}
                <button class="b3-button b3-button--text lv-setcard__action" onclick={() => (showAllLeads = !showAllLeads)}>
                    {showAllLeads ? t("settings.leadsEnabledOnly") : t("settings.leadsShowAll").replace("${n}", String(leadRules.length - enabledLeadRules.length))}
                </button>
            {/if}
            {#each visibleLeadRules as lr (lr.key)}
                <div class="fn__flex lv-settings__row" style={enabledIds.has(lr.moduleId) ? "" : "opacity:.55"}>
                    <span style="min-width:220px">{t(`module.${lr.moduleId}`)} · {t(`rule.${lr.ruleKey}`) !== `rule.${lr.ruleKey}` ? t(`rule.${lr.ruleKey}`) : lr.ruleKey}</span>
                    <input class="b3-text-field" style="width:90px" type="number" min="0" max="3650"
                        placeholder={String(lr.def)}
                        bind:value={draftLeads[lr.key]} />
                    <span class="lv-caption fn__flex-1">{t("settings.leadDefault").replace("${n}", String(lr.def))}{#if !enabledIds.has(lr.moduleId)} · {t("settings.leadDisabled")}{/if}</span>
                </div>
            {/each}
        </div>
        <!-- EC09（D20）：打卡习惯 → 成员指标绑定（只读消费） -->
        <div class="lv-card lv-setcard">
            <div class="lv-setcard__title">{t("settings.checkinBindingsTitle")}</div>
            <div class="lv-setcard__hint">{t("settings.checkinBindingsHint")}</div>
            {#if checkinPresent === false}
                <p class="lv-setcard__hint" style="color:var(--lv-warn)">{t("settings.checkinAbsent")}</p>
            {:else if checkinPresent === true}
                {#each draftBindings as b, i}
                    <div class="fn__flex lv-settings__row" style="gap:6px">
                        <select class="b3-select" style="width:auto" bind:value={b.memberId} aria-label={t("settings.metricMember")}>
                            {#each draftMembers as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
                        </select>
                        <span class="lv-caption">·</span>
                        <select class="b3-select" style="width:auto" bind:value={b.itemId} onchange={() => syncBindingItem(b)} aria-label={t("settings.metricItem")}>
                            {#each checkinItems as it (it.id)}<option value={it.id}>{it.name}</option>{/each}
                        </select>
                        <select class="b3-select" style="width:auto" bind:value={b.metric} aria-label={t("settings.metricKind")}>
                            {#each METRICS as mt (mt)}<option value={mt}>{t(`settings.metric.${mt}`)}</option>{/each}
                        </select>
                        <button class="b3-button b3-button--text" title={t("delete")} onclick={() => removeBinding(i)}>✕</button>
                    </div>
                {/each}
                {#if draftBindings.length === 0}
                    <p class="lv-setcard__hint ft__on-surface">{t("settings.checkinEmpty")}</p>
                {/if}
                <button class="b3-button b3-button--outline lv-setcard__action" disabled={!checkinItems.length} onclick={addBinding}>＋ {t("settings.checkinAdd")}</button>
            {/if}
        </div>
    {:else}
        <div class="lv-card lv-setcard">
            <div class="lv-settings__about">
                <p>{t("about.line1")}</p>
                <p>{t("about.tagline")}</p>
                <p class="ft__on-surface">{t("about.principles")}</p>
                <button class="b3-button b3-button--outline lv-setcard__action"
                    onclick={async () => {
                        plugin.settings.onboarded = false;
                        await import("@/core/settings").then((m) => m.saveSettings(plugin as any, plugin.settings));
                        showMessage(t("wiz.rerunHint"), 3000, "info");
                    }}>{t("wiz.rerun")}</button>
                <!-- C8e：关于区仓库链接（SDK 无 open 导出，走浏览器新窗口） -->
                <button class="b3-button b3-button--outline" style="margin-top:8px;margin-left:6px"
                    onclick={() => window.open("https://github.com/ai68298100/siyuan-home", "_blank")}>{t("about.repo")}</button>
            </div>
        </div>
        <!-- 24 组：设置导出/导入（跨设备/重装迁移辅助） -->
        <div class="lv-card lv-setcard">
            <div class="lv-setcard__title">{t("settings.migrateTitle")}</div>
            <div class="lv-setcard__hint" style="color:var(--lv-warn)">⚠ {t("settings.migratePrivacy")}</div>
            <div class="lv-setcard__actions">
                <button class="b3-button b3-button--outline" onclick={exportSettings}>{t("settings.export")}</button>
                <button class="b3-button b3-button--outline" onclick={() => importInput?.click()}>{t("settings.import")}</button>
                <input type="file" accept="application/json,.json" style="display:none"
                    bind:this={importInput} onchange={(e) => importSettings(e)} />
                {#if preImportBackupExists}
                    <!-- UG03/DL07：导入前自动备份的回滚入口 -->
                    <button class="b3-button b3-button--outline" onclick={restorePreImport}>{t("settings.restoreBtn")}</button>
                {/if}
            </div>
        </div>
        <!-- 24 组/CM07：示例数据一键生成/清除（新用户体验与截图；【示例】前缀可识别可回滚） -->
        <div class="lv-card lv-setcard">
            <div class="lv-setcard__title">{t("settings.demoTitle")}</div>
            <div class="lv-setcard__hint">{t("settings.demoHint")}</div>
            <div class="lv-setcard__actions">
                <button class="b3-button b3-button--outline" onclick={async () => {
                    const { generateDemoData } = await import("@/core/demo");
                    const res = await generateDemoData(plugin as any, plugin.settings, plugin.schemaCatalog ?? {});
                    // 268 波：回执先行——重扫（31 模块+千行规模可达分钟级）转后台执行，
                    // 完成时 version 广播照常驱动各屏刷新；此前 await 阻塞让用户点按钮后分钟级无反馈
                    showMessage(res.errors.length ? t("settings.demoPartial").replace("${n}", String(res.errors.length)) : t("settings.demoDone").replace("${n}", String(res.created)), 5000, res.errors.length ? "error" : "info");
                    plugin.refreshHub?.().catch((e) => console.warn("[siyuan-home] demo rescan failed:", e));
                }}>{t("settings.demoGenerate")}</button>
                <button class="b3-button b3-button--outline" onclick={async () => {
                    confirm(t("settings.demoClearTitle"), t("settings.demoClearBody"), async () => {
                        const { clearDemoData } = await import("@/core/demo");
                        const res = await clearDemoData(plugin as any, plugin.settings);
                        await plugin.refreshHub?.();
                        showMessage(res.errors.length
                            ? t("settings.demoClearPartial").replace("${n}", String(res.cleared)).replace("${m}", String(res.errors.length))
                            : t("settings.demoClearDone").replace("${n}", String(res.cleared)), 6000, res.errors.length ? "error" : "info");
                    });
                }}>{t("settings.demoClear")}</button>
            </div>
        </div>
        <!-- C8d：生态分区占位（v0.3 接线；开关仅展示，不可用） -->
        <div class="lv-card lv-setcard">
            <div class="lv-setcard__title">{t("settings.ecoTitle")}</div>
            <div class="lv-setcard__hint">{t("settings.ecoHint")}</div>
            {#each ["qiandao", "contacts", "glean", "exam", "flashcard", "leiqie"] as eco (eco)}
                <div class="fn__flex lv-settings__row">
                    <input type="checkbox" class="b3-switch" disabled />
                    <span class="fn__flex-1">{t(`eco.${eco}`)} <span class="lv-badge gray">{t("settings.ecoPlanned")}</span></span>
                </div>
            {/each}
        </div>
        <div class="lv-card lv-setcard">
            <div class="lv-setcard__title">⌨ {t("faq.shortcuts")}</div>
            <p class="lv-caption" style="margin:2px 0">· {t("openButler")}：{t("faq.topbarOrCommand")}</p>
            <p class="lv-caption" style="margin:2px 0">· {t("faq.quickCapture")}：{t("faq.topbarBolt")}</p>
        </div>
        {#if tab === "about"}
            {@const diag = plugin.getDiagnostics?.()}
            {#if diag}
                <div class="lv-card lv-setcard">
                    <div class="lv-setcard__title">{t("diag.title")} · v{diag.version}</div>
                    <p class="lv-caption" style="margin:2px 0 8px">{t("hub.scannedAt")} {diag.scannedAt ? new Date(diag.scannedAt).toLocaleString() : "—"}</p>
                    {#each diag.ledgers as l (l.id)}
                        <p class="lv-caption">
                            {t(`module.${l.id}`)}：
                            {l.provisioned ? (l.provisional ? t("diag.provisional") : t("diag.ok")) : t("diag.missing")}
                            · {t("diag.columns")} {l.columns}
                        </p>
                    {/each}
                    {#each diag.ledgers.filter((l) => l.error) as l (l.id)}
                        <p class="lv-caption" style="color:var(--lv-danger)">{t(`module.${l.id}`)}: {l.error}</p>
                    {/each}
                    {#if diag.errors.length > 0}
                        {#each diag.errors as e (e.moduleId)}
                            <p class="lv-caption" style="color:var(--lv-danger)">{e.moduleId}: {e.message}</p>
                        {/each}
                    {/if}
                    {#if diag.contracts.length > 0}
                        {#each diag.contracts as c (c)}
                            <p class="lv-caption" style="color:var(--lv-danger)">{c}</p>
                        {/each}
                    {/if}
                    <div class="lv-setcard__actions" style="margin-top:8px">
                        <button class="b3-button b3-button--outline" onclick={exportDiagnostics}>{t("settings.diagExport")}</button>
                        {#if (plugin.settings.members ?? []).some((m) => !m.avItemId || m.syncError)}
                            <button class="b3-button b3-button--outline"
                                onclick={async () => {
                                    const { backfillMemberLinks } = await import("@/core/members");
                                    const res = await backfillMemberLinks(plugin as any, plugin.settings);
                                    // D06：回填结果四态——唯一回填 / 同名歧义待人工 / 无匹配 / 失效关联已清除
                                    showMessage(t("diag.backfillResult")
                                        .replace("${n}", String(res.linked.length))
                                        .replace("${amb}", String(res.ambiguous.length))
                                        .replace("${stale}", String(res.stale.length)), 6000, "info");
                                    if (res.ambiguous.length > 0) openAmbiguityDialog(res.ambiguous);
                                }}>{t("diag.backfill")}</button>
                        {/if}
                        <button class="b3-button b3-button--outline"
                            onclick={async () => {
                                const { findDuplicateLedgers } = await import("@/core/provisioner");
                                const dups = await findDuplicateLedgers(plugin.settings);
                                showMessage(dups.length === 0 ? t("diag.dupNone") : t("diag.dupFound").replace("${n}", String(dups.length)) + ": " + dups.map((d) => d.hpath).join(", "), 6000, dups.length ? "error" : "info");
                            }}>{t("diag.dupCheck")}</button>
                        <!-- D12 最小健康检查：实际读取每个启用模块，登记存在≠健康 -->
                        <button class="b3-button b3-button--outline"
                            onclick={async () => {
                                const { runHealthCheck } = await import("@/core/health");
                                const report = await runHealthCheck(plugin.settings, plugin.schemaCatalog ?? {});
                                const bad = report.modules.filter((m) => !m.ok);
                                const detail = bad.map((m) => `${t(`module.${m.moduleId}`)}: ${m.error ?? t("diag.healthMissingCols").replace("${n}", String(m.missingColumns?.length ?? 0))}`).join("；");
                                showMessage(
                                    (detail
                                        ? t("diag.healthSummaryBad").replace("${ok}", String(report.modules.length - bad.length)).replace("${total}", String(report.modules.length)).replace("${detail}", detail)
                                        : t("diag.healthSummary").replace("${total}", String(report.modules.length))),
                                    7000, bad.length ? "error" : "info");
                            }}>{t("diag.health")}</button>
                    </div>
                </div>
            {/if}
        {/if}
    {/if}
    </div>

    <div class="fn__flex lv-settings__footer">
        {#if tab === "modules"}
            <button class="b3-button b3-button--text" onclick={enableAll}>{t("enableAll")}</button>
            <button class="b3-button b3-button--text" onclick={coreOnly}>{t("coreOnly")}</button>
        {/if}
        <span class="fn__flex-1"></span>
        <!-- 263 波：未保存更改徽章（脏检查口径=落盘口径）——设置页有两种生效心智（草稿+保存），
             让"改了但还没保存"可见，不再靠猜 -->
        {#if dirty}<span class="lv-badge orange" role="status">● {t("settings.unsaved")}</span>{/if}
        <!-- 256 波：保存是设置视图唯一核心动作，升为主按钮（对齐原型"主按钮每视图 ≤1 个"） -->
        <button class="lv-btn primary" disabled={saving} onclick={save}>{t("save")}</button>
    </div>
</div>
