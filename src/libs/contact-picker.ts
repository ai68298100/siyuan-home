/**
 * 联系人选人对话框（EC13/EC14 共用）：window.LvContacts.searchPeople 实时搜索。
 * 源码契约：docs/research/2026-10-03-EC-源码契约摘录.md §1。
 * 降级：人脉未装/未初始化/搜索失败各有提示；快照格式 `名称 [docId]`。
 */
import { Dialog } from "siyuan";

export interface ContactPickHandle {
    showMessage(msg: string, timeout: number, type: "info" | "error"): void;
    t(key: string, vars?: Record<string, string>): string;
}

interface LvContactsSearch {
    searchPeople: (keyword: string) => Promise<{ docId: string; name: string }[]>;
}

export function getContactsBridge(): LvContactsSearch | undefined {
    return (window as { LvContacts?: LvContactsSearch }).LvContacts;
}

/** 打开选人对话框；选中回调收到快照串 `名称 [docId]` */
export function openContactPicker(
    handle: ContactPickHandle,
    onPicked: (snapshot: string) => void,
): void {
    const bridge = getContactsBridge();
    if (!bridge?.searchPeople) {
        handle.showMessage(handle.t("ledger.contactsMissing"), 5000, "info");
        return;
    }
    const dlg = new Dialog({
        title: handle.t("ledger.pickContact"),
        content: `<div class="b3-dialog__content"><input class="b3-text-field fn__block" id="lv-pick-kw" placeholder="${handle.t("ledger.search")}"><div id="lv-pick-list" style="max-height:50vh;overflow:auto;margin-top:8px"></div></div>
<div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-pick-close">${handle.t("cancel")}</button></div>`,
        width: "460px",
    });
    const kw = dlg.element.querySelector("#lv-pick-kw") as HTMLInputElement;
    const list = dlg.element.querySelector("#lv-pick-list") as HTMLElement;
    (dlg.element.querySelector("#lv-pick-close") as HTMLButtonElement).onclick = () => dlg.destroy();
    kw.focus();
    let seq = 0;
    const runSearch = async () => {
        const keyword = kw.value.trim();
        const mine = ++seq;
        try {
            const people = await bridge.searchPeople(keyword);
            if (mine !== seq) return; // 旧请求结果丢弃（PF07 语义）
            list.innerHTML = "";
            if (people.length === 0) {
                const empty = document.createElement("div");
                empty.className = "ft__on-surface";
                empty.style.cssText = "padding:6px 0;font-size:12.5px";
                empty.textContent = handle.t("ledger.contactsEmpty");
                list.appendChild(empty);
                return;
            }
            for (const p of people) {
                const rowEl = document.createElement("div");
                rowEl.className = "lv-row-link";
                rowEl.style.cssText = "padding:6px 8px;font-size:13px;border-radius:4px";
                rowEl.setAttribute("role", "button");
                rowEl.setAttribute("tabindex", "0");
                rowEl.textContent = p.name;
                const pick = () => {
                    onPicked(`${p.name} [${p.docId}]`);
                    dlg.destroy();
                };
                rowEl.onclick = pick;
                rowEl.onkeydown = (e: KeyboardEvent) => e.key === "Enter" && pick();
                list.appendChild(rowEl);
            }
        } catch (e) {
            if (mine !== seq) return;
            list.innerHTML = "";
            const err = document.createElement("div");
            err.style.cssText = "padding:6px 0;font-size:12.5px;color:var(--lv-danger)";
            err.textContent = handle.t("ledger.contactsError").replace("${msg}", e instanceof Error ? e.message : String(e));
            list.appendChild(err);
        }
    };
    kw.oninput = () => void runSearch();
    void runSearch();
}
