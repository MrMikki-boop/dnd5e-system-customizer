// Keep a durable undo record until both documents and settings have been saved.
// Foundry does not provide transactions spanning these document types.
export function experienceStateMatches(current, expected) {
    if (!expected.delta) return current.xp === expected.xp && current.flag === expected.flag;
    // A base actor update changes inherited values without changing the token.
    // Compare local overrides to detect actual edits to a synthetic actor.
    return current.delta && ["xp", "flag"].every(key =>
        Object.hasOwn(current.delta, key) === Object.hasOwn(expected.delta, key)
        && current.delta[key] === expected.delta[key]);
}

export async function rollbackCustomization(journal, io) {
    const errors = [];
    // New journals restore bases before deltas, so inherited values are correct
    // when verifying tokens. Retain the old order for older recovery records.
    const entries = journal.actors.some(entry => entry.before.delta) ? journal.actors : [...journal.actors].reverse();
    for (const entry of entries) {
        try {
            const actor = await io.resolveActor(entry.uuid);
            if (!actor) throw new Error(`Missing actor: ${entry.uuid}`);
            const current = io.readActor(actor);
            if (experienceStateMatches(current, entry.before)) continue;
            if (!experienceStateMatches(current, entry.after)) {
                throw new Error(`Experience changed outside migration: ${entry.uuid}`);
            }
            await io.writeActor(actor, entry.before);
        } catch (error) { errors.push(error); }
    }
    for (const restore of [
        () => io.writeCustomizations(journal.customizations),
        () => io.writeLevelingMode(journal.levelingMode),
    ]) {
        try { await restore(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Experience recovery is incomplete");
    await io.writeJournal(null);
}

export async function commitCustomization(journal, target, io) {
    await io.writeJournal(journal);
    try {
        for (const entry of journal.actors) {
            const actor = await io.resolveActor(entry.uuid);
            if (!actor) throw new Error(`Missing actor: ${entry.uuid}`);
            const current = io.readActor(actor);
            if (!experienceStateMatches(current, entry.before)) {
                throw new Error(`Experience changed before migration: ${entry.uuid}`);
            }
            await io.writeActor(actor, entry.after);
        }
        await io.writeLevelingMode(target.levelingMode);
        await io.writeCustomizations(target.customizations);
        await io.writeJournal(null);
    } catch (error) {
        try { await rollbackCustomization(journal, io); }
        catch (recoveryError) {
            throw new AggregateError([error, recoveryError], "Customization failed; recovery is required");
        }
        throw error;
    }
}
