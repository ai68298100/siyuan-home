<script lang="ts">
    import type { Reminder, FamilyMember } from "@/types";
    import { confirm } from "siyuan";
    import { addMember, updateMember, removeMember } from "@/core/members";
    import { newSiYuanId, renderLedgerAll, setCell, uploadAsset } from "@/core/siyuan";
    import type { HomePluginLike } from "@/types/plugin";
    import { saveRuntime } from "@/core/hub/runtime";
    import { openContactPicker, getContactsBridge } from "@/libs/contact-picker";
    import { showMessage } from "siyuan";

    let { plugin, t, version }: { plugin: HomePluginLike; t: (k: string) => string; version?: number } = $props();

    // version（H02）：hub 变更时递增，驱动派生重算（plugin.* 为普通对象引用）
    const members = $derived.by(() => {
        void version;
        return plugin.settings.members ?? [];
    });
    const reminders = $derived.by(() => {
        void version;
        return plugin.scan?.reminders ?? [];
    });
    // 176 波性能：按成员一次预分组（模板内每卡多次调用 alertsFor，此前每次全量 filter）
    const alertsByMember = $derived.by(() => {
        void version;
        const map = new Map<string, Reminder[]>();
        for (const r of reminders) {
            if (!r.memberId) continue;
            let g = map.get(r.memberId);
            if (!g) { g = []; map.set(r.memberId, g); }
            g.push(r);
        }
        return map;
    });
    const alertsFor = (id: string) => alertsByMember.get(id) ?? [];

    // 17 组/192 波：成员头像（E14/E15 实测形状）——资产存成员台账行 mAsset 列（台账为事实源，settings 不存）。
    // avatars: memberId → 资产相对路径；version 驱动加载（成员行量小，全量读）。
    let avatars = $state<Record<string, string>>({});
    $effect(() => {
        void version;
        let alive = true;
        (async () => {
            const ref = plugin.settings.dbRefs?.members;
            const avatarKey = ref?.columns?.avatar;
            if (!ref?.avId || !avatarKey) return;
            try {
                const read = await renderLedgerAll(ref.avId);
                const map: Record<string, string> = {};
                for (const m of plugin.settings.members ?? []) {
                    if (!m.avItemId) continue;
                    const row = read.rows.find((r) => r.itemID === m.avItemId);
                    const p = row?.cells[avatarKey]?.mAsset?.[0]?.content;
                    if (p) map[m.id] = p;
                }
                if (alive) avatars = map;
            } catch { /* 读不到就维持首字母头像，不弹错 */ }
        })();
        return () => { alive = false; };
    });
    let avatarInput: HTMLInputElement | undefined = $state();
    let avatarTarget: FamilyMember | null = null;
    function pickAvatar(m: FamilyMember) {
        if (!m.avItemId) { showMessage(t("members.avatarNoRow"), 4000, "info"); return; }
        avatarTarget = m;
        avatarInput?.click();
    }
    async function onAvatarPicked(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        (e.target as HTMLInputElement).value = "";
        const m = avatarTarget;
        if (!file || !m?.avItemId) return;
        const ref = plugin.settings.dbRefs?.members;
        const avatarKey = ref?.columns?.avatar;
        if (!ref?.avId || !avatarKey) return;
        try {
            const { name, path } = await uploadAsset(file);
            await setCell(ref.avId, avatarKey, m.avItemId, { type: "mAsset", mAsset: [{ content: path, name }] });
            avatars = { ...avatars, [m.id]: path };
            showMessage(t("members.avatarUploaded").replace("${name}", m.name), 2500, "info");
        } catch (e) {
            showMessage(t("members.avatarFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        }
    }
    // C5a 统计 chips：该成员待办按模块聚类的 top-3（数据来自当前扫描，不做全库聚合查询）
    function statChips(id: string): { label: string; n: number }[] {
        const byModule = new Map<string, number>();
        for (const r of alertsFor(id)) byModule.set(r.moduleId, (byModule.get(r.moduleId) ?? 0) + 1);
        return [...byModule.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([mid, n]) => ({ label: t(`module.${mid}`) !== `module.${mid}` ? t(`module.${mid}`) : mid, n }));
    }
    // C5b：卡片点击展开该成员提醒明细（含日期与动作）
    let expandedId = $state<string | null>(null);
    function toggleExpand(id: string) {
        expandedId = expandedId === id ? null : id;
    }
    // 26.7 删除文案升级：说明数据保留语义（仅移除引用，台账行保留）
    // H16：删除成员后复位指向它的失效筛选（总览与提醒页）
    function confirmRemove(m: FamilyMember) {
        confirm(t("members.deleteTitle"), t("members.deleteBody").replace("${name}", m.name), async () => {
            try {
                await removeMember(plugin, plugin.settings, m.id);
                                let dirty = false;
                if (plugin.runtime.filterMemberId === m.id) { plugin.runtime.filterMemberId = undefined; dirty = true; }
                if (plugin.runtime.hubMemberId === m.id) { plugin.runtime.hubMemberId = undefined; dirty = true; }
                if (dirty) await saveRuntime(plugin, plugin.runtime);
                await plugin.refreshHub();
            } catch (e) {
                showMessage(t("ledger.saveFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
            }
        });
    }

    // D05 成员编辑：点"编辑"填入顶部表单，保存走 updateMember（av 行按 avItemId 精确写回）
    let name = $state("");
    let role = $state<import("@/types").MemberRole>("self");
    let birthday = $state("");
    let lunar = $state(false);
    let editId = $state<string | null>(null);
    const roles = ["self", "spouse", "partner", "child", "elder", "kin", "other"];

    function startEdit(m: FamilyMember) {
        editId = m.id;
        name = m.name;
        role = m.role;
        birthday = m.birthday ?? "";
        lunar = !!m.lunarBirthday;
        expandedId = null;
    }

    // EC14：成员 ↔ 人脉联系人绑定（仅存快照 `名称 [docId]`，不改写人脉数据）
    function linkContact(m: FamilyMember) {
        if (!getContactsBridge()) {
            showMessage(t("ledger.contactsMissing"), 5000, "info");
            return;
        }
        openContactPicker({ t: (k) => t(k), showMessage: (msg, timeout, type) => showMessage(msg, timeout, type) }, (snapshot) => {
            const target = (plugin.settings.members ?? []).find((x) => x.id === m.id);
            if (!target) return;
            target.contactSnapshot = snapshot;
            import("@/core/settings").then((mod) => mod.saveSettings(plugin, plugin.settings));
            showMessage(t("members.contactLinked"), 2500, "info");
        });
    }
    function unlinkContact(m: FamilyMember) {
        const target = (plugin.settings.members ?? []).find((x) => x.id === m.id);
        if (!target?.contactSnapshot) return;
        target.contactSnapshot = undefined;
        import("@/core/settings").then((mod) => mod.saveSettings(plugin, plugin.settings));
        showMessage(t("members.contactUnlinked"), 2500, "info");
    }
    function cancelEdit() {
        editId = null; name = ""; role = "self"; birthday = ""; lunar = false;
    }

    // UG11 v1（第九十波）：成员导出 vCard 4.0——姓名/生日/备注即个人信息，导出前一律确认
    function exportVcf() {
        const list = plugin.settings.members ?? [];
        if (list.length === 0) return;
        confirm(t("members.exportVcf"), t("members.exportVcfBody").replace("${n}", String(list.length)), () => {
            import("@/core/vcard").then(({ buildVCard }) => {
                const vcf = buildVCard(list.map((m) => ({
                    uid: m.id,
                    name: m.name,
                    birthday: m.birthday,
                    lunarBirthday: m.lunarBirthday,
                    note: m.notes,
                    category: t(`role.${m.role}`) !== `role.${m.role}` ? t(`role.${m.role}`) : m.role,
                })));
                if (!vcf) { showMessage(t("members.exportVcfEmpty"), 3000, "error"); return; }
                const blob = new Blob([vcf], { type: "text/vcard;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `lvhome-members-${new Date().toISOString().slice(0, 10)}.vcf`;
                a.click();
                URL.revokeObjectURL(a.href);
                showMessage(t("members.exportVcfDone").replace("${n}", String(list.length)), 3000, "info");
            });
        });
    }

    async function save() {
        if (!name.trim()) return;
        // D06 配套：同名成员会让按姓名回填产生歧义——新增时提示确认（编辑不受影响）
        const dup = !editId && (plugin.settings.members ?? []).some((m) => m.name.trim() === name.trim());
        if (dup) {
            confirm(t("members.dupTitle"), t("members.dupBody").replace("${name}", name.trim()), () => doSave());
            return;
        }
        await doSave();
    }

    async function doSave() {
        if (!name.trim()) return;
        try {
            if (editId) {
                const target = (plugin.settings.members ?? []).find((m) => m.id === editId);
                if (target) {
                    await updateMember(plugin, plugin.settings, {
                        ...target, name: name.trim(), role, birthday: birthday || undefined, lunarBirthday: lunar,
                    });
                }
                cancelEdit();
            } else {
                await addMember(plugin, plugin.settings, {
                    id: newSiYuanId(),
                    name: name.trim(), role, birthday: birthday || undefined,
                    lunarBirthday: lunar, createdAt: new Date().toISOString(),
                });
                name = ""; role = "self"; birthday = ""; lunar = false;
            }
            await plugin.refreshHub();
        } catch (e) {
            showMessage(t("ledger.saveFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        }
    }
</script>

<div class="lv-hero"><h1>{t("members.title")}</h1><p>{t("settings.membersHint")}</p></div>

<div class="lv-card" style="padding:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
    <input class="b3-text-field" style="width:140px" placeholder={t("members.name")} bind:value={name} />
    <select class="b3-select" bind:value={role}>
        {#each roles as r (r)}<option value={r}>{t(`role.${r}`)}</option>{/each}
    </select>
    <input class="b3-text-field" type="date" title={t("members.birthday")} bind:value={birthday} />
    <label style="display:flex;gap:5px;align-items:center;font-size:12.5px;cursor:pointer">
        <input type="checkbox" bind:checked={lunar} />{t("members.lunar")}
    </label>
    {#if editId}<span class="lv-caption" style="color:var(--lv-accent)">{t("members.editing")}</span>{/if}
    <button class="b3-button b3-button--text" onclick={save} disabled={!name.trim()}>
        {editId ? t("save") : `＋ ${t("add")}`}
    </button>
    {#if editId}
        <button class="b3-button b3-button--outline" onclick={cancelEdit}>{t("cancel")}</button>
    {/if}
    <span style="flex:1"></span>
    <button class="b3-button b3-button--outline" onclick={exportVcf} disabled={members.length === 0}>{t("members.exportVcf")}</button>
</div>

{#if members.length === 0}
    <div class="lv-card"><div class="lv-empty"><div class="eic">👪</div><b>{t("members.empty")}</b><span>{t("members.emptyHint")}</span></div></div>
{:else}
    <div class="lv-people">
        {#each members as m (m.id)}
            <div class="lv-card lv-mod">
        <div class="head" style="display:flex;gap:10px;align-items:center;cursor:pointer" role="button" tabindex="0"
            onkeydown={(e: KeyboardEvent) => e.key === "Enter" && toggleExpand(m.id)}
            onclick={() => toggleExpand(m.id)}>
            {#if avatars[m.id]}
                <!-- 17 组/192 波：头像图（资产相对路径 → 内核 origin） -->
                <img class="lv-avatar lg" src={new URL(avatars[m.id], location.origin).href}
                    alt={m.name} style="width:40px;height:40px;object-fit:cover;flex-shrink:0" />
            {:else}
                <span class="lv-avatar lg" style="background:linear-gradient(135deg,var(--lv-accent),var(--lv-accent-2))">{m.name.slice(0, 1)}</span>
            {/if}
            <div><b>{m.name}</b><div class="lv-caption">{t(`role.${m.role}`)}{m.lunarBirthday ? " 🌙" : ""} {m.birthday ?? ""}</div></div>
            <span style="flex:1"></span>
            {#if m.contactSnapshot}
                <span class="lv-caption" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title={m.contactSnapshot}>📞 {m.contactSnapshot.split(" [")[0]}</span>
                <button class="b3-button b3-button--text" onclick={(e) => { e.stopPropagation(); unlinkContact(m); }}>{t("members.contactUnlink")}</button>
            {:else}
                <button class="b3-button b3-button--text" onclick={(e) => { e.stopPropagation(); linkContact(m); }}>{t("members.contactLink")}</button>
            {/if}
            <button class="b3-button b3-button--text" title={t("members.uploadAvatar")} onclick={(e) => { e.stopPropagation(); pickAvatar(m); }}>📷</button>
            <button class="b3-button b3-button--text" onclick={(e) => { e.stopPropagation(); startEdit(m); }}>{t("members.edit")}</button>
            <button class="b3-button b3-button--text" onclick={(e) => { e.stopPropagation(); confirmRemove(m); }}>{t("delete")}</button>
        </div>
        {#if m.syncError}
            <div class="lv-caption" role="alert" style="color:var(--lv-danger)">⚠ {t("members.syncError")}: {m.syncError}</div>
        {/if}
        {#if statChips(m.id).length > 0}
            <div style="display:flex;gap:6px;flex-wrap:wrap;padding-top:6px">
                {#each statChips(m.id) as c (c.label)}
                    <span class="b3-chip b3-chip--small b3-chip--secondary">{c.label} {c.n}</span>
                {/each}
            </div>
        {/if}
        {#if alertsFor(m.id).length > 0}
            <div class="person-alert" style="font-size:12px;color:var(--lv-warn)">⚠ {alertsFor(m.id).length} {t("dash.needAttention")}</div>
        {/if}
        {#if expandedId === m.id}
            <div style="border-top:1px solid var(--lv-line);padding-top:10px;display:flex;flex-direction:column;gap:6px">
                {#if m.contactSnapshot}
                    <span class="lv-caption">📞 {t("field.contact")}: {m.contactSnapshot}</span>
                {/if}
                {#if alertsFor(m.id).length === 0}
                    <span class="lv-caption">{t("dash.allClear")}</span>
                {:else}
                    {#each alertsFor(m.id) as r (r.id)}
                        <div style="display:flex;gap:8px;align-items:center;font-size:12.5px">
                            <span class="lv-badge {r.level === 'overdue' ? 'red' : r.level === 'soon' ? 'orange' : 'yellow'}">{r.dueDate}</span>
                            <span>{r.title}</span>
                            <span style="flex:1"></span>
                            <button class="b3-button b3-button--text" onclick={() => plugin.complete(r)}>{t("act.done")}</button>
                        </div>
                    {/each}
                {/if}
            </div>
        {/if}
            </div>
        {/each}
    </div>
{/if}
<input type="file" accept="image/*" style="display:none" bind:this={avatarInput} onchange={(e) => void onAvatarPicked(e)} />
