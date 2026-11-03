// Keep a durable undo record until both documents and settings have been saved.
// Foundry does not provide transactions spanning these document types.
export async function rollbackCustomization(journal, io) {
    const errors = [];
    for (const entry of [...journal.actors].reverse()) {
        try {
            const actor = await io.resolveActor(entry.uuid);
            if (!actor) throw new Error(`Missing actor: ${entry.uuid}`);
            const current = io.readActor(actor);
            if (current.xp === entry.before.xp && current.flag === entry.before.flag) continue;
            if (current.xp !== entry.after.xp || current.flag !== entry.after.flag) {
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
            if (current.xp !== entry.before.xp || current.flag !== entry.before.flag) {
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
