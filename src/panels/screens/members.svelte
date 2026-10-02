<script lang="ts">
    import { confirm } from "siyuan";
    import { addMember, updateMember, removeMember } from "@/core/members";
    import { newSiYuanId } from "@/core/siyuan";

    let { plugin, t, version }: { plugin: any; t: (k: string) => string; version?: number } = $props();

    // version（H02）：hub 变更时递增，驱动派生重算（plugin.* 为普通对象引用）
    const members = $derived.by(() => {
        void version;
        return plugin.settings.members ?? [];
    });
    const reminders = $derived.by(() => {
        void version;
        return plugin.scan?.reminders ?? [];
    });
    const alertsFor = (id: string) => reminders.filter((r: any) => r.memberId === id);
    // C5b：卡片点击展开该成员提醒明细（含日期与动作）
    let expandedId = $state<string | null>(null);
    function toggleExpand(id: string) {
        expandedId = expandedId === id ? null : id;
    }
    // 26.7 删除文案升级：说明数据保留语义（仅移除引用，台账行保留）
    // H16：删除成员后复位指向它的失效筛选（总览与提醒页）
    function confirmRemove(m: any) {
        confirm(t("members.deleteTitle"), t("members.deleteBody").replace("${name}", m.name), async () => {
            await removeMember(plugin, plugin.settings, m.id);
            const { saveRuntime } = await import("@/core/hub/runtime");
            let dirty = false;
            if (plugin.runtime.filterMemberId === m.id) { plugin.runtime.filterMemberId = undefined; dirty = true; }
            if (plugin.runtime.hubMemberId === m.id) { plugin.runtime.hubMemberId = undefined; dirty = true; }
            if (dirty) await saveRuntime(plugin, plugin.runtime);
            await plugin.refreshHub();
        });
    }

    // D05 成员编辑：点"编辑"填入顶部表单，保存走 updateMember（av 行按 avItemId 精确写回）
    let name = $state("");
    let role = $state<import("@/types").MemberRole>("self");
    let birthday = $state("");
    let lunar = $state(false);
    let editId = $state<string | null>(null);
    const roles = ["self", "spouse", "partner", "child", "elder", "kin", "other"];

    function startEdit(m: any) {
        editId = m.id;
        name = m.name;
        role = m.role;
        birthday = m.birthday ?? "";
        lunar = !!m.lunarBirthday;
        expandedId = null;
    }
    function cancelEdit() {
        editId = null; name = ""; role = "self"; birthday = ""; lunar = false;
    }

    async function save() {
        if (!name.trim()) return;
        if (editId) {
            const target = (plugin.settings.members ?? []).find((m: any) => m.id === editId);
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
            <span class="lv-avatar lg" style="background:linear-gradient(135deg,var(--lv-accent),var(--lv-accent-2))">{m.name.slice(0, 1)}</span>
            <div><b>{m.name}</b><div class="lv-caption">{t(`role.${m.role}`)}{m.lunarBirthday ? " 🌙" : ""} {m.birthday ?? ""}</div></div>
            <span style="flex:1"></span>
            <button class="b3-button b3-button--text" onclick={(e) => { e.stopPropagation(); startEdit(m); }}>{t("members.edit")}</button>
            <button class="b3-button b3-button--text" onclick={(e) => { e.stopPropagation(); confirmRemove(m); }}>{t("delete")}</button>
        </div>
        {#if m.syncError}
            <div class="lv-caption" role="alert" style="color:var(--lv-danger)">⚠ {t("members.syncError")}: {m.syncError}</div>
        {/if}
        {#if alertsFor(m.id).length > 0}
            <div class="person-alert" style="font-size:12px;color:var(--lv-warn)">⚠ {alertsFor(m.id).length} {t("dash.needAttention")}</div>
        {/if}
        {#if expandedId === m.id}
            <div style="border-top:1px solid var(--lv-line);padding-top:10px;display:flex;flex-direction:column;gap:6px">
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
