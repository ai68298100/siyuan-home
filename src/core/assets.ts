/**
 * Helpers for assets referenced by SiYuan mAsset cells.
 *
 * The kernel returns asset paths such as `assets/siyuan-home/file.png`.
 * Keep URL construction in one place so a path stored in a ledger cannot
 * accidentally turn into an external navigation target.
 */

export interface AssetRef {
    name?: string;
    content?: string;
}

const ASSET_PREFIX = "/assets/";
const DEFAULT_ORIGIN = "http://localhost";

function runtimeOrigin(): string {
    const location = (globalThis as { location?: Location }).location;
    return location?.origin || DEFAULT_ORIGIN;
}

function decodePathFully(path: string): string {
    let decoded = path;
    for (let i = 0; i < 4; i += 1) {
        const next = decodeURIComponent(decoded);
        if (next === decoded) return decoded;
        decoded = next;
    }
    return decoded;
}

/**
 * Resolve a kernel asset path to an URL on the current SiYuan origin.
 *
 * Only `/assets/...` paths and absolute URLs on the supplied origin are
 * accepted. This prevents an mAsset value from becoming an external link or
 * escaping the assets directory through `..` segments.
 */
export function assetHref(path: string, origin = runtimeOrigin()): string {
    if (typeof path !== "string" || path.trim() === "") {
        throw new TypeError("asset path is required");
    }
    if (path.includes("\\")) {
        throw new TypeError("asset path must use URL separators");
    }

    let base: URL;
    try {
        base = new URL(origin);
    } catch {
        throw new TypeError("invalid asset origin");
    }
    const trimmed = path.trim();
    let decodedInput: string;
    try {
        decodedInput = decodePathFully(trimmed);
    } catch {
        throw new TypeError("invalid encoded asset path");
    }
    const inputPath = decodedInput.replace(/^[a-z][a-z\d+.-]*:\/\/[^/]+/i, "").split(/[?#]/, 1)[0];
    if (inputPath.includes("\\") || inputPath.split("/").includes("..")) {
        throw new TypeError("asset path must not traverse parent directories");
    }
    let url: URL;
    try {
        // A kernel path is usually relative (`assets/...`); a leading slash
        // is also accepted for callers that already normalized it.
        url = new URL(trimmed, base);
    } catch {
        throw new TypeError("invalid asset path");
    }

    let decodedPath: string;
    try {
        decodedPath = decodePathFully(url.pathname);
    } catch {
        throw new TypeError("invalid encoded asset path");
    }
    if (url.origin !== base.origin || !url.pathname.startsWith(ASSET_PREFIX) || decodedPath.split("/").includes("..")) {
        throw new TypeError("asset path must be a same-origin /assets/ URL");
    }
    return url.href;
}

/** OCR is offered only for local image attachments, never PDFs or external URLs. */
export function isImageAsset(path: string): boolean {
    try {
        const url = new URL(assetHref(path));
        const filename = decodeURIComponent(url.pathname.split("/").pop() ?? "");
        return /\.(?:png|jpe?g|gif|webp|bmp|tiff?|heic|heif)$/i.test(filename);
    } catch {
        return false;
    }
}

/** The kernel identifies notebook-scoped asset references with the `box` query. */
export function isEncryptedNotebookAsset(path: string, notebooks: readonly { id: string; encrypted?: boolean }[]): boolean {
    try {
        const boxID = new URL(assetHref(path)).searchParams.get("box")?.trim();
        return !!boxID && notebooks.some((notebook) => notebook.id === boxID && notebook.encrypted === true);
    } catch {
        return false;
    }
}

/** Return a safe leaf filename for the browser download attribute. */
export function safeDownloadName(name?: string, fallback = "attachment"): string {
    const leaf = String(name ?? "").split(/[\\/]/).pop() ?? "";
    const clean = leaf
        .replace(/[\u0000-\u001f\u007f]/g, "_")
        .replace(/[<>:"|?*]/g, "_")
        .replace(/\s+/g, " ")
        .trim();
    if (clean && clean !== "." && clean !== "..") return clean.slice(0, 180);

    const fallbackLeaf = String(fallback).split(/[\\/]/).pop() ?? "attachment";
    const safeFallback = fallbackLeaf
        .replace(/[\u0000-\u001f\u007f]/g, "_")
        .replace(/[<>:"|?*]/g, "_")
        .trim();
    return (safeFallback && safeFallback !== "." && safeFallback !== ".." ? safeFallback : "attachment").slice(0, 180);
}

export interface DownloadAssetOptions {
    origin?: string;
    fetchImpl?: typeof fetch;
    documentRef?: Document;
    /** 外部取消信号；下载超时默认 15 秒，避免附件请求永久占用界面状态。 */
    signal?: AbortSignal;
    timeoutMs?: number;
}

/** Fetch an asset and trigger a browser download using its original name. */
export async function downloadAsset(asset: AssetRef, options: DownloadAssetOptions = {}): Promise<void> {
    const href = assetHref(asset?.content ?? "", options.origin);
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") throw new Error("asset download requires fetch");

    const controller = new AbortController();
    let abortListener: (() => void) | undefined;
    if (options.signal) {
        abortListener = () => controller.abort();
        if (options.signal.aborted) controller.abort();
        else options.signal.addEventListener("abort", abortListener, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), Math.max(1, options.timeoutMs ?? 15_000));
    let response: Response;
    try {
        response = await fetchImpl(href, { credentials: "same-origin", signal: controller.signal });
    } finally {
        clearTimeout(timer);
        if (options.signal && abortListener) options.signal.removeEventListener("abort", abortListener);
    }
    if (response.status === 401 || response.status === 403) throw new Error("登录状态已失效，请重新登录后重试");
    if (!response.ok) throw new Error(`asset download failed: HTTP ${response.status}`);
    const blob = await response.blob();
    const documentRef = options.documentRef ?? (globalThis as { document?: Document }).document;
    if (!documentRef) throw new Error("asset download requires a browser document");

    const objectUrl = URL.createObjectURL(blob);
    try {
        const anchor = documentRef.createElement("a");
        anchor.href = objectUrl;
        anchor.download = safeDownloadName(asset.name);
        anchor.style.display = "none";
        (documentRef.body ?? documentRef.documentElement).appendChild(anchor);
        anchor.click();
        anchor.remove();
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}
