# System Customizer

Customization of D&D 5e configuration for Foundry VTT 13: abilities, skills,
weapon types, alignments, damage types, languages, currencies, and experience
progression. The implementation references the installed dnd5e 5.3.3 templates.

Install using the manifest URL in `module.json`, or place the complete module
directory under `Data/modules/dnd5e-system-customizer`. Runtime dependencies in
`scripts/` must be included. Open the editor from module settings as a GM.

## Saving and experience

Saving, importing, and resetting use the same experience migration. Character
actors and independent unlinked-token actors in world scenes are included;
compendium actors are not modified. The active GM performs the save to avoid
competing migrations from different GM clients.

Before writes begin, the module stores the previous settings and affected XP
values in the world setting `experienceRecovery`. On failure it attempts to
restore them. If restoration fails or the client disconnects, the record remains
and the active GM retries recovery on the next world load. XP changes and further
customization saves are blocked while recovery is pending. Recovery does not
overwrite an actor whose XP or precision flag differs from both recorded states;
the console identifies that actor for manual investigation.

Foundry has no atomic transaction across actors and settings. The recovery record
allows interrupted operations to be repaired; it does not replace world backups.
Connected clients reload after a successful configuration change so they use the
same XP scale. Reset returns XP to the standard table and keeps the world's
independent dnd5e leveling preference (XP, boons, or no XP).

## Visibility

Hide rules are presentation rules for players, with optional user exceptions.
They do not change document permissions or remove data from CONFIG. Hidden form
controls remain in the form so saving other fields preserves their values.
Standard dnd5e ability/skill rows, trait choices and pills, weapon/damage choices,
and alignment fields are supported. Third-party sheets with different markup may
need an adapter. These rules are not a mechanism for keeping data secret.

## Verification

Run `node --test tests/*.test.cjs` with Node 22 or newer. On Windows installations
with restrictive parent-directory permissions, use
`node --preserve-symlinks --preserve-symlinks-main --test tests/regression.test.cjs`.
The tests use Foundry stubs and cover migration, rollback, imports, resets, user
overrides, runtime config contracts, and package dependencies.

Serve this directory over local HTTP and open `tests/browser.html` for real DOM
checks, including preservation of hidden values in `FormData`.
`node tests/verify-package.cjs <unpacked-directory>` checks manifest assets and
transitive runtime imports in an extracted release archive. CI runs regression
tests and validates the extracted ZIP before publishing tag releases.

Before deploying to a live world, check in Foundry with both a GM and player:

- Load the world, open the editor, save an override, and verify it after reload.
- Change XP → points → percent → XP, including a small XP award between changes.
- Import another scale and reset; verify actor XP and unlinked-token XP.
- Edit a custom weapon, alignment, and language twice; return numeric fields to defaults.
- Hide a trait, save a different sheet field, and verify the hidden trait still exists.

Node and browser fixture tests do not replace these in-world integration checks.
