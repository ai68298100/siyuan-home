/** Small, browser-independent helpers used by the session recovery flow. */

/**
 * Convert a stored or event-provided return target into a same-origin path.
 * External URLs and the host login route are rejected so a stale value cannot
 * create an open redirect or a login loop.
 */
export function sameOriginReturnPath(value: unknown, origin: string, fallback = "/"): string {
    const fallbackIsLogin = fallback === "/check-auth" || fallback.startsWith("/check-auth/");
    const safeFallback = fallback.startsWith("/") && !fallback.startsWith("//") && !fallbackIsLogin ? fallback : "/";
    if (typeof value !== "string" || !value.trim()) return safeFallback;
    try {
        const target = new URL(value, origin);
        if (target.origin !== origin) return safeFallback;
        if (target.pathname === "/check-auth" || target.pathname.startsWith("/check-auth/")) return safeFallback;
        return `${target.pathname}${target.search}${target.hash}` || "/";
    } catch {
        return safeFallback;
    }
}

/** Keep kernel/network messages readable in toasts and narrow status cards. */
export function compactUserMessage(value: unknown, fallback: string, max = 240): string {
    if (typeof value !== "string") return fallback;
    const text = value.replace(/[\r\n\t]+/g, " ").trim();
    return text ? text.slice(0, Math.max(1, max)) : fallback;
}
