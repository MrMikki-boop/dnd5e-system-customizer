export function hiddenEntries(custom, original, userId) {
    const entries = [];
    const walk = (category, overrides, source, inherited = false) => {
        for (const [key, value] of Object.entries(overrides ?? {})) {
            if (!value || typeof value !== "object") continue;
            const hidden = inherited || (value.hidden === true && !(value.allowedUsers ?? []).includes(userId));
            if (value.children) {
                walk(category, value.children, source?.[key]?.children, hidden);
                continue;
            }
            if (!hidden) continue;
            const base = source?.[key];
            entries.push({ category, key, label: value.label ?? base?.label ?? base ?? key });
        }
    };
    for (const category of ["abilities", "skills", "weaponTypes", "alignments", "damageTypes", "languages"]) {
        walk(category, custom[category], original[category]);
    }
    return entries;
}

// Presentation only: retain controls and their values so submitting another field
// cannot remove a hidden proficiency, language, or damage resistance.
export function hidePlayerCustomizations(app, root, custom, original, userId, localize) {
    if (!root.matches?.(".dnd5e, .dnd5e2") && !root.querySelector?.(".dnd5e, .dnd5e2")) return;
    const hide = element => element?.style.setProperty("display", "none", "important");
    const entries = hiddenEntries(custom, original, userId);
    const selectors = {
        abilities: "[data-ability]",
        skills: "[data-skill], li[data-key]",
        damageTypes: "[data-damage]",
        languages: "[data-language]",
    };
    const attribute = { abilities: "ability", skills: "skill", damageTypes: "damage", languages: "language" };
    const traitCategories = { languages: "languages", di: "damageTypes", dr: "damageTypes", dv: "damageTypes", dm: "damageTypes" };
    const headingKeys = { languages: "DND5E.Languages", di: "DND5E.DamImm", dr: "DND5E.DamRes", dv: "DND5E.DamVuln" };
    const weapon = (app.document ?? app.item)?.type === "weapon";

    for (const entry of entries) {
        const { category, key } = entry;
        if (selectors[category]) {
            for (const node of root.querySelectorAll(selectors[category])) {
                if ((node.dataset[attribute[category]] ?? node.dataset.key) !== key) continue;
                if (category === "skills" && !node.dataset.skill && !node.querySelector(
                    'proficiency-cycle[type="skill"], [name^="system.skills."], [data-type="skill"]'
                ) && !node.classList.contains("skill") && !node.classList.contains("skill-row")) continue;
                hide(node);
            }
        }

        for (const input of root.querySelectorAll("[name]")) {
            const name = input.getAttribute("name");
            const trait = name.match(/^system\.traits\.(languages|di|dr|dv|dm)\.(?:value|amount)\.(.+)$/);
            if (trait && traitCategories[trait[1]] === category && trait[2].split(":").at(-1) === key) {
                hide(input.closest("li") ?? input);
            }
            const selectCategory = name === "system.type.value" && weapon ? "weaponTypes"
                : name === "system.details.alignment" ? "alignments"
                : /(?:^|\.)damage\..*types$/.test(name) ? "damageTypes"
                : null;
            if (selectCategory !== category) continue;
            for (const option of input.querySelectorAll("option")) {
                if (option.value === key || (category === "alignments" && option.value === localize(entry.label))) {
                    option.hidden = true;
                    hide(option);
                    if (option.selected && input.tagName === "SELECT" && !input.multiple) hide(input);
                }
            }
            if (category === "alignments" && [key, localize(entry.label)].includes(input.value)) hide(input);
        }

        if (category === "alignments") {
            for (const row of root.querySelectorAll(".characteristics li, .creature-alignment")) {
                const label = row.querySelector(".label")?.textContent.trim();
                const value = row.querySelector("input")?.value
                    ?? (row.querySelector(".value") ?? row.querySelector("span"))?.textContent.trim();
                if ((label === localize("DND5E.Alignment") || row.classList.contains("creature-alignment"))
                    && [key, localize(entry.label)].includes(value)) hide(row);
            }
        }

        // Modern trait pills have labels but no stable per-value data attribute.
        for (const group of root.querySelectorAll(".pills-group, .form-group")) {
            const trait = group.querySelector("[data-trait]")?.dataset.trait;
            const heading = group.querySelector("h3 .roboto-upper")?.textContent.trim();
            const matchingTrait = traitCategories[trait] === category || Object.entries(headingKeys).some(
                ([id, label]) => traitCategories[id] === category && heading === localize(label)
            );
            if (!matchingTrait) continue;
            for (const pill of group.querySelectorAll("li.pill, li.tag")) {
                const label = pill.querySelector(".label")?.textContent ?? pill.textContent;
                if (label.trim() === localize(entry.label)) hide(pill);
            }
        }
    }
}
