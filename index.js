// ─────────────────────────────────────────────────────────────────────────────
// Русские подписи для всех категорий CONFIG.DND5E
// Редактируй здесь если хочешь изменить подсказки в интерфейсе
// ─────────────────────────────────────────────────────────────────────────────
const ABILITY_HINTS = {
    str: "Физическая мощь — атаки рукопашным, таскать грузы, ломать вещи",
    dex: "Скорость и точность — уклонение, стрельба, ловкость рук",
    con: "Здоровье и выносливость — хиты, концентрация заклинаний",
    int: "Память и логика — магия волшебника, история, расследование",
    wis: "Интуиция и внимание — восприятие, медицина, выживание",
    cha: "Сила личности — убеждение, обман, вдохновение",
};

const SKILL_HINTS = {
    acr: "Ловкость — кувырки, балансирование, сложные манёвры",
    ani: "Мудрость — успокоить животное, понять его намерения",
    arc: "Интеллект — знания о заклинаниях, артефактах, планах",
    ath: "Сила — карабкаться, плавать, прыгать, бороться",
    dec: "Харизма — ложь, полуправда, введение в заблуждение",
    his: "Интеллект — события прошлого, легенды, войны",
    ins: "Мудрость — понять мотивы, раскусить ложь",
    itm: "Харизма — запугать угрозами или агрессивным поведением",
    inv: "Интеллект — найти улики, изучить местность, разгадать тайники",
    med: "Мудрость — стабилизировать умирающего, диагностировать болезнь",
    nat: "Интеллект — растения, животные, климат, природные явления",
    prc: "Мудрость — заметить скрытое, услышать, почуять",
    prf: "Харизма — игра на инструменте, пение, актёрское мастерство",
    per: "Харизма — честно убедить кого-либо изменить своё мнение",
    rel: "Интеллект — боги, ритуалы, символы веры, нежить",
    slt: "Ловкость — карманные кражи, фокусы, скрыть предмет",
    ste: "Ловкость — двигаться незаметно, избежать обнаружения",
    sur: "Мудрость — следы, ориентирование, охота, укрытие в дикой природе",
};

// ─────────────────────────────────────────────────────────────────────────────
// Вспомогательные функции
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Читает текущие сохранённые кастомизации из настроек модуля.
 * Возвращает объект с полями abilities, skills, weaponTypes, alignments и т.д.
 */
function loadCustomizations() {
    return getSetting("customizationJson") ?? {};
}

/**
 * Локализует строку из CONFIG через game.i18n, с fallback на исходную строку.
 */
function loc(str) {
    if (!str) return "";
    try { return game.i18n.localize(str); } catch { return str; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Главный класс приложения
// ─────────────────────────────────────────────────────────────────────────────
class JsonEditorApp extends FormApplication {
    constructor() {
        super();
        // Здесь будут храниться изменения пока окно открыто
        this._pendingChanges = {};
    }

    static get APP_ID() {
        // Имя класса → kebab-case: "JsonEditorApp" → "json-editor-app"
        return this.name.split(/(?=[A-Z])/).join("-").toLowerCase();
    }

    get APP_ID() { return this.constructor.APP_ID; }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: this.APP_ID,
            // Шаблон — файл templates/json-editor-app.hbs (мы его тоже меняем)
            template: `modules/${MODULE_ID}/templates/${this.APP_ID}.hbs`,
            popOut: true,
            resizable: true,
            minimizable: true,
            width: 820,
            height: 640,
            tabs: [{ navSelector: ".sc-tabs", contentSelector: ".sc-content", initial: "abilities" }],
            title: "Настройка системы D&D 5e",
        });
    }

    // ── getData вызывается при каждом render() ────────────────────────────────
    // Здесь собираем всё что нужно шаблону
    async getData() {
        const cfg = ORIGINAL_SYSTEM_CONFIG;           // исходный CONFIG.DND5E (readonly)
        const custom = loadCustomizations();           // что сохранено в настройках модуля

        // Строим списки для каждой вкладки
        // Каждый элемент: { key, label, hint, abbr?, ability?, isCustom, hidden }
        const abilities = this._buildAbilityList(cfg, custom);
        const skills    = this._buildSkillList(cfg, custom);
        const weapons   = this._buildSimpleList(cfg, custom, "weaponTypes", "weaponIds");
        const armor     = this._buildSimpleList(cfg, custom, "armorTypes", "armorIds");
        const alignments = this._buildSimpleList(cfg, custom, "alignments", null);
        const damageTypes = this._buildSimpleList(cfg, custom, "damageTypes", null, true);
        const conditions  = this._buildSimpleList(cfg, custom, "conditionTypes", null, true);
        const languages   = this._buildSimpleList(cfg, custom, "languages", null, true);
        const currencies  = this._buildCurrencyList(cfg, custom);

        // Числовые параметры для вкладки "Числа"
        const numerics = [
            {
                key: "maxAbilityScore",
                label: "Максимум характеристики",
                hint: "До какого значения может вырасти любая характеристика (обычно 20)",
                value: custom.maxAbilityScore ?? cfg.maxAbilityScore ?? 20,
                original: cfg.maxAbilityScore ?? 20,
                type: "number",
            },
            {
                key: "maxLevel",
                label: "Максимальный уровень",
                hint: "Предел уровня персонажа (обычно 20)",
                value: custom.maxLevel ?? cfg.maxLevel ?? 20,
                original: cfg.maxLevel ?? 20,
                type: "number",
            },
            {
                key: "initiativeAbility",
                label: "Характеристика инициативы",
                hint: "Какая характеристика используется для броска инициативы (обычно dex)",
                value: custom.initiativeAbility ?? cfg.initiativeAbility ?? "dex",
                original: cfg.initiativeAbility ?? "dex",
                type: "text",
            },
            {
                key: "initiativeFormula",
                label: "Формула инициативы",
                hint: "Формула броска инициативы (обычно 1d20 — оставь пустым для стандартной)",
                value: custom.initiativeFormula ?? cfg.initiativeFormula ?? "",
                original: cfg.initiativeFormula ?? "",
                type: "text",
            },
            {
                key: "hitPointsAbility",
                label: "Характеристика хитов",
                hint: "Модификатор какой характеристики прибавляется к хитам (обычно con)",
                value: custom.hitPointsAbility ?? cfg.hitPointsAbility ?? "con",
                original: cfg.hitPointsAbility ?? "con",
                type: "text",
            },
        ];

        return {
            abilities, skills, weapons, armor,
            alignments, damageTypes, conditions, languages,
            currencies, numerics,
            hasCustomAbilities: abilities.some(a => a.isCustom),
            hasCustomSkills: skills.some(s => s.isCustom),
        };
    }

    // ── Построение списков ────────────────────────────────────────────────────

    _buildAbilityList(cfg, custom) {
        const result = [];
        const src = cfg.abilities ?? {};
        const overrides = custom.abilities ?? {};

        // Стандартные характеристики
        for (const [key, val] of Object.entries(src)) {
            const ov = overrides[key] ?? {};
            result.push({
                key,
                label: ov.label ?? loc(val.label) ?? key,
                abbr:  ov.abbreviation ?? loc(val.abbreviation) ?? key.toUpperCase().slice(0,3),
                hint:  ABILITY_HINTS[key] ?? "",
                isCustom: false,
                hidden: ov.hidden ?? false,
            });
        }

        // Пользовательские: ключи в overrides которых нет в стандартных
        for (const [key, val] of Object.entries(overrides)) {
            if (src[key]) continue;
            if (!val || typeof val !== "object") continue;
            result.push({
                key,
                label: val.label ?? key,
                abbr:  val.abbreviation ?? key.toUpperCase().slice(0,3),
                hint:  "",
                isCustom: true,
                hidden: val.hidden ?? false,
            });
        }

        return result;
    }

    _buildSkillList(cfg, custom) {
        const result = [];
        const src = cfg.skills ?? {};
        const overrides = custom.skills ?? {};

        for (const [key, val] of Object.entries(src)) {
            const ov = overrides[key] ?? {};
            result.push({
                key,
                label:   ov.label ?? loc(val.label) ?? key,
                ability: ov.ability ?? val.ability ?? "str",
                hint:    SKILL_HINTS[key] ?? "",
                isCustom: false,
                hidden: ov.hidden ?? false,
            });
        }

        // Пользовательские навыки: ключи в overrides которых нет в стандартных
        for (const [key, val] of Object.entries(overrides)) {
            if (src[key]) continue;
            if (!val || typeof val !== "object") continue;
            result.push({
                key,
                label:   val.label ?? key,
                ability: val.ability ?? "str",
                hint:    "",
                isCustom: true,
                hidden: val.hidden ?? false,
            });
        }

        return result;
    }

    _buildSimpleList(cfg, custom, cfgKey, altKey, hasLabel = false) {
        const src = cfg[cfgKey] ?? (altKey ? cfg[altKey] : null) ?? {};
        const result = [];
        const overrides = custom[cfgKey] ?? {};

        for (const [key, val] of Object.entries(src)) {
            const ov = overrides[key] ?? {};
            const rawLabel = hasLabel ? (val?.label ?? val) : (typeof val === "string" ? val : val?.label ?? key);
            result.push({
                key,
                label: ov.label ?? loc(rawLabel) ?? key,
                isCustom: false,
                hidden: ov.hidden ?? false,
            });
        }

        // Пользовательские: ключи в overrides которых нет в стандартных
        for (const [key, val] of Object.entries(overrides)) {
            if (src[key]) continue;
            const rawLabel = hasLabel ? (val?.label ?? val) : (typeof val === "string" ? val : val?.label ?? key);
            result.push({
                key,
                label: rawLabel ?? key,
                isCustom: true,
                hidden: false,
            });
        }

        return result;
    }

    _buildCurrencyList(cfg, custom) {
        const src = cfg.currencies ?? {};
        const overrides = custom.currencies ?? {};
        return Object.entries(src).map(([key, val]) => {
            const ov = overrides[key] ?? {};
            return {
                key,
                label: ov.label ?? loc(val.label) ?? key,
                abbr:  ov.abbreviation ?? loc(val.abbreviation) ?? key,
            };
        });
    }

    // ── Привязка событий ──────────────────────────────────────────────────────
    activateListeners(html) {
        super.activateListeners(html);
        html = html[0] ?? html;

        // Кнопки добавления новых строк
        html.querySelector("#sc-add-ability")?.addEventListener("click", () => this._addRow(html, "ability"));
        html.querySelector("#sc-add-skill")?.addEventListener("click",   () => this._addRow(html, "skill"));
        html.querySelector("#sc-add-weapon")?.addEventListener("click",  () => this._addRow(html, "weapon"));
        html.querySelector("#sc-add-alignment")?.addEventListener("click", () => this._addRow(html, "alignment"));
        html.querySelector("#sc-add-damage")?.addEventListener("click",  () => this._addRow(html, "damage"));
        html.querySelector("#sc-add-language")?.addEventListener("click",() => this._addRow(html, "language"));

        // Удаление строк (делегирование — кнопки будут добавляться динамически)
        html.addEventListener("click", (e) => {
            const btn = e.target.closest(".sc-delete-row");
            if (!btn) return;
            const row = btn.closest("tr");
            if (row) row.remove();
        });

        // Кнопка сброса
        html.querySelector("#sc-reset")?.addEventListener("click", this._onReset.bind(this));

        // Подсветка строки при наведении на hint-иконку
        html.querySelectorAll(".sc-hint").forEach(icon => {
            const hint = icon.dataset.hint;
            if (!hint) return;
            icon.addEventListener("mouseenter", () => {
                let tip = html.querySelector(".sc-tooltip");
                if (!tip) { tip = document.createElement("div"); tip.className = "sc-tooltip"; html.appendChild(tip); }
                const r = icon.getBoundingClientRect();
                const wr = html.getBoundingClientRect();
                tip.textContent = hint;
                tip.style.cssText = `position:absolute;top:${r.bottom - wr.top + 4}px;left:${r.left - wr.left}px;max-width:320px;background:#1a1a2e;color:#f0e6d2;font-size:11px;padding:6px 10px;border-radius:5px;border:1px solid rgba(255,215,0,0.3);z-index:999;pointer-events:none;line-height:1.5;`;
                tip.style.display = "block";
            });
            icon.addEventListener("mouseleave", () => {
                html.querySelector(".sc-tooltip")?.remove();
            });
        });
    }

    // ── Добавление новой строки в таблицу ────────────────────────────────────
    _addRow(html, type) {
        const templates = {
            ability: () => {
                const tbody = html.querySelector("#sc-table-abilities tbody");
                if (!tbody) return;
                const tr = document.createElement("tr");
                tr.dataset.custom = "true";
                tr.innerHTML = `
                    <td><input type="text" name="customAbilities[].key" placeholder="ключ (англ.)" style="width:80px"></td>
                    <td><input type="text" name="customAbilities[].label" placeholder="Название" style="width:140px"></td>
                    <td><input type="text" name="customAbilities[].abbr" placeholder="Сокр." style="width:60px"></td>
                    <td class="sc-td-center">—</td>
                    <td class="sc-td-center"><button type="button" class="sc-delete-row" title="Удалить"><i class="fas fa-trash"></i></button></td>`;
                tbody.appendChild(tr);
            },
            skill: () => {
                const tbody = html.querySelector("#sc-table-skills tbody");
                if (!tbody) return;
                const abilityOptions = ["str","dex","con","int","wis","cha"]
                    .map(a => `<option value="${a}">${a}</option>`).join("");
                const tr = document.createElement("tr");
                tr.dataset.custom = "true";
                tr.innerHTML = `
                    <td><input type="text" name="customSkills[].key" placeholder="ключ (англ.)" style="width:70px"></td>
                    <td><input type="text" name="customSkills[].label" placeholder="Название навыка" style="width:150px"></td>
                    <td><select name="customSkills[].ability" style="width:80px">${abilityOptions}</select></td>
                    <td class="sc-td-center">—</td>
                    <td class="sc-td-center"><button type="button" class="sc-delete-row" title="Удалить"><i class="fas fa-trash"></i></button></td>`;
                tbody.appendChild(tr);
            },
            weapon: () => {
                const tbody = html.querySelector("#sc-table-weapons tbody");
                if (!tbody) return;
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><input type="text" name="customWeapons[].key" placeholder="ключ" style="width:80px"></td>
                    <td><input type="text" name="customWeapons[].label" placeholder="Название" style="width:200px"></td>
                    <td class="sc-td-center"><button type="button" class="sc-delete-row" title="Удалить"><i class="fas fa-trash"></i></button></td>`;
                tbody.appendChild(tr);
            },
            alignment: () => {
                const tbody = html.querySelector("#sc-table-alignments tbody");
                if (!tbody) return;
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><input type="text" name="customAlignments[].key" placeholder="ключ" style="width:80px"></td>
                    <td><input type="text" name="customAlignments[].label" placeholder="Название" style="width:200px"></td>
                    <td class="sc-td-center"><button type="button" class="sc-delete-row" title="Удалить"><i class="fas fa-trash"></i></button></td>`;
                tbody.appendChild(tr);
            },
            damage: () => {
                const tbody = html.querySelector("#sc-table-damage tbody");
                if (!tbody) return;
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><input type="text" name="customDamage[].key" placeholder="ключ" style="width:80px"></td>
                    <td><input type="text" name="customDamage[].label" placeholder="Название" style="width:200px"></td>
                    <td class="sc-td-center"><button type="button" class="sc-delete-row" title="Удалить"><i class="fas fa-trash"></i></button></td>`;
                tbody.appendChild(tr);
            },
            language: () => {
                const tbody = html.querySelector("#sc-table-languages tbody");
                if (!tbody) return;
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><input type="text" name="customLanguages[].key" placeholder="ключ" style="width:80px"></td>
                    <td><input type="text" name="customLanguages[].label" placeholder="Название" style="width:200px"></td>
                    <td class="sc-td-center"><button type="button" class="sc-delete-row" title="Удалить"><i class="fas fa-trash"></i></button></td>`;
                tbody.appendChild(tr);
            },
        };
        templates[type]?.();
    }

    // ── Сохранение формы ──────────────────────────────────────────────────────
    // Вызывается когда пользователь нажимает "Сохранить изменения"
    async _updateObject(event, formData) {
        const html = this.element[0];
        const cfg = ORIGINAL_SYSTEM_CONFIG;
        const existing = loadCustomizations();

        // Собираем изменения по вкладке Характеристики
        const abilities = {};
        html.querySelectorAll("#sc-table-abilities tr[data-key]").forEach(row => {
            const key = row.dataset.key;
            const orig = cfg.abilities?.[key];
            if (!orig) return;
            const newLabel = row.querySelector(`input[name="abilities.${key}.label"]`)?.value?.trim();
            const newAbbr  = row.querySelector(`input[name="abilities.${key}.abbr"]`)?.value?.trim();
            const hidden   = row.querySelector(`input[name="abilities.${key}.hidden"]`)?.checked ?? false;
            const origLabel = loc(orig.label);
            const origAbbr  = loc(orig.abbreviation);
            const changed = (newLabel && newLabel !== origLabel) || (newAbbr && newAbbr !== origAbbr) || hidden;
            if (changed) abilities[key] = { label: newLabel || origLabel, abbreviation: newAbbr || origAbbr, hidden };
        });

        // Собираем изменения по вкладке Навыки
        const skills = {};
        html.querySelectorAll("#sc-table-skills tr[data-key]").forEach(row => {
            const key = row.dataset.key;
            const orig = cfg.skills?.[key];
            if (!orig) return;
            const newLabel   = row.querySelector(`input[name="skills.${key}.label"]`)?.value?.trim();
            const newAbility = row.querySelector(`select[name="skills.${key}.ability"]`)?.value;
            const hidden     = row.querySelector(`input[name="skills.${key}.hidden"]`)?.checked ?? false;
            const origLabel  = loc(orig.label);
            const changed = (newLabel && newLabel !== origLabel) || (newAbility && newAbility !== orig.ability) || hidden;
            if (changed) skills[key] = { label: newLabel || origLabel, ability: newAbility || orig.ability, hidden };
        });

        // Собираем изменения для переводов простых справочников
        const weaponTypes  = this._collectLabelOverrides(html, cfg, "weaponTypes",  "#sc-table-weapons");
        const alignments   = this._collectLabelOverrides(html, cfg, "alignments",   "#sc-table-alignments");
        const damageTypes  = this._collectLabelOverrides(html, cfg, "damageTypes",  "#sc-table-damage", true);
        const languages    = this._collectLabelOverrides(html, cfg, "languages",    "#sc-table-languages", true);
        const currencies   = this._collectCurrencyOverrides(html, cfg);

        // Числовые параметры
        const numerics = {};
        html.querySelectorAll(".sc-numeric-field").forEach(input => {
            const key = input.dataset.key;
            const val = input.type === "number" ? Number(input.value) : input.value?.trim();
            const orig = input.dataset.original;
            const origVal = input.type === "number" ? Number(orig) : orig;
            if (val !== origVal && val !== "" && val !== null) numerics[key] = val;
        });

        // ── Новые пользовательские записи ──────────────────────────────────────
        // ВАЖНО: складываем прямо в abilities/skills/etc — тогда main.js через
        // mergeObject автоматически добавит их в CONFIG.DND5E при загрузке.

        // Новые характеристики → в abilities.key = { label, abbreviation, type, ... }
        const customAbilities = this._collectCustomRows(html, "customAbilities[]", ["key","label","abbr"]);
        for (const a of customAbilities) {
            if (!a.key) continue;
            abilities[a.key] = {
                label: a.label || a.key,
                abbreviation: a.abbr || a.key.slice(0,3).toUpperCase(),
                type: "Number",
                improvement: true,
                _custom: true,  // маркер что это наша запись
            };
        }

        // Новые навыки → в skills.key = { label, ability }
        const customSkills = this._collectCustomRows(html, "customSkills[]", ["key","label","ability"]);
        for (const s of customSkills) {
            if (!s.key) continue;
            skills[s.key] = {
                label: s.label || s.key,
                ability: s.ability || "str",
                _custom: true,
            };
        }

        // Новые типы оружия → в weaponTypes.key
        const customWeapons = this._collectCustomRows(html, "customWeapons[]", ["key","label"]);
        for (const w of customWeapons) {
            if (!w.key) continue;
            weaponTypes[w.key] = w.label || w.key;
        }

        // Новые мировоззрения → в alignments.key
        const customAlignments = this._collectCustomRows(html, "customAlignments[]", ["key","label"]);
        for (const a of customAlignments) {
            if (!a.key) continue;
            alignments[a.key] = a.label || a.key;
        }

        // Новые типы урона → в damageTypes.key
        const customDamage = this._collectCustomRows(html, "customDamage[]", ["key","label"]);
        for (const d of customDamage) {
            if (!d.key) continue;
            damageTypes[d.key] = { label: d.label || d.key, _custom: true };
        }

        // Новые языки → в languages.key
        const customLanguages = this._collectCustomRows(html, "customLanguages[]", ["key","label"]);
        for (const l of customLanguages) {
            if (!l.key) continue;
            languages[l.key] = { label: l.label || l.key, _custom: true };
        }

        // ── Финальный объект кастомизаций ───────────────────────────────────────
        // Структура плоская — mergeObject в main.js применит всё к CONFIG.DND5E
        const result = {
            ...existing,
            ...(Object.keys(abilities).length   && { abilities }),
            ...(Object.keys(skills).length      && { skills }),
            ...(Object.keys(weaponTypes).length && { weaponTypes }),
            ...(Object.keys(alignments).length  && { alignments }),
            ...(Object.keys(damageTypes).length && { damageTypes }),
            ...(Object.keys(languages).length   && { languages }),
            ...(Object.keys(currencies).length  && { currencies }),
            ...numerics,
        };

        console.log(`[${MODULE_ID}] Saving customizations:`, result);
        await setSetting("customizationJson", result);

        ui.notifications.info("Настройки системы сохранены. Перезагрузите страницу для полного применения.");
    }

    _collectLabelOverrides(html, cfg, cfgKey, tableSelector, hasLabelProp = false) {
        const result = {};
        const src = cfg[cfgKey] ?? {};
        html.querySelectorAll(`${tableSelector} tr[data-key]`).forEach(row => {
            const key = row.dataset.key;
            const orig = src[key];
            if (!orig) return;
            const newLabel = row.querySelector(`input[name="${cfgKey}.${key}.label"]`)?.value?.trim();
            const origLabel = loc(hasLabelProp ? (orig?.label ?? orig) : (typeof orig === "string" ? orig : orig?.label ?? key));
            const hidden = row.querySelector(`input[name="${cfgKey}.${key}.hidden"]`)?.checked ?? false;
            if ((newLabel && newLabel !== origLabel) || hidden) result[key] = { label: newLabel || origLabel, hidden };
        });
        return result;
    }

    _collectCurrencyOverrides(html, cfg) {
        const result = {};
        const src = cfg.currencies ?? {};
        html.querySelectorAll("#sc-table-currencies tr[data-key]").forEach(row => {
            const key = row.dataset.key;
            const orig = src[key];
            if (!orig) return;
            const newLabel = row.querySelector(`input[name="currencies.${key}.label"]`)?.value?.trim();
            const newAbbr  = row.querySelector(`input[name="currencies.${key}.abbr"]`)?.value?.trim();
            const origLabel = loc(orig.label);
            const origAbbr  = loc(orig.abbreviation);
            if ((newLabel && newLabel !== origLabel) || (newAbbr && newAbbr !== origAbbr))
                result[key] = { label: newLabel || origLabel, abbreviation: newAbbr || origAbbr };
        });
        return result;
    }

    _collectCustomRows(html, namePrefix, fields) {
        const result = [];
        const selector = `input[name^="${namePrefix}"], select[name^="${namePrefix}"]`;
        // Группируем по строке
        const rows = new Set();
        html.querySelectorAll(selector).forEach(el => rows.add(el.closest("tr")));
        for (const row of rows) {
            if (!row) continue;
            const obj = {};
            let hasKey = false;
            for (const field of fields) {
                const el = row.querySelector(`[name="${namePrefix}.${field}"], [name="${namePrefix}[].${field}"]`);
                if (el) { obj[field] = el.value?.trim(); if (field === "key" && obj[field]) hasKey = true; }
            }
            if (hasKey) result.push(obj);
        }
        return result;
    }

    // ── Сброс настроек ────────────────────────────────────────────────────────
    async _onReset(event) {
        event.preventDefault();
        const confirmed = await Dialog.confirm({
            title: "Сбросить все настройки системы?",
            content: "<p>Все ваши изменения названий, добавленные характеристики и навыки будут удалены. Система вернётся к стандартным значениям D&D 5e.</p>",
            yes: () => true,
            no: () => false,
            defaultYes: false,
        });
        if (!confirmed) return;
        await setSetting("customizationJson", {});
        ui.notifications.info("Настройки сброшены. Перезагрузите страницу.");
        this.close();
    }

    // ── Экспорт / импорт (кнопки в заголовке окна) ───────────────────────────
    async ExportToJson() {
        const data = getSetting("customizationJson");
        saveDataToFile(JSON.stringify(data, null, 2), "text/json", `system-customization.json`);
        ui.notifications.info("Файл настроек экспортирован.");
    }

    async importFromJson() {
        new Dialog({
            title: "Импорт настроек системы",
            content: await renderTemplate("templates/apps/import-data.hbs", {
                hint1: "Выберите JSON-файл с настройками системы.",
                hint2: "Файл должен быть экспортирован из этого же модуля.",
            }),
            buttons: {
                import: {
                    icon: '<i class="fas fa-file-import"></i>',
                    label: "Импортировать",
                    callback: (html) => {
                        const form = html.find("form")[0];
                        if (!form.data.files.length) return ui.notifications.error("Файл не выбран!");
                        readTextFromFile(form.data.files[0]).then((json) => {
                            setSetting("customizationJson", JSON.parse(json));
                            ui.notifications.info("Настройки импортированы. Перезагрузите страницу.");
                            this.close();
                        });
                    },
                },
                no: { icon: '<i class="fas fa-times"></i>', label: "Отмена" },
            },
            default: "import",
        }, { width: 400 }).render(true);
    }

    _getHeaderButtons() {
        return [
            {
                label: "Экспорт",
                class: "export",
                icon: "fas fa-file-export",
                onclick: this.ExportToJson.bind(this),
            },
            {
                label: "Импорт",
                class: "import",
                icon: "fas fa-file-import",
                onclick: this.importFromJson.bind(this),
            },
            ...super._getHeaderButtons(),
        ];
    }
}

function registerSettings() {
    const SYSTEM_ID       = game.system.id.toUpperCase();
    const defaultConfigKey = CONFIG[SYSTEM_ID]
        ? `CONFIG.${SYSTEM_ID}`
        : `CONFIG.${game.system.id}`;

    const settings = {
        customizationJson: {
            scope:   "world",
            config:  false,
            type:    Object,
            default: {},
        },
        configKey: {
            name:    `${MODULE_ID}.settings.configKey.name`,
            hint:    `${MODULE_ID}.settings.configKey.hint`,
            scope:   "world",
            config:  true,
            type:    String,
            default: defaultConfigKey,
        },
    };

    registerSettingsArray(settings);

    // ── Main menu button ─────────────────────────────────────────────────
    game.settings.registerMenu(MODULE_ID, "CustomizerApp", {
        name:       game.i18n.localize(`${MODULE_ID}.settings.jsonEditor.name`),
        label:      game.i18n.localize(`${MODULE_ID}.settings.jsonEditor.label`),
        hint:       game.i18n.localize(`${MODULE_ID}.settings.jsonEditor.hint`),
        icon:       "fas fa-cogs",
        scope:      "world",
        restricted: true,
        type:       JsonEditorApp,
    });

    // ── Warning banner ───────────────────────────────────────────────────
    Hooks.on("renderSettingsConfig", (app, html) => {
        html = html[0] ?? html;
        const btn = html.querySelector('button[data-key="dnd5e-system-customizer.CustomizerApp"]');
        if (!btn) return;
        const pWarn = document.createElement("p");
        pWarn.classList.add("notification", "warning");
        pWarn.innerHTML = game.i18n.localize(`${MODULE_ID}.settings.jsonEditor.warn`);
        btn.closest(".form-group")?.querySelector(".notes")?.after(pWarn);
    });
}

function getSetting(key) {
    return game.settings.get(MODULE_ID, key);
}

async function setSetting(key, value) {
    return await game.settings.set(MODULE_ID, key, value);
}

function registerSettingsArray(settings) {
    for (const [key, value] of Object.entries(settings)) {
        game.settings.register(MODULE_ID, key, value);
    }
}

const MODULE_ID = "dnd5e-system-customizer";

let ORIGINAL_CONFIG = {};

let ORIGINAL_SYSTEM_CONFIG = {};

Hooks.on("init", () => {
    onPostInit();
});

function onPostInit() {
    registerSettings();
    const configKey = getSetting("configKey");
    const systemConfig = foundry.utils.getProperty(window, configKey);
    if (systemConfig) {
        ORIGINAL_SYSTEM_CONFIG = foundry.utils.deepClone(systemConfig);
        delete ORIGINAL_SYSTEM_CONFIG.trackableAttributes;
    } else {        
        Hooks.once("ready", () => {
            ui.notifications.warn("dnd5e-system-customizer.noConfig", { permanent: true, localize: true });
        });
        return;
    }

    const ORIGINAL_TRACKABLE_ATTRIBUTES = [...(systemConfig.trackableAttributes ?? [])];

    const merged = foundry.utils.mergeObject(systemConfig, foundry.utils.deepClone(getSetting("customizationJson") ?? {}));
    if (merged.trackableAttributes) merged.trackableAttributes = ORIGINAL_TRACKABLE_ATTRIBUTES;
    deleteKeys(merged);
}

function deleteKeys(obj) {

    if(!obj) return;
    //crawl the object recursively and delete the object if it has the "unsafelyDelete": true property
    const isObject = typeof obj === 'object' && !Array.isArray(obj) && obj !== null;
    const isArray = Array.isArray(obj);
    if (!isObject && !isArray) return;
    
    if (isObject) {
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if(val?.unsafelyDelete) delete obj[key];
            else deleteKeys(val);
        }
    }else if(isArray){
        for(const val of obj){
            deleteKeys(val);
        }
    }
}

export { MODULE_ID, ORIGINAL_CONFIG, ORIGINAL_SYSTEM_CONFIG };
