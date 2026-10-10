<script lang="ts">
    import type { Reminder, FamilyMember } from "@/types";
    import { confirm, Menu, showMessage } from "siyuan";
    import { addMember, updateMember, removeMember } from "@/core/members";
    import { newSiYuanId, renderLedgerAll, setCell, uploadAsset } from "@/core/siyuan";
    import type { HomePluginLike } from "@/types/plugin";
    import { saveRuntime } from "@/core/hub/runtime";
    import { memberHue } from "@/core/format";
    import { openContactPicker, getContactsBridge } from "@/libs/contact-picker";

    let { plugin, t, version }: { plugin: HomePluginLike; t: (k: string) => string; version?: number } = $props();

    let orderVersion = $state(0);
    // version（H02）：hub 变更时递增，驱动派生重算（plugin.* 为普通对象引用）
    const members = $derived.by(() => {
        void version;
        void orderVersion;
        return plugin.settings.members ?? [];
    });
    let nameInput: HTMLInputElement | undefined = $state();
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
    const memberAlertCount = $derived.by(() => {
        void version;
        let count = 0;
        for (const m of members) count += alertsFor(m.id).length;
        return count;
    });
    // （215 波的 birthdaySoon 于 219 波并入下方 memberStats 单遍派生，附 0/1 天文案修正）

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
    // C5a 统计 chips + 17 组/219 波生日倒计时：单遍预计算（原 statChips/birthdaySoon
    // 每成员每次渲染重复 filter+sort；现 alertsByMember 变化时单遍派生 Map）
    // 264 波：chips 语义升级——台账行数（档案数，对齐原型 person .stats 三格），
    // 数据源 cache.byModule[].memberCounts（随扫描快照）；此前只数"有提醒的"成员，无提醒即空卡
    interface MemberStat { chips: { label: string; n: number }[]; birthday: string | null; }
    const memberStats = $derived.by(() => {
        void version;
        const byModule = plugin.runtime?.cache?.byModule ?? {};
        const map = new Map<string, MemberStat>();
        for (const m of members) {
            const counts: { label: string; n: number }[] = [];
            for (const [mid, entry] of Object.entries(byModule)) {
                const n = entry?.memberCounts?.[m.id] ?? 0;
                if (n > 0) counts.push({ label: t(`module.${mid}`) !== `module.${mid}` ? t(`module.${mid}`) : mid, n });
            }
            counts.sort((a, b) => b.n - a.n);
            const chips = counts.slice(0, 3);
            // 生日倒计时仍走提醒派生（alertsByMember）
            const alerts = alertsByMember.get(m.id) ?? [];
            const hit = alerts
                .filter((r) => r.ruleKey === "birthday" && r.daysLeft <= 30)
                .sort((a, b) => a.daysLeft - b.daysLeft)[0];
            let birthday: string | null = null;
            if (hit) {
                birthday = hit.daysLeft < 0
                    ? t("days.overdue").replace("${n}", String(-hit.daysLeft))
                    : hit.daysLeft === 0 ? t("days.today")
                    : hit.daysLeft === 1 ? t("days.tomorrow")
                    : t("days.after").replace("${n}", String(hit.daysLeft));
            }
            map.set(m.id, { chips, birthday });
        }
        return map;
    });
    const statsOf = (id: string): MemberStat => memberStats.get(id) ?? { chips: [], birthday: null };
    async function runMemberAction(action: () => Promise<void>) {
        try { await action(); }
        catch (e) { showMessage(t("hub.actionFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error"); }
    }
    let contactOverrides = $state<Record<string, string | null>>({});
    let contactBusy = $state<Record<string, boolean>>({});
    const contactOf = (m: FamilyMember) => Object.prototype.hasOwnProperty.call(contactOverrides, m.id)
        ? contactOverrides[m.id]
        : m.contactSnapshot;
    // C5b：卡片点击展开该成员提醒明细（含日期与动作）
    let expandedId = $state<string | null>(null);
    function toggleExpand(id: string) {
        expandedId = expandedId === id ? null : id;
    }
    // 菜单从卡片内的明确按钮打开，键盘和触屏都能发现排序、删除等操作。
    function cardMenu(m: FamilyMember, x: number, y: number) {
        // 思源 3.8.x 的 document click 清理会在当前点击传播期间清空共享 Menu 容器，
        // 延迟到宏任务后再创建，避免“更多操作”打开空菜单。
        setTimeout(() => {
            const menu = new Menu("lv-member-card");
            menu.addItem({ label: t("members.edit"), click: () => startEdit(m) });
            const docId = plugin.settings.dbRefs?.members?.docId;
            if (docId) menu.addItem({ label: t("members.openLedger"), click: () => plugin.showTabDocs(docId) });
            // 225 波：头像上传/联系人绑定收入菜单（头行只留编辑，修复 230px 窄卡按钮挤爆姓名排版）
            menu.addItem({ label: t("members.uploadAvatar"), click: () => pickAvatar(m) });
            menu.addItem({
                label: contactOf(m) ? t("members.contactUnlink") : t("members.contactLink"),
                click: () => (contactOf(m) ? void unlinkContact(m) : linkContact(m)),
            });
            // 17 组/197 波：上移/下移（拖拽排序的键盘可达替代）
            const idx = members.findIndex((x) => x.id === m.id);
            menu.addItem({ label: t("members.moveUp"), disabled: idx <= 0, click: () => move(m, -1) });
            menu.addItem({ label: t("members.moveDown"), disabled: idx === members.length - 1, click: () => move(m, 1) });
            menu.addItem({ label: t("delete"), click: () => confirmRemove(m) });
            menu.open({ x, y });
        }, 0);
    }
    async function persistMemberOrder(ids: string[]) {
        const previous = [...plugin.settings.members];
        try {
            const { reorderMembers } = await import("@/core/members");
            await reorderMembers(plugin as any, plugin.settings, ids);
            orderVersion += 1;
        } catch (e) {
            plugin.settings.members = previous;
            orderVersion += 1;
            showMessage(t("members.reorderFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        }
    }
    async function move(m: FamilyMember, delta: number) {
        const ids = members.map((x) => x.id);
        const i = ids.indexOf(m.id);
        const j = i + delta;
        if (j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        await persistMemberOrder(ids);
    }
    // 拖拽排序（17 组/197 波）：HTML5 DnD；drop 即持久化（reorderMembers）
    let dragId = $state<string | null>(null);
    let dragOverId = $state<string | null>(null);
    function onDragStart(m: FamilyMember, e: DragEvent) {
        dragId = m.id;
        e.dataTransfer?.setData("text/plain", m.id);
    }
    async function onDrop(m: FamilyMember, e: DragEvent) {
        e.preventDefault();
        const src = dragId ?? e.dataTransfer?.getData("text/plain") ?? null;
        dragId = null; dragOverId = null;
        if (!src || src === m.id) return;
        const ids = members.map((x) => x.id);
        const from = ids.indexOf(src);
        const to = ids.indexOf(m.id);
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        await persistMemberOrder(ids);
    }
    function openCardMenu(m: FamilyMember, e: MouseEvent) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        cardMenu(m, rect.right, rect.bottom);
    }
    // 26.7 删除文案升级：说明数据保留语义（仅移除引用，台账行保留）
    // H16：删除成员后复位指向它的失效筛选（总览与提醒页）
    function confirmRemove(m: FamilyMember) {
        confirm(t("members.deleteTitle"), t("members.deleteBody").replace("${name}", m.name), async () => {
            let removed = false;
            try {
                await removeMember(plugin, plugin.settings, m.id);
                removed = true;
            } catch (e) {
                showMessage(t("ledger.saveFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
                return;
            }
            let followupError: unknown;
            try {
                let dirty = false;
                if (plugin.runtime.filterMemberId === m.id) { plugin.runtime.filterMemberId = undefined; dirty = true; }
                if (plugin.runtime.hubMemberId === m.id) { plugin.runtime.hubMemberId = undefined; dirty = true; }
                if (dirty) await saveRuntime(plugin, plugin.runtime);
                // Member rows/settings affect birthday and member-linked
                // reminders; force a fresh scan after the write.
                await plugin.refreshHub(undefined, true);
            } catch (e) {
                followupError = e;
            }
            if (removed && followupError) showMessage(t("members.deleteFollowupFailed").replace("${msg}", followupError instanceof Error ? followupError.message : String(followupError)), 6000, "error");
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
    async function saveContactSnapshot(m: FamilyMember, snapshot: string | undefined) {
        if (contactBusy[m.id]) return;
        const target = (plugin.settings.members ?? []).find((x) => x.id === m.id);
        if (!target) return;
        const previous = target.contactSnapshot;
        contactBusy = { ...contactBusy, [m.id]: true };
        target.contactSnapshot = snapshot;
        try {
            const { saveSettings } = await import("@/core/settings");
            await saveSettings(plugin as any, plugin.settings);
            contactOverrides = { ...contactOverrides, [m.id]: snapshot ?? null };
            showMessage(t(snapshot ? "members.contactLinked" : "members.contactUnlinked"), 2500, "info");
        } catch (e) {
            target.contactSnapshot = previous;
            showMessage(t("members.contactSaveFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        } finally {
            const next = { ...contactBusy };
            delete next[m.id];
            contactBusy = next;
        }
    }
    function linkContact(m: FamilyMember) {
        if (!getContactsBridge()) {
            showMessage(t("ledger.contactsMissing"), 5000, "info");
            return;
        }
        openContactPicker({ t: (k) => t(k), showMessage: (msg, timeout, type) => showMessage(msg, timeout, type) },
            (snapshot) => { void saveContactSnapshot(m, snapshot); });
    }
    async function unlinkContact(m: FamilyMember) {
        if (!contactOf(m)) return;
        await saveContactSnapshot(m, undefined);
    }
    function cancelEdit() {
        editId = null; name = ""; role = "self"; birthday = ""; lunar = false;
    }

    // UG11 v1（第九十波）：成员导出 vCard 4.0——姓名/生日/备注即个人信息，导出前一律确认
    function exportVcf() {
        const list = plugin.settings.members ?? [];
        if (list.length === 0) return;
        confirm(t("members.exportVcf"), t("members.exportVcfBody").replace("${n}", String(list.length)), () => {
            if (exportingVcf) return;
            exportingVcf = true;
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
            }).catch((e) => {
                showMessage(t("members.exportVcfFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
            }).finally(() => {
                exportingVcf = false;
            });
        });
    }

    let memberSaving = $state(false);
    let exportingVcf = $state(false);
    async function save() {
        if (memberSaving) return;
        if (!name.trim()) {
            nameInput?.focus();
            showMessage(t("ledger.nameRequired"), 4000, "info");
            return;
        }
        // D06 配套：同名成员会让按姓名回填产生歧义——新增时提示确认（编辑不受影响）
        const dup = !editId && (plugin.settings.members ?? []).some((m) => m.name.trim() === name.trim());
        if (dup) {
            confirm(t("members.dupTitle"), t("members.dupBody").replace("${name}", name.trim()), () => { void doSave(true); });
            return;
        }
        await doSave(true);
    }

    async function doSave(clearAfterCreate = true) {
        if (!name.trim() || memberSaving) return;
        memberSaving = true;
        try {
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
                    const submittedName = name.trim();
                    await addMember(plugin, plugin.settings, {
                        id: newSiYuanId(),
                        name: submittedName, role, birthday: birthday || undefined,
                        lunarBirthday: lunar, createdAt: new Date().toISOString(),
                    });
                    if (clearAfterCreate) {
                        name = ""; role = "self"; birthday = ""; lunar = false;
                    }
                }
            } catch (e) {
                showMessage(t("ledger.saveFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
                return;
            }
            try {
                // Member rows/settings affect birthday and member-linked
                // reminders; force a fresh scan after the write.
                await plugin.refreshHub(undefined, true);
            } catch (e) {
                showMessage(t("members.saveRefreshFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
            }
        } finally {
            memberSaving = false;
        }
    }
</script>

<div class="lv-members-screen">
<div class="lv-hero lv-members-hero"><div><h1>{t("members.title")}</h1><p>{t("settings.membersHint")}</p></div><div class="lv-members-hero-count"><b class="lv-num">{members.length}</b><span>{t("members.title")}</span></div></div>

<div class="lv-members-summary" role="status" aria-label={t("members.title")}>
    <div class="lv-members-summary-item"><span class="lv-members-summary-mark">人</span><div><b class="lv-num">{members.length}</b><span>{t("members.title")}</span></div></div>
    <div class="lv-members-summary-item"><span class="lv-members-summary-mark">事</span><div><b class="lv-num">{memberAlertCount}</b><span>{t("dash.needAttention")}</span></div></div>
    <p>{t("settings.membersHint")}</p>
</div>

<div class="lv-card lv-member-editor">
    <div class="lv-member-editor-head"><div><h2>{editId ? t("members.editing") : t("add")}</h2><p>{editId ? t("members.editing") : t("settings.membersHint")}</p></div><button class="b3-button b3-button--outline" onclick={exportVcf} disabled={members.length === 0 || exportingVcf} aria-busy={exportingVcf}>{exportingVcf ? t("ledger.saving") : t("members.exportVcf")}</button></div>
    <div class="lv-member-editor-fields">
        <label class="lv-member-field"><span>{t("members.name")}</span><input bind:this={nameInput} class="b3-text-field" placeholder={t("members.name")} aria-label={t("members.name")} bind:value={name}
            onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter" && !e.isComposing) save(); }} /></label>
        <label class="lv-member-field"><span>{t("members.role")}</span><select class="b3-select" bind:value={role} aria-label={t("members.role")}>
            {#each roles as r (r)}<option value={r}>{t(`role.${r}`)}</option>{/each}
        </select></label>
        <label class="lv-member-field"><span>{t("members.birthday")}</span><input class="b3-text-field" type="date" title={t("members.birthday")} aria-label={t("members.birthday")} bind:value={birthday} /></label>
        <label class="lv-member-check"><input type="checkbox" bind:checked={lunar} />{t("members.lunar")}</label>
        <div class="lv-member-editor-actions">
            <button class="lv-btn primary sm" onclick={save} disabled={memberSaving} aria-busy={memberSaving}>
                {memberSaving ? t("ledger.saving") : editId ? t("save") : `＋ ${t("add")}`}
            </button>
            {#if editId}<button class="b3-button b3-button--outline" onclick={cancelEdit}>{t("cancel")}</button>{/if}
        </div>
    </div>
</div>

{#if members.length === 0}
    <div class="lv-card"><div class="lv-empty"><div class="eic">人</div><b>{t("members.empty")}</b><span>{t("members.emptyHint")}</span></div></div>
{:else}
    <div class="lv-people">
        {#each members as m (m.id)}
            <div class="lv-card lv-card--hover lv-person" role="group" aria-label={m.name}
            draggable="true"
            ondragstart={(e: DragEvent) => onDragStart(m, e)}
            ondragover={(e: DragEvent) => { e.preventDefault(); dragOverId = m.id; }}
            ondragleave={() => { if (dragOverId === m.id) dragOverId = null; }}
            ondrop={(e: DragEvent) => void onDrop(m, e)}
            ondragend={() => { dragId = null; dragOverId = null; }}
            class:lv-drag-over={dragOverId === m.id && dragId !== m.id}>
        <div class="lv-person-head">
            <button class="lv-person-toggle" type="button" aria-expanded={expandedId === m.id}
                aria-controls={expandedId === m.id ? `member-details-${m.id}` : undefined} aria-label={t("members.toggleDetails").replace("${name}", m.name)}
                onclick={() => toggleExpand(m.id)}
                >
            {#if avatars[m.id]}
                <!-- 17 组/192 波：头像图（资产相对路径 → 内核 origin） -->
                <img class="lv-avatar lg lv-person-avatar-image" src={new URL(avatars[m.id], location.origin).href}
                    alt={m.name} />
            {:else}
                <!-- 225 波：个性化色相（id 哈希 → 稳定渐变），与总览 chips 同源 -->
                <span class="lv-avatar lg lv-person-avatar-fallback" style="background:linear-gradient(135deg, hsl({memberHue(m.id)} 62% 52%), hsl({(memberHue(m.id) + 42) % 360} 62% 40%))">{m.name.slice(0, 1)}</span>
            {/if}
            <div class="lv-person-name">
                <b>{m.name}</b>
                <div class="lv-caption">{t(`role.${m.role}`)}{m.lunarBirthday ? ` · ${t("members.lunar")}` : ""} {m.birthday ?? ""}</div>
            </div>
            </button>
            <!-- 操作保持常显，鼠标、键盘和触屏均能直接发现。 -->
            <button class="lv-iconbtn" title={t("members.uploadAvatar")} aria-label={t("members.uploadAvatar")}
                onclick={() => pickAvatar(m)}>头像</button>
            <button class="b3-button b3-button--text lv-member-edit" onclick={() => startEdit(m)}>{t("members.edit")}</button>
            <button class="b3-button b3-button--text" title={t("members.moreActions")} aria-label={t("members.moreActions")}
                onclick={(e) => openCardMenu(m, e)}>⋯</button>
        </div>
        {#if m.syncError}
            <div class="lv-caption lv-member-sync-error" role="alert">{t("members.syncError")}: {m.syncError}</div>
        {/if}
        {#if statsOf(m.id).chips.length > 0 || statsOf(m.id).birthday}
            {@const s = statsOf(m.id)}
            <div class="lv-person-info">
                {#each s.chips as c (c.label)}
                    <!-- 259 波：统计 chips 归入 lv 徽章体系（b3-chip 的黄绿底与三级文字层次冲突） -->
                    <span class="lv-badge gray">{c.label} <b class="lv-num">{c.n}</b></span>
                {/each}
                {#if s.birthday}
                    <!-- 17 组/219 波：生日倒计时 chip（单遍预计算，数据来自提醒中枢既有派生） -->
                    <span class="lv-badge lv-member-birthday">生日 · {s.birthday}</span>
                {/if}
            </div>
        {/if}
        {#if alertsFor(m.id).length > 0}
            <div class="lv-person-alert" role="status">需关注 · {alertsFor(m.id).length} {alertsFor(m.id).length === 1 ? t("dash.needAttentionOne") : t("dash.needAttention")}</div>
        {/if}
        {#if expandedId === m.id}
            <!-- 260 波：展开区入场动画（对齐抽屉编排语言；lv-rise 180ms） -->
            <div id={`member-details-${m.id}`} class="lv-person-expanded" style="border-top:1px solid var(--lv-line);padding-top:10px;display:flex;flex-direction:column;gap:6px">
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                    <button class="b3-button b3-button--text" disabled={members.findIndex((x) => x.id === m.id) <= 0} onclick={() => void move(m, -1)}>{t("members.moveUp")}</button>
                    <button class="b3-button b3-button--text" disabled={members.findIndex((x) => x.id === m.id) >= members.length - 1} onclick={() => void move(m, 1)}>{t("members.moveDown")}</button>
                    {#if plugin.settings.dbRefs?.members?.docId}
                        <button class="b3-button b3-button--text" onclick={() => plugin.showTabDocs(plugin.settings.dbRefs.members.docId)}>{t("members.openLedger")}</button>
                    {/if}
                    <button class="b3-button b3-button--text" onclick={() => confirmRemove(m)}>{t("delete")}</button>
                </div>
                {#if contactOf(m)}
                    <div style="display:flex;gap:8px;align-items:center">
                        <span class="lv-caption lv-member-contact" title={contactOf(m) ?? ""}>{t("field.contact")}: {contactOf(m)?.split(" [")[0]}</span>
                        <span style="flex:1"></span>
                        <button class="b3-button b3-button--text" disabled={!!contactBusy[m.id]} onclick={() => void unlinkContact(m)}>{t("members.contactUnlink")}</button>
                    </div>
                {:else}
                    <div style="display:flex;gap:8px;align-items:center">
                        <span class="lv-caption">{t("members.contactLink")}</span>
                        <span style="flex:1"></span>
                        <button class="b3-button b3-button--text" disabled={!!contactBusy[m.id]} onclick={() => linkContact(m)}>{t("members.contactLink")}</button>
                    </div>
                {/if}
                {#if alertsFor(m.id).length === 0}
                    <span class="lv-caption">{t("dash.allClear")}</span>
                {:else}
                    {#each alertsFor(m.id) as r (r.id)}
                        <div style="display:flex;gap:8px;align-items:center;font-size:12.5px">
                            <span class="lv-badge {r.level === 'overdue' ? 'red' : r.level === 'soon' ? 'orange' : 'yellow'}">{r.dueDate}</span>
                            <span>{r.title}</span>
                            <span style="flex:1"></span>
                            <button class="b3-button b3-button--text" onclick={() => void runMemberAction(() => plugin.complete(r))}>{t("act.done")}</button>
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
</div>

<style>
    .lv-members-screen {
        --member-gap: 14px;
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .lv-members-hero {
        margin-top: 10px;
        margin-bottom: 0;
        align-items: center;
    }

    .lv-members-hero-count {
        display: flex;
        align-items: baseline;
        gap: 7px;
        margin-left: auto;
        color: var(--lv-tx-3);
    }

    .lv-members-hero-count b { color: var(--lv-tx); font-size: 30px; font-weight: 600; }
    .lv-members-hero-count span { font-size: 12px; }

    .lv-members-summary {
        display: grid;
        grid-template-columns: repeat(2, minmax(120px, 170px)) minmax(0, 1fr);
        align-items: center;
        gap: 12px;
        padding: 13px 16px;
        border: 1px solid var(--lv-line);
        border-radius: var(--lv-r-3);
        background: color-mix(in srgb, var(--lv-surface) 92%, var(--lv-accent-soft));
        box-shadow: inset 0 1px 0 var(--lv-inset);
    }

    .lv-members-summary-item { display: flex; align-items: center; gap: 9px; min-width: 0; }
    .lv-members-summary-mark {
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: 9px;
        color: var(--lv-accent);
        background: var(--lv-accent-soft);
        font-size: 13px;
        font-weight: 600;
    }
    .lv-members-summary-item div { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
    .lv-members-summary-item b { font-size: 18px; line-height: 1.1; font-weight: 600; }
    .lv-members-summary-item span:last-child { color: var(--lv-tx-3); font-size: 11.5px; white-space: nowrap; }
    .lv-members-summary p { margin: 0; color: var(--lv-tx-3); font-size: 12px; line-height: 1.5; text-align: right; }

    .lv-member-editor { padding: 16px; }
    .lv-member-editor-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .lv-member-editor-head h2 { margin: 0; font-size: 15px; font-weight: 600; }
    .lv-member-editor-head p { margin: 3px 0 0; color: var(--lv-tx-3); font-size: 11.5px; line-height: 1.45; }
    .lv-member-editor-fields { display: grid; grid-template-columns: minmax(150px, 1.2fr) minmax(120px, .9fr) minmax(135px, 1fr) auto auto; align-items: end; gap: 10px; }
    .lv-member-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
    .lv-member-field > span { color: var(--lv-tx-3); font-size: 11.5px; }
    .lv-member-field .b3-text-field, .lv-member-field .b3-select { width: 100%; min-width: 0; box-sizing: border-box; }
    .lv-member-check { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding-bottom: 1px; color: var(--lv-tx-2); font-size: 12px; white-space: nowrap; cursor: pointer; }
    .lv-member-editor-actions { display: flex; gap: 7px; align-items: center; min-height: 32px; }

    .lv-members-screen .lv-people { gap: var(--member-gap); }
    .lv-members-screen .lv-person { min-width: 0; }
    .lv-members-screen .lv-person-head { cursor: default; }
    .lv-members-screen .lv-person-toggle { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; background: transparent; border: 0; padding: 0; color: inherit; text-align: left; font: inherit; cursor: pointer; }
    .lv-members-screen .lv-person-avatar-image { width: 44px; height: 44px; object-fit: cover; flex-shrink: 0; }
    .lv-members-screen .lv-person-avatar-fallback { flex-shrink: 0; }
    .lv-members-screen .lv-person-head .lv-iconbtn,
    .lv-members-screen .lv-person-head .lv-member-edit,
    .lv-members-screen .lv-person-head > .b3-button { display: inline-flex !important; }
    .lv-members-screen .lv-person-head .lv-iconbtn { width: auto; min-width: 42px; padding-inline: 7px; font-size: 11px; border-color: var(--lv-line); }
    .lv-members-screen .lv-person-head .lv-member-edit { min-height: 30px; padding-inline: 7px; }
    .lv-members-screen .lv-person-head > .b3-button[title] { width: 30px; min-width: 30px; padding-inline: 0; }
    .lv-members-screen .lv-person-head > .b3-button[title] { font-size: 17px; line-height: 1; }
    .lv-members-screen .lv-person-head > .b3-button[title] { color: var(--lv-tx-2); }
    .lv-members-screen .lv-person-head > .b3-button[title]:hover { color: var(--lv-tx); background: var(--lv-surface-2); }
    .lv-members-screen .lv-member-contact { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lv-members-screen .lv-member-sync-error { color: var(--lv-danger); }
    .lv-members-screen .lv-member-birthday { color: var(--lv-accent); background: var(--lv-accent-soft); }
    .lv-members-screen .lv-drag-over { outline: 2px dashed var(--lv-accent); outline-offset: -2px; }

    @container lv-home (max-width: 680px) {
        .lv-members-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .lv-members-summary p { grid-column: 1 / -1; text-align: left; padding-top: 2px; border-top: 1px solid var(--lv-line); }
        .lv-member-editor-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .lv-member-editor-actions { grid-column: 1 / -1; }
    }

    @container lv-home (max-width: 420px) {
        .lv-members-hero-count { display: none; }
        .lv-members-summary { padding: 11px 12px; gap: 8px; }
        .lv-member-editor-head { flex-direction: column; }
        .lv-member-editor-head > .b3-button { align-self: flex-start; }
        .lv-member-editor-fields { grid-template-columns: 1fr; }
        .lv-member-editor-actions { grid-column: auto; }
        .lv-members-screen .lv-person-head { align-items: flex-start; flex-wrap: wrap; }
        .lv-members-screen .lv-person-toggle { min-width: calc(100% - 12px); }
        .lv-members-screen .lv-person-head .lv-iconbtn,
        .lv-members-screen .lv-person-head .lv-member-edit,
        .lv-members-screen .lv-person-head > .b3-button[title] { margin-top: 2px; }
    }

    @media (prefers-reduced-motion: reduce) {
        .lv-members-screen .lv-person-expanded { animation: none; }
    }
</style>
