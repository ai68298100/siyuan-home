<script lang="ts">
    import type { HomePluginLike } from "@/types/plugin";
    let { plugin, t, onGoto }: { plugin: HomePluginLike; t: (k: string) => string; onGoto?: (s: string) => void } = $props();

    let step = $state(1);
    let provisioning = $state(false);
    let provisionError = $state("");
    let skipFailed = $state(false);
    const roleOptions = ["spouse", "partner", "child", "elder", "kin"];
    let picked: string[] = $state(["self"]);
    let children = $state(0);
    // 260 波：角色 chips 加表情前缀（对齐原型 rolechip 语言，提升扫读辨识）
    const roleEmoji: Record<string, string> = { spouse: "👫", partner: "💞", child: "🧒", elder: "👴", kin: "👨‍👩‍👧" };

    // 推荐模块（C7b：按家庭构成预选）
    const recommended = $derived<string[]>(
        picked.flatMap((r) => (r === "child" && children > 0 ? ["parenting", "schooling", "allowance"] : r === "elder" ? ["social"] : [])),
    );

    function toggle(role: string) {
        picked = picked.includes(role) ? picked.filter((r) => r !== role) : [...picked, role];
        if (!picked.includes("child")) children = 0;
    }

    async function runOnboarding(roles: string[], moduleIds: string[], goToCapture: boolean) {
        if (provisioning) return;
        provisioning = true;
        provisionError = "";
        skipFailed = false;
        const timeout = window.setTimeout(() => {
            provisionError = t("wiz.provisionStillRunning");
        }, 120_000);
        try {
            await plugin.finishOnboarding({ roles, children }, moduleIds);
            if (goToCapture) {
                // The certificates ledger is only a recommendation. It can be
                // disabled by an existing user, or fail to provision while the
                // onboarding flow is finishing. Never route into a blank or
                // disabled ledger: choose the first enabled, provisioned ledger
                // and otherwise leave the user on the overview with guidance.
                const target = (plugin.settings.enabledModules ?? [])
                    .filter((id) => id !== "members" && id !== "adhoc")
                    .find((id) => !!plugin.settings.dbRefs?.[id]?.avId);
                if (target) {
                    plugin.setActiveLedger(target);
                    onGoto?.("ledger");
                } else {
                    onGoto?.("overview");
                }
            }
        } catch (e) {
            provisionError = e instanceof Error ? e.message : String(e);
            skipFailed = !goToCapture;
        } finally {
            window.clearTimeout(timeout);
            provisioning = false;
        }
    }
    // C7 向导 CTA：完成后直达证件快速录入（预选 certs）。超时只提示仍在处理中，
    // 保持 busy 锁直到建库流程实际结束，避免超时后再次点击并发建库。
    async function finishAndCapture() {
        await runOnboarding(["self", ...picked], recommended, true);
    }
    // 完成=建库+直达证件快速录入（C7 CTA）；skip 路径同样经 finishOnboarding（需容错）
    async function skip() {
        children = 0;
        await runOnboarding(["self"], [], false);
    }
</script>

<!-- 251 波（对齐原型 .aura 品牌时刻）：双漂移辉光容器 + 居中向导 + rolechip -->
<section class="lv-card lv-aura lv-onboarding" aria-labelledby="lv-wiz-title">
    <div class="lv-wiz">
        <div class="lv-wiz__intro">
            <div class="lv-wiz__intro-icon" aria-hidden="true">⌂</div>
            <div class="lv-wiz__intro-main">
                <div class="lv-wiz__eyebrow">{t("wiz.welcomeEyebrow")}</div>
                <h2 class="lv-wiz__welcome">{t("wiz.welcomeTitle")}</h2>
                <p class="lv-sub">{t("wiz.welcomeHint")}</p>
            </div>
            <div class="lv-wiz__progress" aria-label={t("wiz.step").replace("${n}", String(step))}>
                <span class="lv-wiz__step" aria-live="polite">{t("wiz.step").replace("${n}", String(step))}</span>
                <div class="lv-wiz__progress-track" role="progressbar" aria-valuemin="1" aria-valuemax="2" aria-valuenow={step}
                    aria-valuetext={t("wiz.step").replace("${n}", String(step))}>
                    <span class:active={step >= 1}></span><span class:active={step >= 2}></span>
                </div>
            </div>
        </div>
        <details class="lv-wiz__overview">
            <summary>{t("wiz.featuresLabel")}</summary>
            <div class="lv-wiz__overview-body">
                <p>{t("wiz.intro")}</p>
                <div class="lv-wiz__features" aria-label={t("wiz.featuresLabel")}>
                    <div class="lv-wiz__feature">
                        <span class="lv-wiz__feature-icon" aria-hidden="true">▣</span>
                        <div><b>{t("wiz.featureRecordsTitle")}</b><span>{t("wiz.featureRecordsBody")}</span></div>
                    </div>
                    <div class="lv-wiz__feature">
                        <span class="lv-wiz__feature-icon" aria-hidden="true">♧</span>
                        <div><b>{t("wiz.featureMembersTitle")}</b><span>{t("wiz.featureMembersBody")}</span></div>
                    </div>
                    <div class="lv-wiz__feature">
                        <span class="lv-wiz__feature-icon" aria-hidden="true">◷</span>
                        <div><b>{t("wiz.featureRemindersTitle")}</b><span>{t("wiz.featureRemindersBody")}</span></div>
                    </div>
                </div>
                <div class="lv-wiz-flow" aria-label={t("wiz.flowLabel")}>
                    <div class="lv-wiz-flow__item">
                        <span class="lv-wiz-flow__num">1</span>
                        <div><b>{t("wiz.flowMembers")}</b><span>{t("wiz.flowMembersHint")}</span></div>
                    </div>
                    <div class="lv-wiz-flow__arrow" aria-hidden="true">→</div>
                    <div class="lv-wiz-flow__item">
                        <span class="lv-wiz-flow__num">2</span>
                        <div><b>{t("wiz.flowLedger")}</b><span>{t("wiz.flowLedgerHint")}</span></div>
                    </div>
                    <div class="lv-wiz-flow__arrow" aria-hidden="true">→</div>
                    <div class="lv-wiz-flow__item">
                        <span class="lv-wiz-flow__num">3</span>
                        <div><b>{t("wiz.flowReminders")}</b><span>{t("wiz.flowRemindersHint")}</span></div>
                    </div>
                </div>
            </div>
        </details>
        {#if step === 1}
            <div class="lv-wiz__current">
                <h3 id="lv-wiz-title" class="lv-wiz__title">{t("wiz.s1Title")}</h3>
                <p class="lv-sub lv-wiz__hint">{t("wiz.s1Hint")}</p>
            </div>
            <div class="lv-roles">
                {#each roleOptions as r (r)}
                    <button class="lv-rolechip" class:on={picked.includes(r)} aria-pressed={picked.includes(r)} disabled={provisioning} onclick={() => toggle(r)}>{roleEmoji[r]} {t(`role.${r}`)}</button>
                {/each}
            </div>
            {#if picked.includes("child")}
                <div class="lv-wiz__children">
                    <span class="lv-sub">{t("wiz.children")}</span>
                    <button class="b3-button b3-button--outline" aria-label={t("wiz.childrenDecrease")} disabled={provisioning} onclick={() => (children = Math.max(0, children - 1))}>−</button>
                    <b class="lv-num" aria-live="polite">{children}</b>
                    <button class="b3-button b3-button--outline" aria-label={t("wiz.childrenIncrease")} disabled={provisioning} onclick={() => (children += 1)}>＋</button>
                </div>
            {/if}
            <div class="lv-wiz__actions">
                <button class="lv-btn ghost" disabled={provisioning} onclick={skip}>{provisioning ? t("wiz.provisioningShort") : t("wiz.skip")}</button>
                <button class="lv-btn primary" disabled={provisioning} onclick={() => (step = 2)}>{t("wiz.next")} →</button>
            </div>
            {#if provisionError}<p class="lv-caption lv-wiz__error" role="alert">⚠ {skipFailed ? `${t("wiz.skipFailed")}: ${provisionError}` : provisionError}</p>{/if}
        {:else}
            <div class="lv-wiz__current">
                <h3 id="lv-wiz-title" class="lv-wiz__title">{t("wiz.s2Title")}</h3>
                <p class="lv-wiz__lead">{t("wiz.moduleIntro")}</p>
                <p class="lv-sub lv-wiz__hint">{t("wiz.s2Hint")}</p>
            </div>
            <div class="lv-roles">
                {#each recommended as mid (mid)}
                    <span class="lv-rolechip on">{t(`module.${mid}`)}</span>
                {/each}
                {#if recommended.length === 0}<span class="lv-sub">{t("wiz.noExtra")}</span>{/if}
            </div>
            {#if picked.includes("child") && children > 0}
                <!-- N3（重估后方案 A）：向导不建成员实体，性别只读不写不问——完成页引导去成员页补（D23 生长带依赖） -->
                <p class="lv-caption lv-wiz__note" role="note">ⓘ {t("wiz.sexHint")}</p>
            {/if}
            <div class="lv-wiz__actions lv-wiz__actions--split">
                <button class="lv-btn" disabled={provisioning} onclick={() => (step = 1)}>← {t("wiz.back")}</button>
                {#if provisionError}
                    <span class="lv-caption lv-wiz__error" role="alert">⚠ {skipFailed ? `${t("wiz.skipFailed")}: ${provisionError}` : provisionError}</span>
                {/if}
                <button class="lv-btn primary" disabled={provisioning}
                    title={t("wiz.finishCta")} onclick={finishAndCapture}>
                    {provisioning ? t("wiz.provisioningShort") : `✓ ${t("wiz.finishAndCapture")}`}
                </button>
            </div>
        {/if}
    </div>
</section>

<style>
    .lv-onboarding {
        margin-bottom: 16px;
        padding: clamp(16px, 3.5vw, 28px);
    }

    .lv-onboarding .lv-wiz { max-width: 680px; }

    .lv-onboarding .lv-wiz__intro {
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
    }

    .lv-onboarding .lv-wiz__intro-main { min-width: 0; }
    .lv-onboarding .lv-wiz__welcome { font-size: clamp(18px, 2.4vw, 21px); }
    .lv-onboarding .lv-wiz__intro-main > .lv-sub { margin: 0; line-height: 1.5; }

    .lv-onboarding .lv-wiz__progress {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
        flex: none;
    }

    .lv-onboarding .lv-wiz__step {
        padding: 4px 8px;
        border: 1px solid var(--lv-line);
        border-radius: 999px;
        background: var(--lv-surface);
        color: var(--lv-tx-3);
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0;
        white-space: nowrap;
    }

    .lv-onboarding .lv-wiz__progress-track {
        display: flex;
        gap: 3px;
        width: 58px;
        height: 3px;
    }

    .lv-onboarding .lv-wiz__progress-track span {
        flex: 1;
        border-radius: 3px;
        background: var(--lv-line-strong);
    }

    .lv-onboarding .lv-wiz__progress-track span.active { background: var(--lv-accent); }

    .lv-onboarding .lv-wiz__overview {
        margin-bottom: 18px;
        border: 1px solid var(--lv-line);
        border-radius: var(--lv-r-2);
        background: color-mix(in srgb, var(--lv-surface) 72%, transparent);
    }

    .lv-onboarding .lv-wiz__overview summary {
        min-height: 38px;
        padding: 9px 12px;
        color: var(--lv-tx-2);
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
    }

    .lv-onboarding .lv-wiz__overview summary::marker { color: var(--lv-accent); }

    .lv-onboarding .lv-wiz__overview-body { padding: 0 12px 12px; }
    .lv-onboarding .lv-wiz__overview-body > p { margin: 0 0 10px; color: var(--lv-tx-3); font-size: 12px; line-height: 1.55; }
    .lv-onboarding .lv-wiz__features { margin-bottom: 10px; }
    .lv-onboarding .lv-wiz-flow { margin-bottom: 0; }

    .lv-onboarding .lv-wiz__current { margin-bottom: 12px; }
    .lv-onboarding .lv-wiz__title { margin: 0 0 5px; font-size: 17px; }
    .lv-onboarding .lv-wiz__lead { margin: 0 0 4px; font-size: 12px; }
    .lv-onboarding .lv-wiz__hint { margin: 0; line-height: 1.5; }
    .lv-onboarding .lv-roles { gap: 7px; margin: 0 0 14px; }
    .lv-onboarding .lv-rolechip { min-height: 38px; padding: 7px 13px; font-size: 13px; }

    .lv-onboarding .lv-wiz__children {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: -2px 0 14px;
    }

    .lv-onboarding .lv-wiz__children > span { margin-right: 4px; }
    .lv-onboarding .lv-wiz__children > b { min-width: 24px; text-align: center; }
    .lv-onboarding .lv-wiz__children .b3-button { min-width: 34px; min-height: 34px; }

    .lv-onboarding .lv-wiz__actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding-top: 12px;
        border-top: 1px solid var(--lv-line);
    }

    .lv-onboarding .lv-wiz__actions--split { justify-content: space-between; }
    .lv-onboarding .lv-wiz__actions .lv-btn { min-height: 38px; }
    .lv-onboarding .lv-wiz__error { margin: 8px 0 0; color: var(--lv-danger); line-height: 1.5; overflow-wrap: anywhere; }
    .lv-onboarding .lv-wiz__actions--split .lv-wiz__error { flex: 1; margin: 0; }
    .lv-onboarding .lv-wiz__note { margin: 0 0 12px; color: var(--lv-accent); line-height: 1.5; }

    @media (max-width: 480px) {
        .lv-onboarding .lv-wiz__intro {
            grid-template-columns: 34px minmax(0, 1fr);
            align-items: start;
            gap: 8px 10px;
            margin-bottom: 12px;
        }

        .lv-onboarding .lv-wiz__intro-icon { width: 32px; height: 32px; font-size: 18px; }
        .lv-onboarding .lv-wiz__progress {
            grid-column: 2;
            flex-direction: row;
            align-items: center;
            gap: 8px;
        }

        .lv-onboarding .lv-wiz__progress-track { width: 42px; }
        .lv-onboarding .lv-wiz__overview { margin-bottom: 14px; }
        .lv-onboarding .lv-wiz__features { grid-template-columns: 1fr; }
        .lv-onboarding .lv-wiz-flow { display: grid; grid-template-columns: 1fr; gap: 8px; }
        .lv-onboarding .lv-wiz-flow .lv-wiz-flow__arrow { display: none; }
        .lv-onboarding .lv-wiz__actions { justify-content: stretch; }
        .lv-onboarding .lv-wiz__actions .lv-btn { justify-content: center; }
        .lv-onboarding .lv-wiz__actions--split { flex-wrap: wrap; }
        .lv-onboarding .lv-wiz__actions--split .lv-wiz__error { flex-basis: 100%; order: 3; }
    }
</style>
