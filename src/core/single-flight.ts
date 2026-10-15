/** Coalesce concurrent work and repeat it if the state key changed mid-run. */
export function createSingleFlightUntilStable(key: () => string, run: () => Promise<void>): () => Promise<void> {
    let task: Promise<void> | undefined;
    return () => {
        if (task) return task;
        let current: Promise<void>;
        current = Promise.resolve().then(async () => {
            let before: string;
            do {
                before = key();
                await run();
            } while (before !== key());
        }).finally(() => {
            if (task === current) task = undefined;
        });
        task = current;
        return current;
    };
}
