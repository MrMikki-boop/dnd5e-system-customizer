export function reloadCurrentClient() {
    if (foundry.utils.debouncedReload instanceof Function) foundry.utils.debouncedReload();
    else window.location.reload();
}

export function waitForReload() {
    return new Promise(resolve => window.setTimeout(resolve, 500));
}

export async function confirmReloadAfterSave(moduleId, loc) {
    const title = loc(`${moduleId}.CustomizerApp.reloadConfirm.title`) || "Save Changes?";
    const content = `<p>${loc(`${moduleId}.CustomizerApp.reloadConfirm.content`) || "The page will reload after saving so system changes can take effect."}</p>`;
    const yesLabel = loc(`${moduleId}.CustomizerApp.reloadConfirm.yes`) || "Save and Reload";
    const noLabel = loc(`${moduleId}.CustomizerApp.reloadConfirm.no`) || "Cancel";
    const DialogV2 = foundry.applications?.api?.DialogV2;

    if (DialogV2?.confirm instanceof Function) {
        return DialogV2.confirm({
            window: { title },
            content,
            modal: true,
            yes: { icon: "fa-solid fa-check", label: yesLabel, default: true },
            no: { icon: "fa-solid fa-xmark", label: noLabel },
        });
    }

    return Dialog.confirm({
        title,
        content,
        yes: () => true,
        no: () => false,
        defaultYes: true,
    });
}
