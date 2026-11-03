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
        if (["weaponTypes", "alignments"].includes(key)) {
            result[key] = Object.fromEntries(Object.entries(value).map(([id, entry]) => [id, convert(entry, original[key]?.[id], true)]));
        } else result[key] = convert(value, original[key]);
    }
    return result;
}
