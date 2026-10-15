/**
 * 小驴管家通用线性图标路径。
 * 路径与小驴打卡保持同一套 stroke 语言；组件只负责渲染，不携带业务状态。
 */
export const UI_ICON_PATHS = {
    home: "M3 10.5 12 3l9 7.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z M9 20v-6h6v6",
    settings: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9A7 7 0 0 0 15.5 6L15 3.5h-4L10.5 6a7 7 0 0 0-1.1.8l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 7 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9c.3.3.7.6 1.1.8l.5 2.5h4l.5-2.5c.4-.2.8-.6 1.1-.8l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z",
    bolt: "m13 2-9 11h7l-1 9 9-12h-7z",
    close: "M6 6l12 12M18 6 6 18",
    add: "M12 5v14M5 12h14",
    back: "m15 5-7 7 7 7",
    forward: "m9 5 7 7-7 7",
    search: "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0z M15 15l6 6",
    calendar: "M6 3v3M18 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1z M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01",
    clock: "M12 7v5l3 2M12 3a9 9 0 1 0 9 9",
    history: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2",
    check: "m5 12 4 4L19 6",
    checkCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z m-4-9 3 3 5-6",
    alert: "M12 3 2.8 20h18.4z M12 9v5M12 17h.01",
    info: "M12 8h.01M11 12h1v5h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
    folder: "M3 6.5A1.5 1.5 0 0 1 4.5 5h5l2 2h8A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z",
    users: "M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM17 11a3 3 0 0 0 0-6M21 20v-1.5a4 4 0 0 0-3-3.87",
    idCard: "M4 5h16v14H4z M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M12 9h5M12 13h5M7 14h3",
    heartPulse: "M3 12h4l2-5 4 10 2-5h6",
    shield: "M12 3 20 6v5c0 5-3.4 8.1-8 10-4.6-1.9-8-5-8-10V6z M9 12l2 2 4-4",
    note: "M6 3h9l3 3v15H6z M15 3v4h4M9 12h6M9 16h6",
    paw: "M8 11c-1.5 0-3-1.5-3-3s1-2.5 2-2.5 2 1.5 2 3M16 11c1.5 0 3-1.5 3-3s-1-2.5-2-2.5-2 1.5-2 3M12 13c-2.3 0-4 1.5-4 3.4C8 18.3 9.5 20 12 20s4-1.7 4-3.6c0-1.9-1.7-3.4-4-3.4z",
    homeAlt: "M3 11 12 3l9 8M5 9v11h14V9M9 20v-6h6v6",
    bank: "M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18M12 3l9 5H3z",
    cart: "M3 4h2l2 11h11l3-8H6M9 20h.01M17 20h.01",
    repeat: "M17 2l4 4-4 4M3 6h18M7 22l-4-4 4-4M21 18H3",
    medicine: "M8 3h8v3H8z M6 6h12v15H6z M9 13h6M12 10v6",
    box: "m4 7 8-4 8 4-8 4z M4 7v10l8 4 8-4V7M12 11v10",
    gift: "M3 10h18v11H3z M12 10v11M2 6h20v4H2z M12 6H8.5a2.5 2.5 0 1 1 2.5-2.5c0 2.5 1 2.5 1 2.5z M12 6h3.5a2.5 2.5 0 1 0-2.5-2.5C13 6 12 6 12 6z",
    mapPin: "M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
    paperclip: "m21 11.5-8.5 8.5a6 6 0 0 1-8.5-8.5l8.5-8.5a4 4 0 0 1 5.7 5.7L9.7 17.7a2 2 0 0 1-2.8-2.8l8-8",
    homeHouse: "M3 10 12 3l9 7v10H3z M9 21v-7h6v7",
    child: "M12 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 21v-3a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v3M8 16v5M16 16v5",
    backpack: "M6 8a6 6 0 0 1 12 0v13H6z M9 8V6a3 3 0 0 1 6 0v2M6 13h12M10 17h4",
    money: "M4 6h16v12H4z M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0z M7 9h.01M17 15h.01",
    bookmark: "M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4z",
    car: "M5 17h14l1-6-2-5H6l-2 5z M4 11h16M7 17v2M17 17v2M7 14h.01M17 14h.01",
    bus: "M5 16V6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v10M5 12h14M8 19v2M16 19v2M8 16h.01M16 16h.01",
    plane: "M3 11h7l2-8 2 8h7l-1 2h-5l2 8-5-3-5 3 2-8H4z",
    ticket: "M4 6h16v12H4a3 3 0 0 0 0-6 3 3 0 0 0 0-6z M12 6v12",
    luggage: "M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M5 7h14v14H5z M9 11v6M15 11v6",
    camera: "M4 7h4l2-3h4l2 3h4v13H4z M16 13a4 4 0 1 0-8 0 4 4 0 0 0 8 0",
    film: "M4 5h16v14H4z M8 5v14M16 5v14M4 9h4M16 9h4M4 15h4M16 15h4",
    fuel: "M5 20V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v15M5 8h11M8 6h4M16 7l3 3v7a2 2 0 0 0 2 2M19 13h-3",
    charging: "M13 2 6 13h5l-1 9 8-12h-5z",
    wrench: "M14 6a5 5 0 0 0-6.3 6.3l-5 5a2 2 0 1 0 2.8 2.8l5-5A5 5 0 0 0 17 9l-3 3-2-2z",
    bell: "M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
    mute: "M4 9v6h4l5 4V5L8 9z M19 9l-5 6M14 9l5 6",
    sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z",
    filter: "M4 5h16l-6 7v6l-4 2v-8z",
    archive: "M4 7h16v13H4z M3 4h18v3H3z M9 11h6",
} as const;

export type UiIconName = keyof typeof UI_ICON_PATHS;

/** A visual counterpart to core/modules.moduleIcon; the emoji API remains untouched. */
export const MODULE_UI_ICONS: Record<string, UiIconName> = {
    members: "users", certs: "idCard", health: "heartPulse", insurance: "shield", exams: "note", pets: "paw", social: "users",
    "assets-real": "homeAlt", "assets-virtual": "bank", shopping: "cart", memberships: "repeat", contracts: "note",
    medicine: "medicine", stock: "box", favors: "gift", chores: "wrench", food: "homeHouse", address: "mapPin",
    snippets: "paperclip", house: "homeHouse", parenting: "child", schooling: "backpack", allowance: "money", bookmarks: "bookmark",
    vehicles: "car", transit: "bus", "travel-plan": "plane", "travel-booking": "ticket", "travel-packing": "luggage", "travel-log": "camera", media: "film",
    adhoc: "note",
};

const iconCache = new Map<string, UiIconName>();

export function moduleUiIcon(id: string): UiIconName {
    if (!id) return "folder";
    const cached = iconCache.get(id);
    if (cached !== undefined) return cached;
    const icon = MODULE_UI_ICONS[id] ?? "folder";
    if (iconCache.size >= 200) iconCache.clear();
    iconCache.set(id, icon);
    return icon;
}

/** String renderer for the small imperative dialogs in the ledger screen. */
export function uiIcon(name: UiIconName, className = ""): string {
    const path = UI_ICON_PATHS[name] ?? UI_ICON_PATHS.folder;
    return `<svg class="lv-ui-icon ${className}" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="display:block;flex:none;width:22px!important;height:22px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${path}" style="fill:none!important;stroke:currentColor!important"></path></svg>`;
}

