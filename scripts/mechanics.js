// Legacy editor keys map to the settings actually consumed by dnd5e 5.x.
const ABILITY_SETTINGS = { initiativeAbility: "initiative", hitPointsAbility: "hitPoints" };

function usesSystemD20(roll) {
    const first = roll.terms[0];
    return first instanceof foundry.dice.terms.Die && first.faces === 20 && first.number === 1
        && first.modifiers.length === 0;
}

export function validateMechanicsCustomization(custom, original) {
    for (const [key, setting] of Object.entries(ABILITY_SETTINGS)) {
        const ability = custom[key] ?? custom.defaultAbilities?.[setting];
        if (ability === undefined) continue;
        if (typeof ability !== "string" || !(Object.hasOwn(original.abilities ?? {}, ability)
            || Object.hasOwn(custom.abilities ?? {}, ability))) {
            return "invalidMechanicsAbility";
        }
    }
    if (custom.initiativeFormula !== undefined) {
        if (typeof custom.initiativeFormula !== "string") return "invalidInitiativeFormula";
        const formula = custom.initiativeFormula.trim();
        if (formula && !Roll.validate(formula)) return "invalidInitiativeFormula";
    }
    return null;
}

export function applyMechanicsCustomization(config, custom) {
    for (const [key, setting] of Object.entries(ABILITY_SETTINGS)) {
        const ability = custom[key];
        if (typeof ability === "string" && Object.hasOwn(config.abilities ?? {}, ability)) {
            config.defaultAbilities ??= {};
            config.defaultAbilities[setting] = ability;
        }
    }
}

export function customizeInitiativeRoll(roll, formula, moduleId) {
    if (!roll || !formula || formula === "1d20" || roll.options.fixed !== undefined
        || roll.options[moduleId]?.initiativeFormula === formula) return roll;

    // Replace the leading die, retaining bonuses, exhaustion and the tie-breaker.
    const tail = Roll.getFormula(roll.terms.slice(1));
    const combined = `${formula} ${tail}`;
    const options = foundry.utils.deepClone(roll.options);
    options[moduleId] = { ...options[moduleId], initiativeFormula: formula };
    const candidate = new CONFIG.Dice.BasicRoll(combined, roll.data, options);
    if (usesSystemD20(candidate)) {
        // Let the system apply advantage, Lucky and min/max to a standard d20.
        options.configured = false;
        return new roll.constructor(combined, roll.data, options);
    }
    // Arbitrary formulas use an ordinary roll, without imposing d20 mechanics.
    return candidate;
}

export function customizeHitDie(config) {
    const ability = CONFIG.DND5E.defaultAbilities.hitPoints;
    const roll = config.rolls?.[0];
    if (!ability || ability === "con" || typeof roll?.parts?.[0] !== "string") return;
    // dnd5e 5.3.3 still hardcodes CON in this formula, for both rules editions.
    roll.parts[0] = roll.parts[0].replace(/@abilities\.con\.mod\b/g, `@abilities.${ability}.mod`);
}

export function registerMechanicsCustomization(moduleId, custom) {
    Hooks.on("dnd5e.preRollHitDie", customizeHitDie);
    const formula = typeof custom.initiativeFormula === "string" ? custom.initiativeFormula.trim() : "";
    if (!formula || formula === "1d20" || !Roll.validate(formula)) return;

    const wrap = function (wrapped, ...args) {
        return customizeInitiativeRoll(wrapped(...args), formula, moduleId);
    };
    if (globalThis.libWrapper?.register) {
        libWrapper.register(moduleId, "CONFIG.Actor.documentClass.prototype.getInitiativeRoll", wrap, "WRAPPER");
    } else {
        const prototype = CONFIG.Actor.documentClass.prototype;
        const original = prototype.getInitiativeRoll;
        prototype.getInitiativeRoll = function (...args) {
            return wrap.call(this, original.bind(this), ...args);
        };
    }
    Hooks.on("dnd5e.preRollInitiativeDialog", (config, dialog) => {
        dialog.options ??= {};
        const RollType = dialog.options.rollType ?? CONFIG.Dice.D20Roll;
        // A factory only: returned rolls keep their native, serializable classes.
        dialog.options.rollType = class extends RollType {
            static fromConfig(rollConfig, process) {
                return customizeInitiativeRoll(RollType.fromConfig(rollConfig, process), formula, moduleId);
            }
        };
        if (!usesSystemD20(new CONFIG.Dice.BasicRoll(formula, config.rolls?.[0]?.data))) {
            dialog.applicationClass ??= CONFIG.Dice.BasicRoll.DefaultConfigurationDialog;
        }
    });
    // Sheet dialogs construct rolls separately, then cache them for combat.
    Hooks.on("dnd5e.postInitiativeDialogRollConfiguration", rolls => {
        for (let i = 0; i < rolls.length; i++) rolls[i] = customizeInitiativeRoll(rolls[i], formula, moduleId);
    });
}
