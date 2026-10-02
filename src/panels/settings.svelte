<script lang="ts">
    import { showMessage, confirm } from "siyuan";
    import { MODULE_GROUPS, modulesByGroup } from "@/core/modules";
    import { newMember, saveSettings } from "@/core/settings";
    import type { HomeSettings, MemberRole } from "@/types";

    interface IHomePluginLike {
        i18n: Record<string, unknown>;
        settings: HomeSettings;
        getDiagnostics?: () => any;
        /** moduleId → schema 目录（D12 深度健康检查 / C8c leadOverrides 枚举用） */
        schemaCatalog?: Record<string, { columns?: { key: string }[]; reminders?: { key: string; field: string; kind: string; leadDays: number }[] }>;
        /** 保存后广播到全部页签（H02） */
        refreshHub?: () => Promise<unknown>;
        /** C8b：新启用模块立即建库 */
        ensureCoreLedgers?: () => Promise<void>;
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
    let draftMembers: any[] = $state(settings.members.map((m: any) => ({ ...m })));
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

    function exportSettings() {
        const payload = JSON.stringify(plugin.settings, null, 2);
        const blob = new Blob([payload], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `siyuan-home-settings-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
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
                const { defaultSettings } = await import("@/core/settings");
                const merged = { ...defaultSettings(), ...data };
                plugin.settings = merged;
                await import("@/core/settings").then((m) => m.saveSettings(plugin as any, plugin.settings));
                await plugin.ensureCoreLedgers?.();
                await plugin.refreshHub?.();
                showMessage(t("settings.importDone"), 3000, "info");
            });
        } catch (err) {
            showMessage(`${t("settings.importBad")}${err instanceof Error ? ` (${err.message})` : ""}`, 5000, "error");
        }
    }

    async function save() {
        saving = true;
        try {
            const prevMembers = plugin.settings.members;
            const prevModules = new Set(plugin.settings.enabledModules);
            const modulesChanged = draftEnabled.length !== prevModules.size || draftEnabled.some((id) => !prevModules.has(id));
            plugin.settings.enabledModules = [...draftEnabled];
            plugin.settings.members = draftMembers.map((m) => ({ ...m, name: m.name.trim() || "?" }));
            // C8c：提醒设置落盘（无效时段值忽略，保持 0-23 界内）
            const clampHour = (v: number, fallback: number) => (Number.isFinite(v) ? Math.min(23, Math.max(0, Math.round(v))) : fallback);
            plugin.settings.notifyHour = clampHour(draftNotifyHour, 8);
            plugin.settings.silentFrom = clampHour(draftSilentFrom, 22);
            plugin.settings.silentTo = clampHour(draftSilentTo, 8);
            plugin.settings.leadOverrides = Object.fromEntries(
                Object.entries(draftLeads)
                    .map(([k, v]) => [k, v.trim() === "" ? null : Number(v)] as [string, number | null])
                    .filter(([, v]) => v !== null && Number.isFinite(v as number) && (v as number) >= 0)
                    .map(([k, v]) => [k, Math.min(3650, v as number)]),
            );
            await saveSettings(plugin as any, plugin.settings);
            // C8b：模块开关接线——新启用模块立即建库（禁用只隐藏保留数据）
            if (modulesChanged) await plugin.ensureCoreLedgers?.();
            // D05：设置页与成员页同走成员 DAL——差异同步到 members 台账行（新增建行/变更写回）
            const { syncMembersToAv } = await import("@/core/members");
            const rep = await syncMembersToAv(plugin as any, plugin.settings, prevMembers);
            // H02：设置变更（模块开关/成员）广播到全部页签（重扫收敛提醒与计数）
            await plugin.refreshHub?.();
            if (rep.failed.length > 0) {
                showMessage(t("members.syncPartial").replace("${n}", String(rep.failed.length)), 5000, "error");
            } else {
                showMessage(t("saved"), 2000, "info");
            }
        } finally {
            saving = false;
        }
    }
</script>

<div class="lv-home lv-settings">
    <div class="fn__flex b3-tab-bar">
        <button class="b3-button {tab === 'modules' ? 'b3-button--text' : ''}" onclick={() => (tab = "modules")}>{t("tabModules")}</button>
        <button class="b3-button {tab === 'members' ? 'b3-button--text' : ''}" onclick={() => (tab = "members")}>{t("tabMembers")}</button>
        <button class="b3-button {tab === 'reminders' ? 'b3-button--text' : ''}" onclick={() => (tab = "reminders")}>{t("tabReminders")}</button>
        <button class="b3-button {tab === 'about' ? 'b3-button--text' : ''}" onclick={() => (tab = "about")}>{t("tabAbout")}</button>
    </div>

    {#if tab === "modules"}
        <div class="lv-settings__hint">{t("settings.modulesHint")}</div>
        {#each MODULE_GROUPS as gid (gid)}
            <div class="lv-settings__group">
                <div class="lv-settings__group-title">{t(`group.${gid}`)}</div>
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
                                {#if mod.alwaysOn}<span class="b3-chip b3-chip--secondary b3-chip--small">{t("alwaysOn")}</span>{/if}
                                {#if mod.devStatus === "skeleton"}<span class="b3-chip b3-chip--primary b3-chip--small">{t("skeleton")}</span>{/if}
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
        <div class="lv-settings__hint">{t("settings.membersHint")}</div>
        {#if draftMembers.length === 0}
            <div class="lv-settings__hint ft__on-surface">{t("members.empty")}</div>
        {/if}
        {#each draftMembers as m, i (m.id)}
            <div class="fn__flex lv-settings__row lv-settings__member">
                <input class="b3-text-field fn__size200" placeholder={t("members.name")} bind:value={draftMembers[i].name} />
                <select class="b3-select" bind:value={draftMembers[i].role}>
                    {#each ROLES as r (r)}
                        <option value={r}>{t(`role.${r}`)}</option>
                    {/each}
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
        <button class="b3-button b3-button--outline" onclick={addMember}>＋ {t("add")}</button>
    {:else if tab === "reminders"}
        <div class="lv-settings__hint">{t("settings.remindersHint")}</div>
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
        <div style="margin-top:12px;border-top:1px solid var(--b3-border-color);padding-top:8px">
            <p class="lv-caption">{t("settings.leadsTitle")}</p>
            <p class="lv-caption ft__on-surface">{t("settings.leadsHint")}</p>
        </div>
        {#each leadRules as lr (lr.key)}
            <div class="fn__flex lv-settings__row">
                <span style="min-width:220px">{t(`module.${lr.moduleId}`)} · {t(`rule.${lr.ruleKey}`) !== `rule.${lr.ruleKey}` ? t(`rule.${lr.ruleKey}`) : lr.ruleKey}</span>
                <input class="b3-text-field" style="width:90px" type="number" min="0" max="3650"
                    placeholder={String(lr.def)}
                    bind:value={draftLeads[lr.key]} />
                <span class="lv-caption fn__flex-1">{t("settings.leadDefault").replace("${n}", String(lr.def))}</span>
            </div>
        {/each}
    {:else}
        <div class="lv-settings__about">
            <p>{t("about.line1")}</p>
            <p>{t("about.tagline")}</p>
            <p class="ft__on-surface">{t("about.principles")}</p>
            <button class="b3-button b3-button--outline" style="margin-top:8px"
                onclick={async () => {
                    plugin.settings.onboarded = false;
                    await import("@/core/settings").then((m) => m.saveSettings(plugin as any, plugin.settings));
                    showMessage(t("wiz.rerunHint"), 3000, "info");
                }}>{t("wiz.rerun")}</button>
            <!-- C8e：关于区仓库链接（SDK 无 open 导出，走浏览器新窗口） -->
            <button class="b3-button b3-button--outline" style="margin-top:8px;margin-left:6px"
                onclick={() => window.open("https://github.com/ai68298100/siyuan-home", "_blank")}>{t("about.repo")}</button>
            <!-- 24 组：设置导出/导入（跨设备/重装迁移辅助） -->
            <div style="margin-top:14px;border-top:1px solid var(--b3-border-color);padding-top:10px">
                <p class="lv-caption">{t("settings.migrateTitle")}</p>
                <p class="lv-caption ft__on-surface" style="color:var(--lv-warn)">⚠ {t("settings.migratePrivacy")}</p>
                <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
                    <button class="b3-button b3-button--outline" onclick={exportSettings}>{t("settings.export")}</button>
                    <button class="b3-button b3-button--outline" onclick={() => importInput?.click()}>{t("settings.import")}</button>
                    <input type="file" accept="application/json,.json" style="display:none"
                        bind:this={importInput} onchange={(e) => importSettings(e)} />
                </div>
            </div>
            <!-- C8d：生态分区占位（v0.3 接线；开关仅展示，不可用） -->
            <div style="margin-top:14px;border-top:1px solid var(--b3-border-color);padding-top:10px">
                <p class="lv-caption">{t("settings.ecoTitle")}</p>
                <p class="lv-caption ft__on-surface">{t("settings.ecoHint")}</p>
                {#each ["qiandao", "contacts", "glean", "exam", "flashcard", "leiqie"] as eco (eco)}
                    <div class="fn__flex lv-settings__row">
                        <input type="checkbox" class="b3-switch" disabled />
                        <span class="fn__flex-1">{t(`eco.${eco}`)} <span class="b3-chip b3-chip--small">{t("settings.ecoPlanned")}</span></span>
                    </div>
                {/each}
            </div>
            <div style="margin-top:10px;border-top:1px solid var(--b3-border-color);padding-top:8px">
                <p class="lv-caption">⌨ {t("faq.shortcuts")}</p>
                <p class="lv-caption">· {t("openButler")}：{t("faq.topbarOrCommand")}</p>
                <p class="lv-caption">· {t("faq.quickCapture")}：{t("faq.topbarBolt")}</p>
            </div>
            {#if tab === "about"}
                {@const diag = plugin.getDiagnostics?.()}
                {#if diag}
                    <div style="margin-top:14px;border-top:1px solid var(--b3-border-color);padding-top:10px">
                        <p class="lv-caption">{t("diag.title")} · v{diag.version} · {t("hub.scannedAt")} {diag.scannedAt ? new Date(diag.scannedAt).toLocaleString() : "—"}</p>
                        {#each diag.ledgers as l (l.id)}
                            <p class="lv-caption">
                                {t(`module.${l.id}`)}：
                                {l.provisioned ? (l.provisional ? t("diag.provisional") : t("diag.ok")) : t("diag.missing")}
                                · {t("diag.columns")} {l.columns}
                            </p>
                        {/each}
                        {#each diag.ledgers.filter((l: any) => l.error) as l (l.id)}
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
                        {#if (plugin.settings.members ?? []).some((m: any) => !m.avItemId || m.syncError)}
                            <button class="b3-button b3-button--outline" style="margin-top:6px"
                                onclick={async () => {
                                    const { backfillMemberLinks } = await import("@/core/members");
                                    const res = await backfillMemberLinks(plugin as any, plugin.settings);
                                    // D06：回填结果四态——唯一回填 / 同名歧义待人工 / 无匹配 / 失效关联已清除
                                    showMessage(t("diag.backfillResult")
                                        .replace("${n}", String(res.linked.length))
                                        .replace("${amb}", String(res.ambiguous.length))
                                        .replace("${stale}", String(res.stale.length)), 6000, res.ambiguous.length ? "info" : "info");
                                }}>{t("diag.backfill")}</button>
                        {/if}
                        <button class="b3-button b3-button--outline" style="margin-top:6px"
                            onclick={async () => {
                                const { findDuplicateLedgers } = await import("@/core/provisioner");
                                const dups = await findDuplicateLedgers(plugin.settings);
                                showMessage(dups.length === 0 ? t("diag.dupNone") : t("diag.dupFound").replace("${n}", String(dups.length)) + ": " + dups.map((d) => d.hpath).join(", "), 6000, dups.length ? "error" : "info");
                            }}>{t("diag.dupCheck")}</button>
                        <!-- D12 最小健康检查：实际读取每个启用模块，登记存在≠健康 -->
                        <button class="b3-button b3-button--outline" style="margin-top:6px"
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
                {/if}
            {/if}
        </div>
    {/if}

    <div class="fn__flex lv-settings__footer">
        {#if tab === "modules"}
            <button class="b3-button b3-button--text" onclick={enableAll}>{t("enableAll")}</button>
            <button class="b3-button b3-button--text" onclick={coreOnly}>{t("coreOnly")}</button>
        {/if}
        <span class="fn__flex-1"></span>
        <button class="b3-button b3-button--outline" disabled={saving} onclick={save}>{t("save")}</button>
    </div>
</div>
