export const DEFAULT_AVATAR = "我";
export const AVATAR_IMAGE_LIMIT = 1_000_000;

export const AVATAR_PRESETS = ["我", "★", "🐴", "🌿", "☀", "🎯"] as const;

export function normalizeAvatarText(value: unknown): string {
    if (typeof value !== "string") return DEFAULT_AVATAR;
    const text = [...value.trim()].slice(0, 2).join("");
    return text || DEFAULT_AVATAR;
}

export function normalizeAvatarImage(value: unknown): string | undefined {
    if (typeof value !== "string" || value.length > AVATAR_IMAGE_LIMIT) return undefined;
    const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) return undefined;
    const base64 = match[1];
    const validBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    return base64.length > 0 && base64.length % 4 !== 1 && validBase64.test(base64) ? value : undefined;
}
