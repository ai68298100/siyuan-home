/** Display-only date helpers. Invalid or missing persisted values become an
 * explicit placeholder instead of leaking `Invalid Date` into the UI. */
export function safeDate(value: unknown): Date | undefined {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : undefined;
    if (typeof value !== "string" && typeof value !== "number") return undefined;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : undefined;
}

export function formatLocalTime(value: unknown, options?: Intl.DateTimeFormatOptions): string | undefined {
    const date = safeDate(value);
    return date ? date.toLocaleTimeString([], options) : undefined;
}

export function formatLocalDateTime(value: unknown, options?: Intl.DateTimeFormatOptions): string | undefined {
    const date = safeDate(value);
    return date ? date.toLocaleString([], options) : undefined;
}

export function formatLocalDate(value: unknown, options?: Intl.DateTimeFormatOptions): string | undefined {
    const date = safeDate(value);
    return date ? date.toLocaleDateString([], options) : undefined;
}
