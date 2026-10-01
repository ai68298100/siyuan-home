<script lang="ts">
    let { plugin, t }: { plugin: any; t: (k: string) => string } = $props();

    let step = $state(1);
    const roleOptions = ["spouse", "partner", "child", "elder", "kin"];
    let picked: string[] = $state(["self"]);
    let children = $state(0);

    // 推荐模块（C7b：按家庭构成预选）
    const recommended = $derived<string[]>(
        picked.flatMap((r) => (r === "child" && children > 0 ? ["parenting", "schooling", "allowance"] : r === "elder" ? ["social"] : [])),
    );

    function toggle(role: string) {
        picked = picked.includes(role) ? picked.filter((r) => r !== role) : [...picked, role];
        if (!picked.includes("child")) children = 0;
    }

    async function finish() {
        const roles = ["self", ...picked];
        await plugin.finishOnboarding({ roles, children }, recommended);
    }
    function skip() { plugin.finishOnboarding({ roles: ["self"], children: 0 }, []); }
</script>

<div class="lv-card" style="padding:28px;margin-bottom:16px;border-color:var(--lv-accent-line)">
    <div class="lv-caption" style="color:var(--lv-accent);font-weight:600">STEP {step} / 2</div>
    {#if step === 1}
        <h3 style="margin:6px 0">{t("wiz.s1Title")}</h3>
        <p class="lv-sub" style="margin-bottom:14px">{t("wiz.s1Hint")}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
            {#each roleOptions as r (r)}
                <button class="lv-chip" class:on={picked.includes(r)} onclick={() => toggle(r)}>{t(`role.${r}`)}</button>
            {/each}
        </div>
        {#if picked.includes("child")}
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
                <span class="lv-sub">{t("wiz.children")}</span>
                <button class="b3-button b3-button--outline" onclick={() => (children = Math.max(0, children - 1))}>−</button>
                <b class="lv-num">{children}</b>
                <button class="b3-button b3-button--outline" onclick={() => (children += 1)}>＋</button>
            </div>
        {/if}
        <div style="display:flex;justify-content:flex-end;gap:8px">
            <button class="b3-button ghost" onclick={skip}>{t("wiz.skip")}</button>
            <button class="b3-button b3-button--text" onclick={() => (step = 2)}>{t("wiz.next")} →</button>
        </div>
    {:else}
        <h3 style="margin:6px 0">{t("wiz.s2Title")}</h3>
        <p class="lv-sub" style="margin-bottom:14px">{t("wiz.s2Hint")}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
            {#each recommended as mid (mid)}
                <span class="lv-chip on">{t(`module.${mid}`)}</span>
            {/each}
            {#if recommended.length === 0}<span class="lv-sub">{t("wiz.noExtra")}</span>{/if}
        </div>
        <div style="display:flex;justify-content:space-between">
            <button class="b3-button b3-button--outline" onclick={() => (step = 1)}>← {t("wiz.back")}</button>
            <button class="b3-button b3-button--text" onclick={finish}>✓ {t("wiz.finish")}</button>
        </div>
    {/if}
</div>
