<script lang="ts">
    import { addMember, removeMember } from "@/core/members";
    import { newSiYuanId } from "@/core/siyuan";

    let { plugin, t }: { plugin: any; t: (k: string) => string } = $props();

    const members = $derived(plugin.settings.members ?? []);
    const reminders = $derived(plugin.scan?.reminders ?? []);
    const alertsFor = (id: string) => reminders.filter((r: any) => r.memberId === id);

    let name = $state("");
    let role = $state<import("@/types").MemberRole>("self");
    let birthday = $state("");
    let lunar = $state(false);
    const roles = ["self", "spouse", "partner", "child", "elder", "kin", "other"];

    async function add() {
        if (!name.trim()) return;
        await addMember(plugin, plugin.settings, {
            id: newSiYuanId(),
            name: name.trim(), role, birthday: birthday || undefined,
            lunarBirthday: lunar, createdAt: new Date().toISOString(),
        });
        name = ""; role = "self"; birthday = ""; lunar = false;
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
    <button class="b3-button b3-button--text" onclick={add}>＋ {t("add")}</button>
</div>

{#if members.length === 0}
    <div class="lv-card"><div class="lv-empty"><div class="eic">👪</div><b>{t("members.empty")}</b><span>{t("members.emptyHint")}</span></div></div>
{:else}
    <div class="lv-people">
        {#each members as m (m.id)}
            <div class="lv-card lv-mod">
                <div class="head" style="display:flex;gap:10px;align-items:center">
                    <span class="lv-avatar lg" style="background:linear-gradient(135deg,var(--lv-accent),#9a7cff)">{m.name.slice(0, 1)}</span>
                    <div><b>{m.name}</b><div class="lv-caption">{t(`role.${m.role}`)}{m.lunarBirthday ? " 🌙" : ""} {m.birthday ?? ""}</div></div>
                    <span style="flex:1"></span>
                    <button class="b3-button b3-button--text" onclick={() => removeMember(plugin, plugin.settings, m.id).then(() => plugin.refreshHub())}>{t("delete")}</button>
                </div>
                {#if alertsFor(m.id).length > 0}
                    <div class="person-alert" style="font-size:12px;color:var(--lv-warn)">⚠ {alertsFor(m.id).map((r: any) => r.title).join(" · ")}</div>
                {/if}
            </div>
        {/each}
    </div>
{/if}
