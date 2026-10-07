<script lang="ts">
    import type { HomePluginLike } from "@/types/plugin";
    import { showMessage } from "siyuan";
    let { plugin, t, onGoto }: { plugin: HomePluginLike; t: (k: string) => string; onGoto?: (s: string) => void } = $props();

    let step = $state(1);
    let provisioning = $state(false);
    let provisionError = $state("");
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

    // C7 向导 CTA：完成后直达证件快速录入（预选 certs）；C7c：建库 loading/error/超时反馈
    async function finishAndCapture() {
        if (provisioning) return;
        provisioning = true;
        provisionError = "";
        try {
            const roles = ["self", ...picked];
            const timeout = new Promise<never>((_, reject) =>
                window.setTimeout(() => reject(new Error("建库超时（120 秒），请检查思源内核是否正常运行")), 120_000)
            );
            await Promise.race([plugin.finishOnboarding({ roles, children }, recommended), timeout]);
            plugin.setActiveLedger("certs");
            onGoto?.("ledger");
        } catch (e) {
            provisionError = e instanceof Error ? e.message : String(e);
        } finally {
            provisioning = false;
        }
    }
    // 完成=建库+直达证件快速录入（C7 CTA）；skip 路径同样经 finishOnboarding（需容错）
    function skip() {
        plugin.finishOnboarding({ roles: ["self"], children: 0 }, []).catch((e: unknown) => {
            console.error("[siyuan-home] onboarding skip failed:", e);
            showMessage(t("wiz.provisionIssues").replace("${n}", "0").replace("${modules}", ""), 6000, "error");
        });
    }
</script>

<!-- 251 波（对齐原型 .aura 品牌时刻）：双漂移辉光容器 + 居中向导 + rolechip -->
<div class="lv-card lv-aura" style="margin-bottom:16px" aria-labelledby="lv-wiz-title">
    <div class="lv-wiz">
        <div class="lv-wiz__step" aria-live="polite">STEP {step} / 2</div>
        {#if step === 1}
            <h3 id="lv-wiz-title" class="lv-wiz__title">{t("wiz.s1Title")}</h3>
            <p class="lv-sub" style="margin-bottom:16px">{t("wiz.s1Hint")}</p>
            <div class="lv-roles">
                {#each roleOptions as r (r)}
                    <button class="lv-rolechip" class:on={picked.includes(r)} aria-pressed={picked.includes(r)} onclick={() => toggle(r)}>{t(`role.${r}`)}</button>
                {/each}
            </div>
            {#if picked.includes("child")}
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
                    <span class="lv-sub">{t("wiz.children")}</span>
                    <button class="b3-button b3-button--outline" aria-label={t("wiz.childrenDecrease")} onclick={() => (children = Math.max(0, children - 1))}>−</button>
                    <b class="lv-num" aria-live="polite">{children}</b>
                    <button class="b3-button b3-button--outline" aria-label={t("wiz.childrenIncrease")} onclick={() => (children += 1)}>＋</button>
                </div>
            {/if}
            <div style="display:flex;justify-content:flex-end;gap:8px">
                <button class="lv-btn ghost" onclick={skip}>{t("wiz.skip")}</button>
                <button class="lv-btn primary" onclick={() => (step = 2)}>{t("wiz.next")} →</button>
            </div>
        {:else}
            <h3 id="lv-wiz-title" class="lv-wiz__title">{t("wiz.s2Title")}</h3>
            <p class="lv-sub" style="margin-bottom:16px">{t("wiz.s2Hint")}</p>
            <div class="lv-roles">
                {#each recommended as mid (mid)}
                    <span class="lv-rolechip on">{t(`module.${mid}`)}</span>
                {/each}
                {#if recommended.length === 0}<span class="lv-sub">{t("wiz.noExtra")}</span>{/if}
            </div>
            {#if picked.includes("child") && children > 0}
                <!-- N3（重估后方案 A）：向导不建成员实体，性别只读不写不问——完成页引导去成员页补（D23 生长带依赖） -->
                <p class="lv-caption" role="note" style="margin:-6px 0 14px;color:var(--lv-accent)">ⓘ {t("wiz.sexHint")}</p>
            {/if}
            <div style="display:flex;justify-content:space-between;align-items:center">
                <button class="lv-btn" onclick={() => (step = 1)}>← {t("wiz.back")}</button>
                {#if provisionError}
                    <span class="lv-caption" role="alert" style="color:var(--lv-danger);flex:1;margin:0 8px">⚠ {provisionError}</span>
                {/if}
                <button class="lv-btn primary" disabled={provisioning}
                    title={t("wiz.finishCta")} onclick={finishAndCapture}>
                    {provisioning ? t("wiz.provisioningShort") : `✓ ${t("wiz.finishAndCapture")}`}
                </button>
            </div>
        {/if}
    </div>
</div>
