const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const MODULE_ID = "dnd5e-system-customizer";
async function loadModule(file) {
    return import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(path.join(root, file))).toString("base64")}`);
}
function getProperty(object, key) {
    return key.split(".").reduce((value, part) => value?.[part], object);
}
function setProperty(object, key, value) {
    const parts = key.split(".");
    let node = object;
    for (const part of parts.slice(0, -1)) node = node[part] ??= {};
    const leaf = parts.at(-1);
    if (leaf.startsWith("-=")) delete node[leaf.slice(2)];
    else node[leaf] = value;
}
function mergeObject(target, source) {
    for (const [key, value] of Object.entries(source)) {
        if (key.includes(".")) setProperty(target, key, value);
        else if (value && typeof value === "object" && !Array.isArray(value)) {
            if (!target[key] || typeof target[key] !== "object") target[key] = {};
            mergeObject(target[key], value);
        } else target[key] = value;
    }
    return target;
}
function actor(xp, flag, id = "one") {
    return {
        uuid: `Actor.${id}`, type: "character", system: { details: { level: 1, xp: { value: xp } } },
        flags: { [MODULE_ID]: flag === undefined ? {} : { experienceStandardValue: flag } },
        getFlag(module, key) { return this.flags[module]?.[key]; },
        async update(update) { mergeObject(this, update); return this; },
    };
}
async function loadIndex(custom = {}, actors = []) {
    let source = fs.readFileSync(path.join(root, "index.js"), "utf8");
    const imports = {};
    for (const match of source.matchAll(/^import\s*\{([\s\S]*?)\}\s*from\s*"\.\/(.*?)";/gm)) {
        Object.assign(imports, await loadModule(match[2]));
    }
    source = source.replace(/^import[\s\S]*?;\s*/gm, "").replace(/^export \{.*?\};/gm, "");
    const settings = new Map([["customizationJson", structuredClone(custom)], ["experienceRecovery", {}], ["levelingMode", "xp"], ["configKey", "CONFIG.DND5E"]]);
    const hooks = new Map();
    const notifications = [];
    const definitions = new Map();
    const context = {
        ...imports, console: { log() {}, error() {}, warn() {} }, structuredClone, HTMLElement: class {},
        FormApplication: class { constructor() {} },
        Hooks: { on(name, fn) { hooks.set(name, [...(hooks.get(name) ?? []), fn]); }, once(name, fn) { this.on(name, fn); } },
        CONFIG: { DND5E: { maxLevel: 20, epicBoonInterval: 30000, damageTypes: {}, abilities: { str: { label: "Strength", abbreviation: "STR" } }, weaponTypes: { simpleM: "Simple melee" }, alignments: { lg: "Lawful good" } } },
        game: { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, system: { id: "dnd5e" }, actors, scenes: [],
            settings: { settings: new Map([["dnd5e.levelingMode", {}]]), get(module, key) { return settings.get(key); },
                async set(module, key, value) { settings.set(key, structuredClone(value)); },
                register(module, key, definition) { definitions.set(key, definition); }, registerMenu() {} },
            i18n: { localize: value => value } },
        ui: { notifications: Object.fromEntries(["info", "warn", "error"].map(key => [key, message => notifications.push({ key, message })])) },
        foundry: { utils: { getProperty, setProperty, deepClone: structuredClone, mergeObject } },
        Color: { fromString: value => value },
        fromUuid: async uuid => actors.find(a => a.uuid === uuid),
        waitForReload: async () => {}, reloadCurrentClient() {}, confirmReloadAfterSave: async () => true,
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(source, context);
    vm.runInContext("onPostInit()", context);
    return { context, settings, hooks, notifications, definitions, run: code => vm.runInContext(code, context) };
}
module.exports = { root, MODULE_ID, loadModule, loadIndex, actor, getProperty, setProperty };
