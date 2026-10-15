import { Dialog } from "siyuan";

interface GrowthModalOptions {
    rows: any[];
    columns?: Record<string, string>;
    members: any[];
    t: (key: string) => string;
    showMessage: (msg: string, timeout: number, type: "info" | "error") => void;
}

export function openGrowthModal({ rows, columns, members, t, showMessage }: GrowthModalOptions): void {
    import("@/core/growth").then(({ collectGrowthSeries, whoBand, whoPercentile }) => {
        const series = collectGrowthSeries(rows, (columns ?? {}) as Record<string, string | undefined>, members);
        const dlg = new Dialog({
            title: t("ledger.growthChart"),
            content: `<div class="b3-dialog__content" id="lv-growth-body" style="max-height:60vh;overflow:auto"></div>`,
            width: "560px",
        });
        const body = dlg.element.querySelector("#lv-growth-body") as HTMLElement;
        if (series.length === 0) {
            body.innerHTML = `<div class="ft__on-surface" style="font-size:13px">${t("ledger.noGrowthData")}</div>`;
            return;
        }
        const COLORS = ["#4a6785", "#ac503d", "#5a8a48", "#8a5aa0", "#b08030"];
        const NS = "http://www.w3.org/2000/svg";
        const el = (tag: string, attrs: Record<string, string | number>, textContent?: string) => {
            const e = document.createElementNS(NS, tag);
            for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
            if (textContent !== undefined) e.textContent = textContent;
            return e;
        };
        let bandMode: "auto" | "male" | "female" | "off" = "auto";
        const sexById = new Map(members.map((m) => [m.id, m.sex as "male" | "female" | undefined]));
        const controls = document.createElement("div");
        controls.style.cssText = "display:flex;align-items:center;gap:6px;font-size:12px";
        const ctlLabel = document.createElement("span");
        ctlLabel.className = "ft__on-surface";
        ctlLabel.textContent = t("ledger.growthWhoSex");
        const sel = document.createElement("select");
        sel.className = "b3-select";
        for (const [v, key] of [["auto", "ledger.growthWhoAuto"], ["male", "members.sex.male"], ["female", "members.sex.female"], ["off", "ledger.growthWhoOff"]] as const) {
            const o = document.createElement("option");
            o.value = v;
            o.textContent = t(key);
            sel.appendChild(o);
        }
        sel.addEventListener("change", () => { bandMode = sel.value as typeof bandMode; renderPanels(); });
        controls.append(ctlLabel, sel);
        body.appendChild(controls);

        function renderPanels() {
            body.querySelectorAll(".lv-growth-panel, .lv-growth-note").forEach((n) => n.remove());
            for (const metric of ["height", "weight"] as const) {
                const ss = series.filter((s) => s.metric === metric);
                if (!ss.length) continue;
                const panel = document.createElement("div");
                panel.className = "lv-growth-panel";
                const head = document.createElement("div");
                head.style.cssText = "font-weight:600;font-size:13px;margin:10px 0 4px";
                head.textContent = t(metric === "height" ? "ledger.growthHeight" : "ledger.growthWeight");
                panel.appendChild(head);
                const W = 500, H = 170, PAD = 40;
                const all = ss.flatMap((s) => s.points.map((p, pi) => ({ x: p.ageMonths ?? pi, y: p.value })));
                const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
                const xMin = Math.min(...xs), xMax = Math.max(...xs);
                let yMin = Math.min(...ys), yMax = Math.max(...ys);
                const knownSexes = [...new Set(ss.map((s) => sexById.get(s.memberId)).filter(Boolean))] as ("male" | "female")[];
                const bandSex: "male" | "female" | null =
                    bandMode === "off" ? null : bandMode === "auto" ? (knownSexes.length === 1 ? knownSexes[0] : null) : bandMode;
                const x0b = Math.max(xMin, 0), x1b = Math.min(xMax, 60);
                let bandPts: { x: number; p3: number; p50: number; p97: number }[] = [];
                if (bandSex && x1b >= x0b) {
                    const samples = new Set<number>([x0b, x1b]);
                    for (let m = Math.ceil(x0b); m <= Math.floor(x1b); m++) samples.add(m);
                    for (const x of [...samples].sort((a, b) => a - b)) {
                        const b = whoBand(bandSex, metric, x);
                        if (b) { bandPts.push({ x, p3: b.p3, p50: b.p50, p97: b.p97 }); yMin = Math.min(yMin, b.p3); yMax = Math.max(yMax, b.p97); }
                    }
                }
                const sx = (x: number) => (xMax === xMin ? W / 2 : PAD + ((x - xMin) / (xMax - xMin)) * (W - PAD * 2));
                const sy = (y: number) => (yMax === yMin ? H / 2 : H - PAD - ((y - yMin) / (yMax - yMin)) * (H - PAD * 2));
                const fx = (x: number) => (Number.isInteger(x) ? String(x) : (Math.round(x * 10) / 10).toFixed(1));
                const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
                svg.appendChild(el("line", { x1: PAD, y1: H - PAD, x2: W - PAD / 2, y2: H - PAD, stroke: "var(--b3-border-color)" }));
                svg.appendChild(el("line", { x1: PAD, y1: PAD / 2, x2: PAD, y2: H - PAD, stroke: "var(--b3-border-color)" }));
                svg.appendChild(el("text", { x: PAD - 6, y: PAD / 2 + 4, "text-anchor": "end", "font-size": 10 }, String(Math.round(yMax * 10) / 10)));
                svg.appendChild(el("text", { x: PAD - 6, y: H - PAD + 4, "text-anchor": "end", "font-size": 10 }, String(Math.round(yMin * 10) / 10)));
                svg.appendChild(el("text", { x: PAD, y: H - PAD + 14, "font-size": 10 }, fx(xMin)));
                svg.appendChild(el("text", { x: W - PAD / 2, y: H - PAD + 14, "text-anchor": "end", "font-size": 10 }, `${fx(xMax)}${xs.some((x) => x > 0) ? "月龄" : ""}`));
                if (bandPts.length >= 2) {
                    const top = bandPts.map((b) => `${sx(b.x)},${sy(b.p97)}`).join(" ");
                    const bottom = [...bandPts].reverse().map((b) => `${sx(b.x)},${sy(b.p3)}`).join(" ");
                    svg.appendChild(el("polygon", { points: `${top} ${bottom}`, fill: "var(--b3-theme-primary)", opacity: 0.08 }));
                    svg.appendChild(el("polyline", { points: bandPts.map((b) => `${sx(b.x)},${sy(b.p50)}`).join(" "), fill: "none", stroke: "var(--b3-theme-primary)", opacity: 0.45, "stroke-width": 1.2, "stroke-dasharray": "4 3" }));
                    const bandLabel = el("text", { x: W - PAD / 2, y: PAD / 2 - 8, "text-anchor": "end", "font-size": 10, fill: "var(--b3-theme-primary)", opacity: 0.85 });
                    bandLabel.textContent = `WHO P3–P97 · ${t(bandSex === "male" ? "members.sex.male" : "members.sex.female")}`;
                    svg.appendChild(bandLabel);
                }
                ss.forEach((s, i) => {
                    const color = COLORS[i % COLORS.length];
                    const pts = s.points;
                    const memberSex = sexById.get(s.memberId);
                    const pointEl = (x: number, y: number, p: { date: string; value: number; ageMonths: number | null }) => {
                        const dot = el("circle", { cx: sx(x), cy: sy(y), r: pts.length === 1 ? 3 : 2.5, fill: color });
                        const pct = memberSex && p.ageMonths !== null ? whoPercentile(memberSex, metric, p.ageMonths, p.value) : null;
                        const label = document.createElementNS(NS, "title");
                        label.textContent = pct !== null ? `P${Math.round(pct)} · ${p.date} ${p.value}` : `${p.date} ${p.value}`;
                        dot.appendChild(label);
                        return dot;
                    };
                    if (pts.length === 1) {
                        svg.appendChild(pointEl(sx(pts[0].ageMonths ?? 0), sy(pts[0].value), pts[0]));
                    } else {
                        svg.appendChild(el("polyline", {
                            points: pts.map((p) => `${sx(p.ageMonths ?? 0)},${sy(p.value)}`).join(" "),
                            fill: "none", stroke: color, "stroke-width": 2,
                        }));
                        for (const p of pts) svg.appendChild(pointEl(p.ageMonths ?? 0, p.value, p));
                    }
                    const legend = el("text", { x: PAD + 4, y: PAD / 2 + 16 + i * 14, "font-size": 11, fill: color });
                    legend.textContent = s.memberName;
                    svg.appendChild(legend);
                });
                panel.appendChild(svg);
                body.appendChild(panel);
            }
            const note = document.createElement("div");
            note.className = "lv-growth-note ft__on-surface";
            note.style.cssText = "font-size:11.5px;margin-top:6px";
            note.textContent = t("ledger.growthWhoNote");
            body.appendChild(note);
        }
        renderPanels();
    }).catch((e) => {
        showMessage(t("ledger.growthFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
    });
}
