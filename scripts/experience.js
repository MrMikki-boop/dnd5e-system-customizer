const DEFAULT_XP_LEVELS = [
    0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
    85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];
const DEFAULT_POINTS_PER_LEVEL = 5;

const LEVELING_MODES = [
    { value: "noxp", label: "Вехи вручную", hint: "Foundry скрывает опыт; уровни выдаются вручную через классы." },
    { value: "xp", label: "Опыт", hint: "Foundry показывает и начисляет XP без эпических даров после капа." },
    { value: "xpBoons", label: "Опыт + эпические дары", hint: "После максимального уровня прогресс идёт к эпическим дарам." },
];

const PROGRESSION_MODES = [
    { value: "standard", label: "Стандартная таблица D&D", hint: "Классическая таблица XP из dnd5e без пересчета." },
    { value: "multiplier", label: "Множитель от стандарта", hint: "Автоматически умножает стандартные пороги XP на выбранный коэффициент." },
    { value: "custom", label: "Своя таблица XP", hint: "Позволяет вручную задать накопительный порог XP для каждого уровня." },
    { value: "points", label: "Очки вех", hint: "Каждый уровень стоит одинаковое число условных очков вех." },
    { value: "percent", label: "Проценты уровня", hint: "Показывает прогресс как проценты: 100% означает полный переход на следующий уровень." },
];

function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function clampInt(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
    return clamp(Math.round(numberOr(value, fallback)), min, max);
}

function normalizePointsPerLevel(experience = {}) {
    const configured = experience.pointsPerLevelConfigured === true;
    const value = clampInt(experience.pointsPerLevel, DEFAULT_POINTS_PER_LEVEL, 1, 1000000);
    if (experience.tableMode === "points" && !configured && value === 1) return DEFAULT_POINTS_PER_LEVEL;
    return value;
}

function standardTable(cfg) {
    const table = Array.isArray(cfg.CHARACTER_EXP_LEVELS) && cfg.CHARACTER_EXP_LEVELS.length
        ? cfg.CHARACTER_EXP_LEVELS
        : DEFAULT_XP_LEVELS;
    return table.map(value => clampInt(value, 0));
}

function extendTable(table, maxLevel) {
    const result = table.slice(0, maxLevel);
    while (result.length < maxLevel) {
        const previous = result.at(-1) ?? 0;
        const beforePrevious = result.at(-2) ?? 0;
        const step = Math.max(previous - beforePrevious, 1);
        result.push(previous + step);
    }
    result[0] = 0;
    return result;
}

function normalizeAscending(table, maxLevel) {
    const result = extendTable(table.map(value => clampInt(value, 0)), maxLevel);
    result[0] = 0;
    for (let i = 1; i < result.length; i += 1) {
        if (result[i] <= result[i - 1]) result[i] = result[i - 1] + 1;
    }
    return result;
}

function sameTable(left, right) {
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

function getLevelBounds(table, level, maxLevel) {
    const characterLevel = clampInt(level, 1, 1, maxLevel);
    const minIndex = Math.min(characterLevel - 1, table.length - 1);
    const min = table[minIndex] ?? 0;

    if (characterLevel >= maxLevel) return { min, max: Infinity };

    const maxIndex = Math.min(characterLevel, table.length - 1);
    const max = table[maxIndex] ?? min + 1;
    return { min, max: Math.max(max, min + 1) };
}

function normalizeLegacyPointValue(value, level, source, bounds) {
    if (source.mode !== "points") return value;
    if (!Number.isFinite(bounds.max)) return value;
    if (value >= bounds.min) return value;

    const legacyCurrent = value - Math.max(level - 1, 0);
    const required = bounds.max - bounds.min;
    if (legacyCurrent < 0 || legacyCurrent > required) return value;
    return bounds.min + legacyCurrent;
}

function migrationRatio(value, bounds, epicBoonInterval) {
    if (Number.isFinite(bounds.max)) {
        return Math.max(0, (value - bounds.min) / (bounds.max - bounds.min));
    }

    const interval = clampInt(epicBoonInterval, 30000, 1, 100000000);
    return Math.max(0, (value - bounds.min) / interval);
}

function valueFromMigrationRatio(ratio, bounds, epicBoonInterval) {
    if (Number.isFinite(bounds.max)) {
        return Math.round(bounds.min + ((bounds.max - bounds.min) * Math.max(0, ratio)));
    }

    const interval = clampInt(epicBoonInterval, 30000, 1, 100000000);
    return Math.round(bounds.min + (Math.max(0, ratio) * interval));
}

function convertExperienceValueBetweenScales(value, level, source, target) {
    const sourceBounds = getLevelBounds(source.table, level, source.maxLevel);
    const targetBounds = getLevelBounds(target.table, level, target.maxLevel);
    const normalizedValue = normalizeLegacyPointValue(value, level, source, sourceBounds);
    const ratio = migrationRatio(normalizedValue, sourceBounds, source.epicBoonInterval);
    return valueFromMigrationRatio(ratio, targetBounds, target.epicBoonInterval);
}

export function resolveExperienceTable(cfg, experience = {}) {
    const maxLevel = clampInt(experience.maxLevel, cfg.maxLevel ?? 20, 1, 100);
    const base = extendTable(standardTable(cfg), maxLevel);
    const mode = experience.tableMode || "standard";

    if (mode === "multiplier") {
        const multiplier = Math.max(numberOr(experience.multiplier, 1), 0.01);
        return normalizeAscending(base.map((value, index) => index ? Math.round(value * multiplier) : 0), maxLevel);
    }

    if (mode === "points") {
        const points = normalizePointsPerLevel(experience);
        return Array.from({ length: maxLevel }, (_, index) => index * points);
    }

    if (mode === "percent") {
        const percentStep = clampInt(experience.percentStep, 100, 1, 100);
        return Array.from({ length: maxLevel }, (_, index) => index * percentStep);
    }

    if (mode === "custom") {
        return normalizeAscending(experience.xpTable ?? base, maxLevel);
    }

    return normalizeAscending(base, maxLevel);
}

export function buildExperienceData(cfg, custom, currentLevelingMode = "xpBoons") {
    const saved = custom.experience ?? {};
    const maxLevel = clampInt(saved.maxLevel, custom.maxLevel ?? cfg.maxLevel ?? 20, 1, 100);
    const experience = {
        tableMode: saved.tableMode || "standard",
        levelingMode: saved.levelingMode || currentLevelingMode || "xpBoons",
        maxLevel,
        multiplier: numberOr(saved.multiplier, 1),
        pointsPerLevel: normalizePointsPerLevel(saved),
        pointsPerLevelConfigured: saved.pointsPerLevelConfigured === true,
        percentStep: clampInt(saved.percentStep, 100, 1, 100),
        epicBoonInterval: clampInt(saved.epicBoonInterval, cfg.epicBoonInterval ?? 30000, 1, 100000000),
    };
    const table = resolveExperienceTable(cfg, { ...experience, xpTable: saved.xpTable });
    const isCustomMode = experience.tableMode === "custom";
    const isPercentMode = experience.tableMode === "percent";
    const isNoXp = experience.levelingMode === "noxp";

    return {
        ...experience,
        isCustomMode,
        isPercentMode,
        isNoXp,
        levelingModeOptions: LEVELING_MODES.map(option => ({
            ...option,
            selected: option.value === experience.levelingMode,
        })),
        progressionModeOptions: PROGRESSION_MODES.map(option => ({
            ...option,
            selected: option.value === experience.tableMode,
        })),
        rows: table.map((value, index) => ({
            level: index + 1,
            value,
            displayValue: isPercentMode ? (index ? experience.percentStep : 0) : value,
            suffix: isPercentMode ? "%" : "",
            original: (cfg.CHARACTER_EXP_LEVELS ?? DEFAULT_XP_LEVELS)[index] ?? "",
            readonly: index === 0 || !isCustomMode,
        })),
    };
}

export function collectExperienceForm(html, cfg, existing, currentLevelingMode = "xpBoons") {
    const get = selector => html.querySelector(selector);
    const maxLevel = clampInt(get("[name='experience.maxLevel']")?.value, existing.experience?.maxLevel ?? existing.maxLevel ?? cfg.maxLevel ?? 20, 1, 100);
    const experience = {
        tableMode: get("[name='experience.tableMode']")?.value || "standard",
        levelingMode: get("[name='experience.levelingMode']")?.value || currentLevelingMode || "xpBoons",
        maxLevel,
        multiplier: Math.max(numberOr(get("[name='experience.multiplier']")?.value, existing.experience?.multiplier ?? 1), 0.01),
        pointsPerLevel: clampInt(get("[name='experience.pointsPerLevel']")?.value, existing.experience?.pointsPerLevel ?? DEFAULT_POINTS_PER_LEVEL, 1, 1000000),
        pointsPerLevelConfigured: true,
        percentStep: clampInt(get("[name='experience.percentStep']")?.value, existing.experience?.percentStep ?? 100, 1, 100),
        epicBoonInterval: clampInt(get("[name='experience.epicBoonInterval']")?.value, existing.experience?.epicBoonInterval ?? cfg.epicBoonInterval ?? 30000, 1, 100000000),
    };

    const table = [];
    html.querySelectorAll(".sc-xp-row").forEach(row => {
        const level = clampInt(row.dataset.level, 1, 1, 100);
        table[level - 1] = clampInt(row.querySelector(".sc-xp-value")?.value, 0);
    });
    experience.xpTable = resolveExperienceTable(cfg, { ...experience, xpTable: table });
    return experience;
}

export function applyExperienceCustomization(systemConfig, experience) {
    if (!experience || typeof experience !== "object") return;
    const table = resolveExperienceTable(systemConfig, experience);
    systemConfig.maxLevel = clampInt(experience.maxLevel, systemConfig.maxLevel ?? table.length, 1, 100);
    systemConfig.CHARACTER_EXP_LEVELS = table;
    systemConfig.epicBoonInterval = clampInt(experience.epicBoonInterval, systemConfig.epicBoonInterval ?? 30000, 1, 100000000);
}

export function buildExperienceMigration(cfg, sourceExperience = {}, targetExperience = {}) {
    const sourceMaxLevel = clampInt(sourceExperience?.maxLevel, cfg.maxLevel ?? 20, 1, 100);
    const targetMaxLevel = clampInt(targetExperience?.maxLevel, cfg.maxLevel ?? 20, 1, 100);
    const sourceEpicBoonInterval = clampInt(sourceExperience?.epicBoonInterval, cfg.epicBoonInterval ?? 30000, 1, 100000000);
    const targetEpicBoonInterval = clampInt(targetExperience?.epicBoonInterval, cfg.epicBoonInterval ?? 30000, 1, 100000000);
    const sourceTable = resolveExperienceTable(cfg, { ...sourceExperience, maxLevel: sourceMaxLevel });
    const targetTable = resolveExperienceTable(cfg, { ...targetExperience, maxLevel: targetMaxLevel });

    return {
        changed: !sameTable(sourceTable, targetTable) || sourceEpicBoonInterval !== targetEpicBoonInterval,
        source: {
            table: sourceTable,
            maxLevel: sourceMaxLevel,
            epicBoonInterval: sourceEpicBoonInterval,
            mode: sourceExperience?.tableMode || "standard",
        },
        target: {
            table: targetTable,
            maxLevel: targetMaxLevel,
            epicBoonInterval: targetEpicBoonInterval,
            mode: targetExperience?.tableMode || "standard",
        },
    };
}

export function convertActorExperienceForMigration(actor, migration) {
    if (!migration?.changed || actor?.type !== "character") return null;

    const xp = actor.system?.details?.xp;
    const value = Number(xp?.value);
    if (!Number.isFinite(value)) return null;

    const level = clampInt(actor.system?.details?.level, 1, 1, 100);
    const nextValue = convertExperienceValueBetweenScales(value, level, migration.source, migration.target);

    return Number.isFinite(nextValue) ? Math.max(0, nextValue) : null;
}

export function shouldScaleStandardExperienceAward(custom) {
    return ["percent", "points"].includes(custom?.experience?.tableMode);
}

export function isAbstractExperienceMode(mode) {
    return ["percent", "points"].includes(mode);
}

export function getStandardExperienceForMigration(actor, cfg, migration) {
    if (actor?.type !== "character") return null;

    const value = Number(actor.system?.details?.xp?.value);
    if (!Number.isFinite(value)) return null;

    const level = clampInt(actor.system?.details?.level, 1, 1, 100);
    const standard = {
        table: resolveExperienceTable(cfg, { tableMode: "standard", maxLevel: migration.source.maxLevel }),
        maxLevel: migration.source.maxLevel,
        epicBoonInterval: clampInt(cfg.epicBoonInterval, 30000, 1, 100000000),
        mode: "standard",
    };
    const standardValue = convertExperienceValueBetweenScales(value, level, migration.source, standard);
    return Number.isFinite(standardValue) ? Math.max(0, standardValue) : null;
}

export function convertStandardExperienceToConfigured(actor, cfg, experience, standardValue) {
    if (actor?.type !== "character") return null;

    const value = Number(standardValue);
    if (!Number.isFinite(value)) return null;

    const maxLevel = clampInt(experience?.maxLevel, cfg.maxLevel ?? 20, 1, 100);
    const epicBoonInterval = clampInt(experience?.epicBoonInterval, cfg.epicBoonInterval ?? 30000, 1, 100000000);
    const level = clampInt(actor.system?.details?.level, 1, 1, 100);
    const standard = {
        table: resolveExperienceTable(cfg, { tableMode: "standard", maxLevel }),
        maxLevel,
        epicBoonInterval: clampInt(cfg.epicBoonInterval, 30000, 1, 100000000),
        mode: "standard",
    };
    const configured = {
        table: resolveExperienceTable(cfg, { ...experience, maxLevel }),
        maxLevel,
        epicBoonInterval,
        mode: experience?.tableMode || "standard",
    };

    const configuredValue = convertExperienceValueBetweenScales(value, level, standard, configured);
    return Number.isFinite(configuredValue) ? Math.max(0, configuredValue) : null;
}

export function getStandardExperienceForConfigured(actor, cfg, experience) {
    if (actor?.type !== "character") return null;

    const value = Number(actor.system?.details?.xp?.value);
    if (!Number.isFinite(value)) return null;

    const maxLevel = clampInt(experience?.maxLevel, cfg.maxLevel ?? 20, 1, 100);
    const epicBoonInterval = clampInt(experience?.epicBoonInterval, cfg.epicBoonInterval ?? 30000, 1, 100000000);
    const level = clampInt(actor.system?.details?.level, 1, 1, 100);
    const configured = {
        table: resolveExperienceTable(cfg, { ...experience, maxLevel }),
        maxLevel,
        epicBoonInterval,
        mode: experience?.tableMode || "standard",
    };
    const standard = {
        table: resolveExperienceTable(cfg, { tableMode: "standard", maxLevel }),
        maxLevel,
        epicBoonInterval: clampInt(cfg.epicBoonInterval, 30000, 1, 100000000),
        mode: "standard",
    };

    const standardValue = convertExperienceValueBetweenScales(value, level, configured, standard);
    return Number.isFinite(standardValue) ? Math.max(0, standardValue) : null;
}

export function convertStandardAwardForAbstractExperience(actor, cfg, experience, nextValue) {
    if (actor?.type !== "character") return null;

    const currentValue = Number(actor.system?.details?.xp?.value);
    const submittedValue = Number(nextValue);
    if (!Number.isFinite(currentValue) || !Number.isFinite(submittedValue)) return null;

    const rawStandardDelta = submittedValue - currentValue;
    if (!rawStandardDelta) return null;

    const maxLevel = clampInt(experience?.maxLevel, cfg.maxLevel ?? 20, 1, 100);
    const epicBoonInterval = clampInt(experience?.epicBoonInterval, cfg.epicBoonInterval ?? 30000, 1, 100000000);
    const level = clampInt(actor.system?.details?.level, 1, 1, 100);
    const standard = {
        table: resolveExperienceTable(cfg, { tableMode: "standard", maxLevel }),
        maxLevel,
        epicBoonInterval: clampInt(cfg.epicBoonInterval, 30000, 1, 100000000),
        mode: "standard",
    };
    const abstract = {
        table: resolveExperienceTable(cfg, { ...experience, maxLevel }),
        maxLevel,
        epicBoonInterval,
        mode: experience?.tableMode || "standard",
    };

    const currentStandardValue = convertExperienceValueBetweenScales(currentValue, level, abstract, standard);
    const nextStandardValue = currentStandardValue + rawStandardDelta;
    const nextAbstractValue = convertExperienceValueBetweenScales(nextStandardValue, level, standard, abstract);
    return Number.isFinite(nextAbstractValue) ? Math.max(0, nextAbstractValue) : null;
}

export function isPercentExperienceMode(custom) {
    return custom?.experience?.tableMode === "percent";
}

export function getPercentExperienceDisplay(actor) {
    const xp = actor?.system?.details?.xp;
    if (!xp) return null;

    const min = numberOr(xp.min, 0);
    const max = Number(xp.max);
    const value = Number(xp.value);
    if (!Number.isFinite(max) || !Number.isFinite(value)) return null;

    const required = max - min;
    if (required <= 0) return null;

    const percent = clampInt(((value - min) * 100) / required, 0, 0, 100);
    return { value: percent, min: 0, max: 100, actualMin: min, actualMax: max, required };
}

export function getCurrentLevelExperienceDisplay(actor) {
    const xp = actor?.system?.details?.xp;
    if (!xp) return null;

    const min = numberOr(xp.min, 0);
    const max = Number(xp.max);
    let value = Number(xp.value);
    if (!Number.isFinite(max) || !Number.isFinite(value)) return null;

    const required = max - min;
    if (required <= 0) return null;

    const level = clampInt(actor.system?.details?.level, 1, 1, 100);
    value = normalizeLegacyPointValue(value, level, { mode: "points" }, { min, max });
    const current = clampInt(value - min, 0, 0, required);
    return { value: current, min: 0, max: required, actualMin: min, actualMax: max, required };
}

export function percentToExperienceValue(actor, percent) {
    const display = getPercentExperienceDisplay(actor);
    if (!display) return null;
    const clampedPercent = clampInt(percent, 0, 0, 100);
    return Math.round(display.actualMin + ((display.required * clampedPercent) / 100));
}
