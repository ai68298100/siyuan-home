import { describe, it, expect } from "vitest";
import { createSingleFlightUntilStable } from "@/core/single-flight";

describe("createSingleFlightUntilStable", () => {
    it("rechecks state changed during an in-flight pass", async () => {
        let enabled = ["certs"];
        let releaseFirst!: () => void;
        let markStarted!: () => void;
        const firstStarted = new Promise<void>((resolve) => (markStarted = resolve));
        const firstGate = new Promise<void>((resolve) => (releaseFirst = resolve));
        const snapshots: string[] = [];
        let active = 0;
        let maxActive = 0;
        const ensure = createSingleFlightUntilStable(
            () => [...enabled].sort().join(","),
            async () => {
                active += 1;
                maxActive = Math.max(maxActive, active);
                snapshots.push([...enabled].sort().join(","));
                if (snapshots.length === 1) {
                    markStarted();
                    await firstGate;
                }
                active -= 1;
            },
        );

        const first = ensure();
        await firstStarted;
        enabled = ["certs", "medicine"];
        const concurrent = ensure();
        expect(concurrent).toBe(first);
        releaseFirst();
        await Promise.all([first, concurrent]);

        expect(snapshots).toEqual(["certs", "certs,medicine"]);
        expect(maxActive).toBe(1);
    });

    it("does not repeat work when concurrent callers use the same state", async () => {
        let runs = 0;
        const ensure = createSingleFlightUntilStable(() => "same", async () => { runs += 1; });
        await Promise.all([ensure(), ensure()]);
        expect(runs).toBe(1);
    });
});
