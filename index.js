// ─────────────────────────────────────────────────────────────────────────────
// Русские подписи для всех категорий CONFIG.DND5E
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

// Дефолтная иконка для кастомных типов урона
// (берём реально существующую в dnd5e иконку)
const DEFAULT_DAMAGE_ICON  = "systems/dnd5e/icons/svg/damage/bludgeoning.svg";
const DEFAULT_DAMAGE_COLOR = "#888888";

// ─────────────────────────────────────────────────────────────────────────────
// Вспомогательные функции
// ─────────────────────────────────────────────────────────────────────────────
function loadCustomizations() {
    return getSetting("customizationJson") ?? {};
}

function loc(str) {
    if (!str) return "";
    try { return game.i18n.localize(str); } catch { return str; }
}

function getAllAbilityKeys() {
    const standard = Object.keys(ORIGINAL_SYSTEM_CONFIG.abilities ?? {});
    const custom   = Object.keys(loadCustomizations().abilities ?? {}).filter(k => !standard.includes(k));
    return [...standard, ...custom];
}

/**
 * Проверяет что ключ состоит только из латинских букв, цифр и дефиса/подчёркивания.
 * Возвращает { valid: bool, reason: string }
 */
function validateKey(key, existingKeys = []) {
    if (!key || !key.trim()) return { valid: false, reason: "Ключ не может быть пустым" };
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key))
        return { valid: false, reason: `"${key}" — только латиница, цифры, _ и -. Без пробелов и кириллицы` };
    if (existingKeys.includes(key))
        return { valid: false, reason: `Ключ "${key}" уже существует` };
    return { valid: true };
}

/**
 * Собирает все ключи видимых в таблице строк (data-key атрибут).
 * Используется чтобы определить какие кастомные записи были удалены из DOM.
 */
function getDomKeys(html, tableSelector) {
    const keys = new Set();
    html.querySelectorAll(`${tableSelector} tr[data-key]`).forEach(row => keys.add(row.dataset.key));
    return keys;
}

// ─────────────────────────────────────────────────────────────────────────────
// Строит правильный объект для damageTypes совместимый с dnd5e 5.x
// DamagesConfig._processChoice делает icon.endsWith(".svg") — icon обязан быть строкой
// ─────────────────────────────────────────────────────────────────────────────
function buildDamageTypeEntry(label, icon, color) {
    return {
        label:      label || "Custom",
        icon:       (icon && icon.trim()) ? icon.trim() : DEFAULT_DAMAGE_ICON,
        color:      Color.fromString(color || DEFAULT_DAMAGE_COLOR),
        isPhysical: false,
        _custom:    true,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Открывает FilePicker Foundry и возвращает выбранный путь
// ─────────────────────────────────────────────────────────────────────────────
function openFilePicker(currentPath, onSelect) {
    new FilePicker({
        type: "imagevideo",
        current: currentPath || "systems/dnd5e/icons/svg/damage/",
        callback: (path) => onSelect(path),
    }).render(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Главный класс приложения
// ─────────────────────────────────────────────────────────────────────────────
class JsonEditorApp extends FormApplication {
    constructor() {
        super();
        this._pendingChanges = {};
    }

    static get APP_ID() {
        return this.name.split(/(?=[A-Z])/).join("-").toLowerCase();
    }

    get APP_ID() { return this.constructor.APP_ID; }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: this.APP_ID,
            template: `modules/${MODULE_ID}/templates/${this.APP_ID}.hbs`,
            popOut: true,
            resizable: true,
            minimizable: true,
            width: 860,
            height: 640,
            tabs: [{ navSelector: ".sc-tabs", contentSelector: ".sc-content", initial: "abilities" }],
            title: "Настройка системы D&D 5e",
        });
    }

    async getData() {
        const cfg    = ORIGINAL_SYSTEM_CONFIG;
        const custom = loadCustomizations();

        const abilities   = this._buildAbilityList(cfg, custom);
        const skills      = this._buildSkillList(cfg, custom);
        const weapons     = this._buildSimpleList(cfg, custom, "weaponTypes", "weaponIds");
        const armor       = this._buildSimpleList(cfg, custom, "armorTypes", "armorIds");
        const alignments  = this._buildSimpleList(cfg, custom, "alignments", null);
        const damageTypes = this._buildDamageList(cfg, custom);
        const conditions  = this._buildSimpleList(cfg, custom, "conditionTypes", null, true);
        const languages   = this._buildSimpleList(cfg, custom, "languages", null, true);
        const currencies  = this._buildCurrencyList(cfg, custom);

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
            allAbilityKeys: getAllAbilityKeys(),
            hasCustomAbilities: abilities.some(a => a.isCustom),
            hasCustomSkills: skills.some(s => s.isCustom),
        };
    }

    // ── Построение списков ────────────────────────────────────────────────────

    _buildAbilityList(cfg, custom) {
        const result    = [];
        const src       = cfg.abilities ?? {};
        const overrides = custom.abilities ?? {};

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
        const result    = [];
        const src       = cfg.skills ?? {};
        const overrides = custom.skills ?? {};

        const allKeys = getAllAbilityKeys();
        for (const [key, val] of Object.entries(src)) {
            const ov = overrides[key] ?? {};
            const currentAbility = ov.ability ?? val.ability ?? "str";
            result.push({
                key,
                label:   ov.label ?? loc(val.label) ?? key,
                ability: currentAbility,
                hint:    SKILL_HINTS[key] ?? "",
                isCustom: false,
                hidden: ov.hidden ?? false,
                // Передаём список характеристик с флагом selected для шаблона
                abilityOptions: allKeys.map(a => ({ key: a, selected: a === currentAbility })),
            });
        }
        for (const [key, val] of Object.entries(overrides)) {
            if (src[key]) continue;
            if (!val || typeof val !== "object") continue;
            const currentAbility = val.ability ?? "str";
            result.push({
                key,
                label:   val.label ?? key,
                ability: currentAbility,
                hint:    "",
                isCustom: true,
                hidden: val.hidden ?? false,
                abilityOptions: allKeys.map(a => ({ key: a, selected: a === currentAbility })),
            });
        }
        return result;
    }

    // Специальный метод для типов урона — с полями icon и color
    _buildDamageList(cfg, custom) {
        const result    = [];
        const src       = cfg.damageTypes ?? {};
        const overrides = custom.damageTypes ?? {};

        for (const [key, val] of Object.entries(src)) {
            const ov = overrides[key] ?? {};
            result.push({
                key,
                label:    ov.label ?? loc(val.label) ?? key,
                icon:     ov.icon  ?? val.icon  ?? DEFAULT_DAMAGE_ICON,
                isCustom: false,
                hidden:   ov.hidden ?? false,
            });
        }
        // Кастомные (которых нет в стандартных)
        for (const [key, val] of Object.entries(overrides)) {
            if (src[key]) continue;
            if (!val || typeof val !== "object") continue;
            result.push({
                key,
                label:    val.label ?? key,
                icon:     val.icon  ?? DEFAULT_DAMAGE_ICON,
                isCustom: true,
                hidden:   false,
            });
        }
        return result;
    }

    _buildSimpleList(cfg, custom, cfgKey, altKey, hasLabel = false) {
        const src       = cfg[cfgKey] ?? (altKey ? cfg[altKey] : null) ?? {};
        const result    = [];
        const overrides = custom[cfgKey] ?? {};

        for (const [key, val] of Object.entries(src)) {
            const ov       = overrides[key] ?? {};
            const rawLabel = hasLabel ? (val?.label ?? val) : (typeof val === "string" ? val : val?.label ?? key);
            result.push({
                key,
                label: ov.label ?? loc(rawLabel) ?? key,
                isCustom: false,
                hidden: ov.hidden ?? false,
            });
        }
        for (const [key, val] of Object.entries(overrides)) {
            if (src[key]) continue;
            const rawLabel = hasLabel ? (val?.label ?? val) : (typeof val === "string" ? val : val?.label ?? key);
            result.push({ key, label: rawLabel ?? key, isCustom: true, hidden: false });
        }
        return result;
    }

    _buildCurrencyList(cfg, custom) {
        const src       = cfg.currencies ?? {};
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

        html.querySelector("#sc-add-ability")?.addEventListener("click",   () => this._addRow(html, "ability"));
        html.querySelector("#sc-add-skill")?.addEventListener("click",     () => this._addRow(html, "skill"));
        html.querySelector("#sc-add-weapon")?.addEventListener("click",    () => this._addRow(html, "weapon"));
        html.querySelector("#sc-add-alignment")?.addEventListener("click", () => this._addRow(html, "alignment"));
        html.querySelector("#sc-add-damage")?.addEventListener("click",    () => this._addRow(html, "damage"));
        html.querySelector("#sc-add-language")?.addEventListener("click",  () => this._addRow(html, "language"));

        // Удаление строк
        html.addEventListener("click", (e) => {
            const btn = e.target.closest(".sc-delete-row");
            if (!btn) return;
            btn.closest("tr")?.remove();
        });

        // Live-валидация полей ключа — показываем инлайн-ошибку сразу при вводе
        html.addEventListener("input", (e) => {
            const input = e.target;
            if (!input.name?.includes("[].key")) return;
            const val = input.value.trim();
            if (!val) { this._showKeyError(input, null); return; }
            const valid = /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(val);
            if (valid) {
                this._showKeyError(input, null);
                input.style.borderColor = "rgba(76,175,80,0.6)";
                input.style.boxShadow   = "0 0 4px rgba(76,175,80,0.3)";
            } else {
                this._showKeyError(input, "Только латиница, цифры, _ и -. Без пробелов и кириллицы.");
            }
        });

        // Кнопки выбора иконки через FilePicker (делегирование — кнопки добавляются динамически)
        html.addEventListener("click", (e) => {
            const btn = e.target.closest(".sc-pick-icon");
            if (!btn) return;
            const row     = btn.closest("tr");
            const input   = row?.querySelector(".sc-icon-path");
            const preview = row?.querySelector(".sc-icon-preview");
            if (!input) return;
            openFilePicker(input.value, (path) => {
                input.value = path;
                if (preview) {
                    preview.src   = path;
                    preview.style.display = "inline";
                }
            });
        });

        // Сброс
        html.querySelector("#sc-reset")?.addEventListener("click", this._onReset.bind(this));

        // Подсказки
        html.querySelectorAll(".sc-hint").forEach(icon => {
            const hint = icon.dataset.hint;
            if (!hint) return;
            icon.addEventListener("mouseenter", () => {
                let tip = html.querySelector(".sc-tooltip");
                if (!tip) { tip = document.createElement("div"); tip.className = "sc-tooltip"; html.appendChild(tip); }
                const r  = icon.getBoundingClientRect();
                const wr = html.getBoundingClientRect();
                tip.textContent = hint;
                tip.style.cssText = `position:absolute;top:${r.bottom - wr.top + 4}px;left:${r.left - wr.left}px;max-width:320px;background:#1a1a2e;color:#f0e6d2;font-size:11px;padding:6px 10px;border-radius:5px;border:1px solid rgba(255,215,0,0.3);z-index:999;pointer-events:none;line-height:1.5;`;
                tip.style.display = "block";
            });
            icon.addEventListener("mouseleave", () => html.querySelector(".sc-tooltip")?.remove());
        });
    }

    // ── Добавление новой строки ───────────────────────────────────────────────
    _addRow(html, type) {
        const abilityOptions = getAllAbilityKeys()
            .map(a => `<option value="${a}">${a}</option>`)
            .join("");

        const templates = {
            ability: () => {
                const tbody = html.querySelector("#sc-table-abilities tbody");
                if (!tbody) return;
                const tr = document.createElement("tr");
                tr.dataset.custom = "true";
                tr.innerHTML = `
                    <td><input type="text" name="customAbilities[].key"   placeholder="ключ (англ.)" style="width:80px"></td>
                    <td><input type="text" name="customAbilities[].label" placeholder="Название"     style="width:140px"></td>
                    <td><input type="text" name="customAbilities[].abbr"  placeholder="Сокр."        style="width:60px"></td>
                    <td class="sc-td-center">—</td>
                    <td class="sc-td-center"><button type="button" class="sc-delete-row" title="Удалить"><i class="fas fa-trash"></i></button></td>`;
                tbody.appendChild(tr);
            },
            skill: () => {
                const tbody = html.querySelector("#sc-table-skills tbody");
                if (!tbody) return;
                const tr = document.createElement("tr");
                tr.dataset.custom = "true";
                tr.innerHTML = `
                    <td><input type="text" name="customSkills[].key"     placeholder="ключ (англ.)"    style="width:70px"></td>
                    <td><input type="text" name="customSkills[].label"   placeholder="Название навыка" style="width:150px"></td>
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
                    <td><input type="text" name="customWeapons[].key"   placeholder="ключ"    style="width:80px"></td>
                    <td><input type="text" name="customWeapons[].label" placeholder="Название" style="width:200px"></td>
                    <td class="sc-td-center"><button type="button" class="sc-delete-row" title="Удалить"><i class="fas fa-trash"></i></button></td>`;
                tbody.appendChild(tr);
            },
            alignment: () => {
                const tbody = html.querySelector("#sc-table-alignments tbody");
                if (!tbody) return;
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><input type="text" name="customAlignments[].key"   placeholder="ключ"    style="width:80px"></td>
                    <td><input type="text" name="customAlignments[].label" placeholder="Название" style="width:200px"></td>
                    <td class="sc-td-center"><button type="button" class="sc-delete-row" title="Удалить"><i class="fas fa-trash"></i></button></td>`;
                tbody.appendChild(tr);
            },
            damage: () => {
                const tbody = html.querySelector("#sc-table-damage tbody");
                if (!tbody) return;
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><input type="text" name="customDamage[].key"   placeholder="ключ" style="width:70px"></td>
                    <td><input type="text" name="customDamage[].label" placeholder="Название" style="width:130px"></td>
                    <td class="sc-icon-cell">
                      <div class="sc-icon-row">
                        <img class="sc-icon-preview" src="${DEFAULT_DAMAGE_ICON}" title="${DEFAULT_DAMAGE_ICON}">
                        <input type="hidden" name="customDamage[].icon" class="sc-icon-path" value="${DEFAULT_DAMAGE_ICON}">
                        <button type="button" class="sc-pick-icon" title="Выбрать иконку">
                          <i class="fas fa-image"></i>
                        </button>
                      </div>
                    </td>
                    <td class="sc-td-center"><button type="button" class="sc-delete-row" title="Удалить"><i class="fas fa-trash"></i></button></td>`;
                tbody.appendChild(tr);
            },
            language: () => {
                const tbody = html.querySelector("#sc-table-languages tbody");
                if (!tbody) return;
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><input type="text" name="customLanguages[].key"   placeholder="ключ"    style="width:80px"></td>
                    <td><input type="text" name="customLanguages[].label" placeholder="Название" style="width:200px"></td>
                    <td class="sc-td-center"><button type="button" class="sc-delete-row" title="Удалить"><i class="fas fa-trash"></i></button></td>`;
                tbody.appendChild(tr);
            },
        };
        templates[type]?.();
    }

    // ── Сохранение формы ──────────────────────────────────────────────────────
    async _updateObject(event, formData) {
        const html     = this.element[0];
        const cfg      = ORIGINAL_SYSTEM_CONFIG;
        const existing = loadCustomizations();

        // Начинаем с уже сохранённых данных — новые дополняют, не стирают
        const abilities = foundry.utils.deepClone(existing.abilities ?? {});
        html.querySelectorAll("#sc-table-abilities tr[data-key]").forEach(row => {
            const key     = row.dataset.key;
            const orig    = cfg.abilities?.[key];
            const isCustom = !orig;
            const newLabel  = row.querySelector(`input[name="abilities.${key}.label"]`)?.value?.trim();
            const newAbbr   = row.querySelector(`input[name="abilities.${key}.abbr"]`)?.value?.trim();
            const hidden    = row.querySelector(`input[name="abilities.${key}.hidden"]`)?.checked ?? false;
            if (isCustom) {
                // Кастомная характеристика — сохраняем любые изменения
                if (newLabel || newAbbr) {
                    abilities[key] = {
                        ...(abilities[key] ?? {}),
                        label:        newLabel || abilities[key]?.label || key,
                        abbreviation: newAbbr  || abilities[key]?.abbreviation || key.slice(0,3).toUpperCase(),
                        hidden,
                        _custom: true,
                    };
                }
                return;
            }
            const origLabel = loc(orig.label);
            const origAbbr  = loc(orig.abbreviation);
            const changed = (newLabel && newLabel !== origLabel) || (newAbbr && newAbbr !== origAbbr) || hidden;
            if (changed) abilities[key] = { label: newLabel || origLabel, abbreviation: newAbbr || origAbbr, hidden };
            else delete abilities[key];
        });
        // Удаляем кастомные записи которые пользователь убрал из таблицы
        const domAbilityKeys = getDomKeys(html, "#sc-table-abilities");
        for (const key of Object.keys(abilities)) {
            if (abilities[key]?._custom && !domAbilityKeys.has(key)) delete abilities[key];
        }

        const skills = foundry.utils.deepClone(existing.skills ?? {});
        html.querySelectorAll("#sc-table-skills tr[data-key]").forEach(row => {
            const key      = row.dataset.key;
            const orig     = cfg.skills?.[key];
            const isCustom = !orig;
            const newLabel   = row.querySelector(`input[name="skills.${key}.label"]`)?.value?.trim();
            const newAbility = row.querySelector(`select[name="skills.${key}.ability"]`)?.value;
            const hidden     = row.querySelector(`input[name="skills.${key}.hidden"]`)?.checked ?? false;
            if (isCustom) {
                // Кастомный навык — всегда сохраняем актуальные значения из формы
                skills[key] = {
                    ...(skills[key] ?? {}),
                    label:   newLabel   || skills[key]?.label   || key,
                    ability: newAbility || skills[key]?.ability || "str",
                    hidden,
                    _custom: true,
                };
                return;
            }
            const origLabel = loc(orig.label);
            const changed = (newLabel && newLabel !== origLabel) || (newAbility && newAbility !== orig.ability) || hidden;
            if (changed) skills[key] = { label: newLabel || origLabel, ability: newAbility || orig.ability, hidden };
            else delete skills[key];
        });
        // Удаляем кастомные навыки убранные из таблицы
        const domSkillKeys = getDomKeys(html, "#sc-table-skills");
        for (const key of Object.keys(skills)) {
            if (skills[key]?._custom && !domSkillKeys.has(key)) delete skills[key];
        }

        const weaponTypes = foundry.utils.deepClone(existing.weaponTypes ?? {});
        this._mergeSimpleOverrides(html, cfg, "weaponTypes", "#sc-table-weapons", weaponTypes);

        const alignments = foundry.utils.deepClone(existing.alignments ?? {});
        this._mergeSimpleOverrides(html, cfg, "alignments", "#sc-table-alignments", alignments);

        // Типы урона — обновляем label и icon для всех записей (стандартных и кастомных)
        const damageTypes = foundry.utils.deepClone(existing.damageTypes ?? {});
        html.querySelectorAll("#sc-table-damage tr[data-key]").forEach(row => {
            const key      = row.dataset.key;
            const srcVal   = cfg.damageTypes?.[key];
            const isCustom = !srcVal;
            const newLabel = row.querySelector(`input[name="damageTypes.${key}.label"]`)?.value?.trim();
            const newIcon  = row.querySelector(`input[name="damageTypes.${key}.icon"]`)?.value?.trim();
            const hidden   = row.querySelector(`input[name="damageTypes.${key}.hidden"]`)?.checked ?? false;
            if (isCustom) {
                // Кастомный тип урона — сохраняем актуальные значения, icon обязателен
                damageTypes[key] = {
                    ...(damageTypes[key] ?? {}),
                    label:      newLabel || damageTypes[key]?.label || key,
                    icon:       newIcon  || damageTypes[key]?.icon  || DEFAULT_DAMAGE_ICON,
                    color:      damageTypes[key]?.color || DEFAULT_DAMAGE_COLOR,
                    isPhysical: false,
                    hidden,
                    _custom:    true,
                };
                return;
            }
            const origLabel = loc(srcVal?.label ?? srcVal);
            const changed = (newLabel && newLabel !== origLabel) || newIcon || hidden;
            if (changed) {
                damageTypes[key] = {
                    ...(damageTypes[key] ?? {}),
                    label:  newLabel || origLabel,
                    icon:   newIcon  || srcVal.icon || DEFAULT_DAMAGE_ICON,
                    hidden,
                };
            } else {
                delete damageTypes[key];
            }
        });
        // Удаляем кастомные типы урона убранные из таблицы
        const domDamageKeys = getDomKeys(html, "#sc-table-damage");
        for (const key of Object.keys(damageTypes)) {
            if (damageTypes[key]?._custom && !domDamageKeys.has(key)) delete damageTypes[key];
        }

        const languages = foundry.utils.deepClone(existing.languages ?? {});
        this._mergeSimpleOverrides(html, cfg, "languages", "#sc-table-languages", languages, true);

        const currencies = foundry.utils.deepClone(existing.currencies ?? {});
        this._mergeCurrencyOverrides(html, cfg, currencies);

        const numerics = {};
        html.querySelectorAll(".sc-numeric-field").forEach(input => {
            const key     = input.dataset.key;
            const val     = input.type === "number" ? Number(input.value) : input.value?.trim();
            const origVal = input.type === "number" ? Number(input.dataset.original) : input.dataset.original;
            if (val !== origVal && val !== "" && val !== null) numerics[key] = val;
        });

        // ── Новые кастомные записи с валидацией ──────────────────────────────────
        const errors = [];

        // Все уже существующие ключи для проверки дублей
        // Вспомогательная функция: ищет поле ключа в строке по имени и показывает ошибку
        const validateAndShow = (rows, namePrefix, existing, onValid) => {
            for (const row of rows) {
                const input = this.element[0]?.querySelector(
                    `input[name="${namePrefix}[].key"][value="${row.key}"],` +
                    `input[name="${namePrefix}[].key"]`
                );
                // Ищем точнее — по значению
                const allInputs = this.element[0]?.querySelectorAll(`input[name="${namePrefix}[].key"]`) ?? [];
                const keyInput = [...allInputs].find(el => el.value.trim() === row.key) ?? allInputs[0];

                if (!row.key) {
                    if (keyInput) this._showKeyError(keyInput, "Ключ не может быть пустым");
                    errors.push("пустой ключ");
                    continue;
                }
                const check = validateKey(row.key, existing);
                if (!check.valid) {
                    if (keyInput) this._showKeyError(keyInput, check.reason);
                    errors.push(check.reason);
                    continue;
                }
                // Валидно — снимаем ошибку
                if (keyInput) this._showKeyError(keyInput, null);
                onValid(row);
                existing.push(row.key);
            }
        };

        const allAbilityExisting = [...Object.keys(cfg.abilities ?? {}), ...Object.keys(abilities)];
        validateAndShow(
            this._collectCustomRows(html, "customAbilities[]", ["key","label","abbr"]),
            "customAbilities", allAbilityExisting,
            (a) => { abilities[a.key] = { label: a.label || a.key, abbreviation: a.abbr || a.key.slice(0,3).toUpperCase(), type: "Number", improvement: true, _custom: true }; }
        );

        const allSkillExisting = [...Object.keys(cfg.skills ?? {}), ...Object.keys(skills)];
        validateAndShow(
            this._collectCustomRows(html, "customSkills[]", ["key","label","ability"]),
            "customSkills", allSkillExisting,
            (s) => { skills[s.key] = { label: s.label || s.key, ability: s.ability || "str", _custom: true }; }
        );

        const allWeaponExisting = [...Object.keys(cfg.weaponTypes ?? {}), ...Object.keys(weaponTypes)];
        validateAndShow(
            this._collectCustomRows(html, "customWeapons[]", ["key","label"]),
            "customWeapons", allWeaponExisting,
            (w) => { weaponTypes[w.key] = w.label || w.key; }
        );

        const allAlignmentExisting = [...Object.keys(cfg.alignments ?? {}), ...Object.keys(alignments)];
        validateAndShow(
            this._collectCustomRows(html, "customAlignments[]", ["key","label"]),
            "customAlignments", allAlignmentExisting,
            (a) => { alignments[a.key] = a.label || a.key; }
        );

        const allDamageExisting = [...Object.keys(cfg.damageTypes ?? {}), ...Object.keys(damageTypes)];
        validateAndShow(
            this._collectCustomRows(html, "customDamage[]", ["key","label","icon"]),
            "customDamage", allDamageExisting,
            (d) => {
                damageTypes[d.key] = {
                    label: d.label || d.key,
                    icon:  (d.icon && d.icon.trim()) ? d.icon.trim() : DEFAULT_DAMAGE_ICON,
                    color: DEFAULT_DAMAGE_COLOR, isPhysical: false, _custom: true,
                };
            }
        );

        const allLangExisting = [...Object.keys(cfg.languages ?? {}), ...Object.keys(languages)];
        validateAndShow(
            this._collectCustomRows(html, "customLanguages[]", ["key","label"]),
            "customLanguages", allLangExisting,
            (l) => { languages[l.key] = { label: l.label || l.key, _custom: true }; }
        );

        // Инлайн-ошибки уже показаны через _showKeyError в момент сбора.
        // Если остались ошибки — не сохраняем, пользователь исправляет на месте.
        if (errors.length > 0) {
            ui.notifications.warn(`Исправьте ${errors.length} ошибок в ключах перед сохранением.`);
            return;
        }

        const result = { ...existing, ...numerics };
        if (Object.keys(abilities).length)   result.abilities   = abilities;   else delete result.abilities;
        if (Object.keys(skills).length)      result.skills      = skills;      else delete result.skills;
        if (Object.keys(weaponTypes).length) result.weaponTypes = weaponTypes; else delete result.weaponTypes;
        if (Object.keys(alignments).length)  result.alignments  = alignments;  else delete result.alignments;
        if (Object.keys(damageTypes).length) result.damageTypes = damageTypes; else delete result.damageTypes;
        if (Object.keys(languages).length)   result.languages   = languages;   else delete result.languages;
        if (Object.keys(currencies).length)  result.currencies  = currencies;  else delete result.currencies;

        console.log(`[${MODULE_ID}] Saving customizations:`, result);
        await setSetting("customizationJson", result);
        ui.notifications.info("Настройки системы сохранены. Перезагрузите страницу для полного применения.");
    }

    _mergeSimpleOverrides(html, cfg, cfgKey, tableSelector, target, hasLabelProp = false) {
        const src = cfg[cfgKey] ?? {};
        html.querySelectorAll(`${tableSelector} tr[data-key]`).forEach(row => {
            const key       = row.dataset.key;
            const orig      = src[key];
            if (!orig) return;
            const newLabel  = row.querySelector(`input[name="${cfgKey}.${key}.label"]`)?.value?.trim();
            const origLabel = loc(hasLabelProp ? (orig?.label ?? orig) : (typeof orig === "string" ? orig : orig?.label ?? key));
            const hidden    = row.querySelector(`input[name="${cfgKey}.${key}.hidden"]`)?.checked ?? false;
            if ((newLabel && newLabel !== origLabel) || hidden) {
                target[key] = { ...(target[key] ?? {}), label: newLabel || origLabel, hidden };
            } else if (!target[key]?._custom) {
                delete target[key];
            }
        });
    }

    _mergeCurrencyOverrides(html, cfg, target) {
        const src = cfg.currencies ?? {};
        html.querySelectorAll("#sc-table-currencies tr[data-key]").forEach(row => {
            const key       = row.dataset.key;
            const orig      = src[key];
            if (!orig) return;
            const newLabel  = row.querySelector(`input[name="currencies.${key}.label"]`)?.value?.trim();
            const newAbbr   = row.querySelector(`input[name="currencies.${key}.abbr"]`)?.value?.trim();
            const origLabel = loc(orig.label);
            const origAbbr  = loc(orig.abbreviation);
            if ((newLabel && newLabel !== origLabel) || (newAbbr && newAbbr !== origAbbr))
                target[key] = { label: newLabel || origLabel, abbreviation: newAbbr || origAbbr };
            else if (!target[key]?._custom) delete target[key];
        });
    }

    // Показывает/скрывает инлайн-ошибку под полем ключа
    _showKeyError(input, message) {
        // Удаляем старую ошибку если есть
        const existing = input.parentElement?.querySelector(".sc-key-error");
        if (existing) existing.remove();
        if (!message) {
            input.style.borderColor = "";
            input.style.boxShadow   = "";
            return;
        }
        input.style.borderColor = "rgba(229,57,53,0.8)";
        input.style.boxShadow   = "0 0 4px rgba(229,57,53,0.4)";
        const err = document.createElement("div");
        err.className   = "sc-key-error";
        err.textContent = message;
        err.style.cssText = "font-size:10px;color:#ef9a9a;margin-bottom:2px;line-height:1.3;position:absolute;bottom:100%;left:0;z-index:10;background:#1a0a0a;padding:2px 5px;border-radius:3px;border:1px solid rgba(229,57,53,0.3);white-space:nowrap;";
        // Позиционируем НАД инпутом
        input.parentElement.style.position = "relative";
        input.parentElement.insertBefore(err, input);
    }

    _collectCustomRows(html, namePrefix, fields) {
        const result = [];
        const rows   = new Set();
        html.querySelectorAll(`input[name^="${namePrefix}"], select[name^="${namePrefix}"]`)
            .forEach(el => rows.add(el.closest("tr")));
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

    async _onReset(event) {
        event.preventDefault();
        const confirmed = await Dialog.confirm({
            title: "Сбросить все настройки системы?",
            content: "<p>Все ваши изменения названий, добавленные характеристики и навыки будут удалены. Система вернётся к стандартным значениям D&D 5e.</p>",
            yes: () => true, no: () => false, defaultYes: false,
        });
        if (!confirmed) return;
        await setSetting("customizationJson", {});
        ui.notifications.info("Настройки сброшены. Перезагрузите страницу.");
        this.close();
    }

    async ExportToJson() {
        saveDataToFile(JSON.stringify(getSetting("customizationJson"), null, 2), "text/json", `system-customization.json`);
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
            { label: "Экспорт", class: "export", icon: "fas fa-file-export", onclick: this.ExportToJson.bind(this) },
            { label: "Импорт",  class: "import", icon: "fas fa-file-import",  onclick: this.importFromJson.bind(this) },
            ...super._getHeaderButtons(),
        ];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
function registerSettings() {
    const SYSTEM_ID        = game.system.id.toUpperCase();
    const defaultConfigKey = CONFIG[SYSTEM_ID] ? `CONFIG.${SYSTEM_ID}` : `CONFIG.${game.system.id}`;

    registerSettingsArray({
        customizationJson: { scope: "world", config: false, type: Object, default: {} },
        configKey: {
            name: `${MODULE_ID}.settings.configKey.name`,
            hint: `${MODULE_ID}.settings.configKey.hint`,
            scope: "world", config: true, type: String, default: defaultConfigKey,
        },
    });

    game.settings.registerMenu(MODULE_ID, "CustomizerApp", {
        name:       game.i18n.localize(`${MODULE_ID}.settings.jsonEditor.name`),
        label:      game.i18n.localize(`${MODULE_ID}.settings.jsonEditor.label`),
        hint:       game.i18n.localize(`${MODULE_ID}.settings.jsonEditor.hint`),
        icon:       "fas fa-cogs",
        scope:      "world",
        restricted: true,
        type:       JsonEditorApp,
    });

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

function getSetting(key)             { return game.settings.get(MODULE_ID, key); }
async function setSetting(key, val)  { return await game.settings.set(MODULE_ID, key, val); }
function registerSettingsArray(s)    { for (const [k, v] of Object.entries(s)) game.settings.register(MODULE_ID, k, v); }

// ─────────────────────────────────────────────────────────────────────────────
const MODULE_ID = "dnd5e-system-customizer";
let ORIGINAL_CONFIG        = {};
let ORIGINAL_SYSTEM_CONFIG = {};

Hooks.on("init", () => { onPostInit(); });

function onPostInit() {
    registerSettings();
    const configKey    = getSetting("configKey");
    const systemConfig = foundry.utils.getProperty(window, configKey);

    if (!systemConfig) {
        Hooks.once("ready", () => {
            ui.notifications.warn("dnd5e-system-customizer.noConfig", { permanent: true, localize: true });
        });
        return;
    }

    ORIGINAL_SYSTEM_CONFIG = foundry.utils.deepClone(systemConfig);
    delete ORIGINAL_SYSTEM_CONFIG.trackableAttributes;

    const ORIGINAL_TRACKABLE_ATTRIBUTES = [...(systemConfig.trackableAttributes ?? [])];
    const customizations = foundry.utils.deepClone(getSetting("customizationJson") ?? {});

    // ─── КЛЮЧЕВОЙ ФИX: кастомные типы урона применяем ВРУЧНУЮ, не через mergeObject ───
    // mergeObject не гарантирует правильный тип для .color и может потерять .icon.
    // DamagesConfig._processChoice делает icon.endsWith(".svg") — icon ОБЯЗАН быть строкой.
    const customDamageTypes = {};
    if (customizations.damageTypes) {
        for (const [key, val] of Object.entries(customizations.damageTypes)) {
            if (val?._custom) {
                // Извлекаем кастомные, чтобы применить их отдельно
                customDamageTypes[key] = val;
                delete customizations.damageTypes[key];
            }
        }
        // Если после удаления кастомных damageTypes пустой — убираем чтобы не мешал merge
        if (Object.keys(customizations.damageTypes).length === 0)
            delete customizations.damageTypes;
    }

    // Применяем стандартные оверрайды (переименования)
    const merged = foundry.utils.mergeObject(systemConfig, customizations);
    if (merged.trackableAttributes) merged.trackableAttributes = ORIGINAL_TRACKABLE_ATTRIBUTES;

    // Применяем кастомные типы урона напрямую с гарантированной структурой
    for (const [key, val] of Object.entries(customDamageTypes)) {
        merged.damageTypes[key] = {
            label:      val.label      || key,
            icon:       (val.icon && typeof val.icon === "string" && val.icon.trim())
                ? val.icon.trim()
                : DEFAULT_DAMAGE_ICON,
            color:      Color.fromString(
                (typeof val.color === "string") ? val.color : DEFAULT_DAMAGE_COLOR
            ),
            isPhysical: false,
            _custom:    true,
        };
        console.log(`[${MODULE_ID}] Applied custom damageType "${key}":`, merged.damageTypes[key].icon);
    }

    deleteKeys(merged);
}

function deleteKeys(obj) {
    if (!obj) return;
    const isObj = typeof obj === "object" && !Array.isArray(obj) && obj !== null;
    if (isObj) {
        for (const key of Object.keys(obj)) {
            if (obj[key]?.unsafelyDelete) delete obj[key];
            else deleteKeys(obj[key]);
        }
    } else if (Array.isArray(obj)) {
        for (const val of obj) deleteKeys(val);
    }
}

export { MODULE_ID, ORIGINAL_CONFIG, ORIGINAL_SYSTEM_CONFIG };
