const CATEGORIES = ["abilities", "skills", "weaponTypes", "alignments", "damageTypes", "languages", "currencies"];
const METADATA = new Set(["_custom", "_customGroup", "hidden", "allowedUsers"]);
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

export function validateCustomizations(value) {
    if (!isObject(value)) throw new Error("Expected a customization object");
    const visit = node => {
        if (!node || typeof node !== "object") return;
        for (const [key, child] of Object.entries(node)) {
            if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error(`Unsafe key: ${key}`);
            if (key === "allowedUsers" && (!Array.isArray(child) || child.some(id => typeof id !== "string"))) {
                throw new Error("allowedUsers must be an array of user IDs");
            }
            if (key === "hidden" && typeof child !== "boolean") throw new Error("hidden must be boolean");
            visit(child);
        }
    };
    visit(value);
    for (const category of CATEGORIES) {
        if (value[category] !== undefined && !isObject(value[category])) throw new Error(`Invalid ${category}`);
        for (const entry of Object.values(value[category] ?? {})) {
            if (typeof entry !== "string" && !isObject(entry)) throw new Error(`Invalid ${category} entry`);
        }
    }
    if (value.experience !== undefined) {
        const xp = value.experience;
        if (!isObject(xp)) throw new Error("Invalid experience settings");
        if (xp.tableMode !== undefined && !["standard", "multiplier", "custom", "points", "percent"].includes(xp.tableMode)) {
            throw new Error("Invalid experience table mode");
        }
        if (xp.levelingMode !== undefined && !["noxp", "xp", "xpBoons"].includes(xp.levelingMode)) {
            throw new Error("Invalid leveling mode");
        }
        if (xp.xpTable !== undefined && (!Array.isArray(xp.xpTable) || xp.xpTable.some(n => !Number.isFinite(n) || n < 0))) {
            throw new Error("Invalid experience table");
        }
        for (const key of ["maxLevel", "multiplier", "pointsPerLevel", "percentStep", "epicBoonInterval"]) {
            if (xp[key] !== undefined && (!Number.isFinite(Number(xp[key])) || Number(xp[key]) <= 0)) {
                throw new Error(`Invalid experience.${key}`);
            }
        }
    }
}

export function prepareRuntimeCustomizations(custom, original) {
    const convert = (value, source, strings = false) => {
        if (!isObject(value)) return Array.isArray(value) ? value.map(v => convert(v)) : value;
        // dnd5e consumes these entries as labels, not configuration objects.
        if (strings || typeof source === "string") return value.label ?? source ?? "";
        const result = {};
        for (const [key, child] of Object.entries(value)) {
            if (!METADATA.has(key)) result[key] = convert(child, source?.[key]);
        }
        return result;
    };
    const result = {};
    for (const [key, value] of Object.entries(custom)) {
        // Applied through dnd5e's real config fields and roll integration.
        if (["initiativeAbility", "hitPointsAbility", "initiativeFormula"].includes(key)) continue;
        // Standard status descriptions belong to the selected dnd5e rules edition.
        // Keep old/imported settings intact, but never pin their rule references.
        const category = key.split(".")[0];
        if (["conditionTypes", "statusEffects"].includes(category)) {
            if (key !== category || !isObject(value)) continue;
            const entries = {};
            for (const [id, entry] of Object.entries(value)) {
                const standard = original.conditionTypes?.[id] ?? original.statusEffects?.[id];
                if (!standard) { entries[id] = entry; continue; }
                if (!isObject(entry) || !original[key]?.[id]) continue;
                const { reference, description, ...override } = entry;
                if (Object.keys(override).length) entries[id] = override;
            }
            result[key] = convert(entries, original[key]);
        } else if (key === "damageTypes") {
            // An override is not a new type. Do not resurrect entries supplied by
            // a module which is no longer present (for example Midi-QOL's none).
            if (!isObject(value)) continue;
            const entries = Object.entries(value).filter(([id, entry]) => original.damageTypes?.[id] || entry?._custom);
            result[key] = convert(Object.fromEntries(entries), original[key]);
        } else if (["weaponTypes", "alignments"].includes(key)) {
            result[key] = Object.fromEntries(Object.entries(value).map(([id, entry]) => [id, convert(entry, original[key]?.[id], true)]));
        } else result[key] = convert(value, original[key]);
    }
    return result;
}
