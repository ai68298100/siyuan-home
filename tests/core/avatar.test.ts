import { describe, expect, it } from "vitest";
import { AVATAR_IMAGE_LIMIT, DEFAULT_AVATAR, normalizeAvatarImage, normalizeAvatarText } from "@/core/avatar";

describe("avatar preference normalization", () => {
    it("defaults to a simple avatar and limits custom text to two code points", () => {
        expect(normalizeAvatarText(undefined)).toBe(DEFAULT_AVATAR);
        expect(normalizeAvatarText("  ")).toBe(DEFAULT_AVATAR);
        expect(normalizeAvatarText("小驴管家")).toBe("小驴");
        expect(normalizeAvatarText("🐴头像")).toBe("🐴头");
    });

    it("accepts only bounded local raster data URLs", () => {
        const image = "data:image/webp;base64,QUJD";
        expect(normalizeAvatarImage(image)).toBe(image);
        expect(normalizeAvatarImage("https://example.com/avatar.png")).toBeUndefined();
        expect(normalizeAvatarImage("data:image/svg+xml;base64,PHN2Zz4=")).toBeUndefined();
        expect(normalizeAvatarImage("data:image/png;base64,")).toBeUndefined();
        expect(normalizeAvatarImage("data:image/png;base64,A")).toBeUndefined();
        expect(normalizeAvatarImage("data:image/png;base64,AA=")).toBeUndefined();
        expect(normalizeAvatarImage("data:image/png;base64,AAAAA")).toBeUndefined();
        expect(normalizeAvatarImage("data:image/png;base64,AA==")).toBe("data:image/png;base64,AA==");
        expect(normalizeAvatarImage(`data:image/png;base64,${"A".repeat(AVATAR_IMAGE_LIMIT)}`)).toBeUndefined();
    });
});
