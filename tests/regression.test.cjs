const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { root, MODULE_ID, loadModule, loadIndex, actor, getProperty } = require("./helpers.cjs");
const { verifyPackage } = require("./verify-package.cjs");

test("stale precision cache is ignored outside abstract scales and removed on migration", async () => {
    const pc = actor(300, 150);
    const app = await loadIndex({}, [pc]);
    assert.equal(await app.run('saveCustomizations({experience:{tableMode:"multiplier",multiplier:2}})'), true);
    assert.equal(pc.system.details.xp.value, 600);
    assert.equal(pc.getFlag(MODULE_ID, "experienceStandardValue"), undefined);
    assert.equal(await app.run('saveCustomizations({experience:{tableMode:"standard"}})'), true);
    assert.equal(pc.system.details.xp.value, 300);
});

test("points preserve precise XP through awards and repeated scale changes", async () => {
    const pc = actor(150);
    const app = await loadIndex({}, [pc]);
    await app.run('saveCustomizations({experience:{tableMode:"points",pointsPerLevel:5}})');
    assert.equal(pc.system.details.xp.value, 3);
    assert.equal(pc.getFlag(MODULE_ID, "experienceStandardValue"), 150);
    app.context.pc = pc;
    app.context.change = { "system.details.xp.value": 4 };
    app.run("scaleExternalExperienceUpdate(pc, change, {})");
    await pc.update(app.context.change);
    assert.equal(pc.system.details.xp.value, 3);
    assert.equal(pc.getFlag(MODULE_ID, "experienceStandardValue"), 151);
    await app.run('saveCustomizations({experience:{tableMode:"percent"}})');
    await app.run('saveCustomizations({})');
    assert.equal(pc.system.details.xp.value, 151);
    assert.equal(pc.getFlag(MODULE_ID, "experienceStandardValue"), undefined);
});

test("cache is persisted even when XP is unchanged after conversion", async () => {
    const pc = actor(0);
    const app = await loadIndex({}, [pc]);
    await app.run('saveCustomizations({experience:{tableMode:"points",pointsPerLevel:5}})');
    assert.equal(pc.getFlag(MODULE_ID, "experienceStandardValue"), 0);
});

test("null flags do not turn existing experience into zero", async () => {
    const pc = actor(3, null);
    const app = await loadIndex({ experience: { tableMode: "points", pointsPerLevel: 5 } }, [pc]);
    assert.equal(app.run("getStoredStandardExperience(game.actors[0])"), null);
    await app.run("saveCustomizations({})");
    assert.equal(pc.system.details.xp.value, 180);
});

test("abstract cache inconsistent with visible XP is not trusted", async () => {
    const pc = actor(4, 150);
    const app = await loadIndex({ experience: { tableMode: "points", pointsPerLevel: 5 } }, [pc]);
    await app.run("saveCustomizations({})");
    assert.equal(pc.system.details.xp.value, 240);
});

test("reset and import use the same XP migration as normal saving", async () => {
    const pc = actor(50, 150);
    const app = await loadIndex({ experience: { tableMode: "percent" } }, [pc]);
    app.context.Dialog = { confirm: async () => true };
    await app.run("new JsonEditorApp()._onReset({preventDefault(){}})");
    assert.equal(pc.system.details.xp.value, 150);
    app.context.Dialog = class { constructor(options) { app.context.dialog = options; } render() {} };
    app.context.renderTemplate = async () => "";
    app.context.readTextFromFile = async () => JSON.stringify({ experience: { tableMode: "percent" } });
    await app.run("new JsonEditorApp().importFromJson()");
    await app.context.dialog.buttons.import.callback({ find: () => [{ data: { files: ["settings.json"] } }] });
    assert.equal(pc.system.details.xp.value, 50);
    assert.equal(pc.getFlag(MODULE_ID, "experienceStandardValue"), 150);
});

test("a failure on the second actor restores all previously changed actors and flags", async () => {
    const one = actor(150), two = actor(90, undefined, "two");
    two.update = async () => { throw new Error("permission denied"); };
    const app = await loadIndex({}, [one, two]);
    assert.equal(await app.run('saveCustomizations({experience:{tableMode:"percent"}})'), false);
    assert.equal(one.system.details.xp.value, 150);
    assert.equal(one.getFlag(MODULE_ID, "experienceStandardValue"), undefined);
    assert.deepEqual(app.settings.get("customizationJson"), {});
    assert.equal(app.run("getRecoveryJournal()"), null);
});

test("settings failure restores actors and the independent leveling mode", async () => {
    const pc = actor(150);
    const app = await loadIndex({}, [pc]);
    const set = app.context.game.settings.set;
    let once = true;
    app.context.game.settings.set = async (module, key, value) => {
        if (key === "customizationJson" && once) { once = false; throw new Error("settings failure"); }
        return set(module, key, value);
    };
    assert.equal(await app.run('saveCustomizations({experience:{tableMode:"percent",levelingMode:"noxp"}})'), false);
    assert.equal(pc.system.details.xp.value, 150);
    assert.equal(app.settings.get("levelingMode"), "xp");
    assert.equal(app.run("getRecoveryJournal()"), null);
});

test("failed rollback keeps a durable journal; retry restores XP without double conversion", async () => {
    const pc = actor(150);
    const app = await loadIndex({}, [pc]);
    const update = pc.update;
    pc.update = async function(data) {
        if (data["system.details.xp.value"] === 150) throw new Error("offline");
        return update.call(this, data);
    };
    const set = app.context.game.settings.set;
    let once = true;
    app.context.game.settings.set = async (module, key, value) => {
        if (key === "customizationJson" && once) { once = false; throw new Error("offline"); }
        return set(module, key, value);
    };
    await app.run('saveCustomizations({experience:{tableMode:"percent"}})');
    assert.ok(app.settings.get("experienceRecovery"));
    assert.equal(pc.system.details.xp.value, 50);
    app.context.pc = pc;
    assert.equal(app.run('scaleExternalExperienceUpdate(pc, {"system.details.xp.value":51}, {})'), false);
    assert.equal(await app.run("saveCustomizations({})"), false);
    pc.update = update;
    await app.run('rollbackCustomization(getSetting("experienceRecovery"), transactionIO())');
    assert.equal(pc.system.details.xp.value, 150);
    assert.equal(app.run("getRecoveryJournal()"), null);
});

test("journal resumes recovery after client restart", async () => {
    const pc = actor(50, 150);
    const app = await loadIndex({ experience: { tableMode: "percent" } }, [pc]);
    app.settings.set("experienceRecovery", { customizations: {}, levelingMode: "xp", actors: [
        { uuid: pc.uuid, before: { xp: 150, flag: null }, after: { xp: 50, flag: 150 } },
    ] });
    await app.hooks.get("ready")[0]();
    assert.equal(pc.system.details.xp.value, 150);
    assert.deepEqual(app.settings.get("customizationJson"), {});
});

test("recovery refuses to overwrite independently changed XP", async () => {
    const pc = actor(70, 150);
    const app = await loadIndex({}, [pc]);
    app.context.journal = { customizations: {}, levelingMode: "xp", actors: [
        { uuid: pc.uuid, before: { xp: 150, flag: null }, after: { xp: 50, flag: 150 } },
    ] };
    app.settings.set("experienceRecovery", app.context.journal);
    await assert.rejects(app.run("rollbackCustomization(journal, transactionIO())"));
    assert.equal(pc.system.details.xp.value, 70);
    assert.ok(app.settings.get("experienceRecovery"));
});

test("synthetic token actors are included once; NPCs are untouched", async () => {
    const pc = actor(150), synthetic = actor(90, undefined, "token"), npc = actor(80, undefined, "npc");
    synthetic.uuid = "Scene.one.Token.one.Actor.one";
    npc.type = "npc";
    const app = await loadIndex({}, [pc, npc]);
    app.context.game.scenes = [{ tokens: [{ actorLink: true, actor: pc }, { actorLink: false, actor: synthetic }] }];
    app.context.fromUuid = async uuid => [pc, synthetic, npc].find(a => a.uuid === uuid);
    await app.run('saveCustomizations({experience:{tableMode:"percent"}})');
    assert.equal(pc.system.details.xp.value, 50);
    assert.equal(synthetic.system.details.xp.value, 30);
    assert.equal(npc.system.details.xp.value, 80);
});

test("non-active GM cannot start a competing save", async () => {
    const app = await loadIndex();
    app.context.game.users.activeGM.id = "other";
    assert.equal(await app.run("saveCustomizations({})"), false);
    assert.equal(app.run("getRecoveryJournal()"), null);
});

test("custom weapon and alignment edits persist, including visibility exceptions", async () => {
    const app = await loadIndex();
    app.context.html = { querySelectorAll: () => [{ dataset: { key: "custom" }, querySelector: selector => {
        if (selector.includes("allowedUsers")) return { value: "player" };
        if (selector.includes("hidden")) return { checked: true };
        return { value: "New name" };
    } }] };
    for (const category of ["weaponTypes", "alignments", "languages"]) {
        const result = app.run(`(()=>{const target={custom:{label:"Old name",_custom:true}};new JsonEditorApp()._mergeSimpleOverrides(html,{},"${category}","table",target);return target.custom;})()`);
        assert.equal(result.label, "New name");
        assert.equal(result.hidden, true);
        assert.equal(result.allowedUsers[0], "player");
    }
});

test("returning numeric/text fields to defaults removes old overrides", async () => {
    const app = await loadIndex({ maxAbilityScore: 30, initiativeFormula: "1d12", untouched: 123 });
    const fields = [
        { dataset: { key: "maxAbilityScore", original: "20" }, value: "20", type: "number" },
        { dataset: { key: "initiativeFormula", original: "" }, value: "", type: "text" },
    ];
    app.context.html = { querySelectorAll: selector => selector === ".sc-numeric-field" ? fields : [], querySelector: () => null };
    await app.run("(()=>{const app=new JsonEditorApp();app.element=[html];return app._updateObject({},{});})()");
    const saved = app.settings.get("customizationJson");
    assert.equal(saved.maxAbilityScore, undefined);
    assert.equal(saved.initiativeFormula, undefined);
    assert.equal(saved.untouched, 123);
});

test("runtime labels keep dnd5e string contracts and visibility stays in saved settings", async () => {
    const app = await loadIndex({ weaponTypes: { simpleM: { label: "Renamed", hidden: true }, custom: { label: "Custom", _custom: true } },
        alignments: { lg: { label: "Good", hidden: true } }, damageTypes: { new: { label: "New", _custom: true, hidden: true } } });
    assert.equal(app.context.CONFIG.DND5E.weaponTypes.simpleM, "Renamed");
    assert.equal(app.context.CONFIG.DND5E.weaponTypes.custom, "Custom");
    assert.equal(app.context.CONFIG.DND5E.alignments.lg, "Good");
    assert.equal(app.settings.get("customizationJson").damageTypes.new.hidden, true);
});

test("import rejects malformed data without touching actors", async () => {
    const { validateCustomizations } = await loadModule("scripts/customizations.js");
    for (const value of [null, [], { experience: [] }, { experience: { xpTable: "bad" } },
        { experience: { tableMode: "oops" } }, { skills: { a: { allowedUsers: "bad" } } },
        JSON.parse('{"__proto__":{"polluted":true}}')]) assert.throws(() => validateCustomizations(value));
    const pc = actor(150), app = await loadIndex({}, [pc]);
    assert.equal(await app.run('saveCustomizations({experience:{xpTable:"bad"}})'), false);
    assert.equal(pc.system.details.xp.value, 150);
});

test("nested languages and custom damage respect per-user visibility exceptions", async () => {
    const { hiddenEntries } = await loadModule("scripts/visibility.js");
    const custom = { languages: { standard: { children: { common: { hidden: true, allowedUsers: ["allowed"] } } } },
        damageTypes: { custom: { label: "Void", hidden: true, _custom: true } } };
    assert.deepEqual(hiddenEntries(custom, {}, "player").map(e => e.key), ["custom", "common"]);
    assert.deepEqual(hiddenEntries(custom, {}, "allowed").map(e => e.key), ["custom"]);
});

test("hiding a checked language preserves its control and checked value", async () => {
    const { hidePlayerCustomizations } = await loadModule("scripts/visibility.js");
    let hidden = false;
    const row = { style: { setProperty() { hidden = true; } } };
    const input = { checked: true, disabled: false, getAttribute: () => "system.traits.languages.value.common", closest: () => row, querySelectorAll: () => [] };
    const root = { matches: () => true, querySelectorAll: selector => selector === "[name]" ? [input] : [] };
    hidePlayerCustomizations({}, root, { languages: { standard: { children: { common: { hidden: true } } } } }, {}, "player", x => x);
    assert.equal(hidden, true);
    assert.equal(input.checked, true);
    assert.equal(input.disabled, false);
});

test("package validation follows imports and catches missing scripts", () => {
    assert.ok(verifyPackage(root) > 10);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "customizer-package-"));
    try {
        fs.copyFileSync(path.join(root, "module.json"), path.join(dir, "module.json"));
        fs.copyFileSync(path.join(root, "index.js"), path.join(dir, "index.js"));
        assert.throws(() => verifyPackage(dir), /Missing packaged file: scripts/);
    } finally {
        assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("other clients reload only after the completed transaction changes their configuration", async () => {
    const app = await loadIndex();
    let reloads = 0;
    app.context.game.ready = true;
    app.context.reloadCurrentClient = () => { reloads++; };
    const changed = app.definitions.get("experienceRecovery").onChange;
    await changed(null);
    assert.equal(reloads, 0);
    app.settings.set("customizationJson", { maxAbilityScore: 30 });
    await changed({ actors: [] });
    assert.equal(reloads, 0);
    await changed({});
    assert.equal(reloads, 1);
});

test("custom grouped language can be unhidden and renamed to its own key", async t => {
    const previous = globalThis.foundry;
    globalThis.foundry = { utils: { getProperty } };
    t.after(() => { globalThis.foundry = previous; });
    const { mergeLanguageGroupOverrides, buildLanguageSections } = await loadModule("scripts/languages.js");
    const original = { languages: { standard: { label: "Standard", children: { common: { label: "Common" } } } } };
    const existing = { languages: { standard: { children: { custom: { label: "Old", _custom: true, hidden: true, allowedUsers: ["one"] } } } } };
    const row = { dataset: { key: "custom" }, querySelector: selector => ({
        ".sc-language-label": { value: "custom" }, ".sc-hide-check": { checked: false }, ".sc-allowed-users": { value: "" },
    })[selector] };
    const section = { dataset: { group: "standard" }, querySelector: () => ({ value: "Standard" }), querySelectorAll: () => [row] };
    const result = mergeLanguageGroupOverrides({ querySelectorAll: () => [section] }, original, existing, s => s ? s.split(",") : [], s => s);
    assert.equal(result.standard.children.custom.label, "custom");
    assert.equal(result.standard.children.custom.hidden, false);
    assert.equal(result.standard.children.custom._custom, true);
    assert.ok(buildLanguageSections(original, { languages: result }, s => s).some(section => section.languages.some(row => row.key === "common")));
});
