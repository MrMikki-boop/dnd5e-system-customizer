# System Customizer

Customize abilities, skills, weapon types, alignments, damage types, languages,
currencies, experience, initiative, and HP calculations in Foundry VTT 13 with
dnd5e 5.3.3.

Install through the [module manifest](https://github.com/MrMikki-boop/dnd5e-system-customizer/releases/latest/download/module.json),
or place the module directory under `Data/modules/dnd5e-system-customizer`.
As a GM, open the editor from module settings. Save changes to reload connected
clients and apply the new configuration.

## Experience

Choose the standard XP table, a multiplier, a custom table, milestone points,
or percentages. Saving, importing, and resetting recalculate XP for world
characters and unlinked tokens in world scenes. Compendium actors are excluded.
Only the active GM can save.

Conversion uses cumulative XP thresholds, so raising a class between scale
changes preserves the recorded XP. Small XP awards retain their precision when
using points or percentages. Matching precision records from older versions are
recognized; values without one are treated as cumulative XP. Missing XP is not
inferred from class level. Token inheritance is preserved during saves and rollbacks.

Reset restores the standard XP table and keeps the world's dnd5e leveling mode
(XP, epic boons, or manual milestones).

Before saving, the module records the previous settings and XP in
`experienceRecovery`. A failed save triggers a rollback. If interrupted, the active
GM retries recovery on the next world load. Further XP edits and customization
saves are blocked until recovery finishes. Conflicting actor edits are left intact
and reported in the console. Keep world backups; recovery cannot cover every failure.

## Initiative and hit points

Choose the default abilities used for initiative and HP. An actor's own initiative
ability or manually entered maximum HP takes precedence. The HP ability also
applies to hit die recovery.

The initiative formula replaces the base `1d20` while retaining ability,
proficiency, exhaustion, other bonuses, and tie-breakers. For example, `2d10`
rolls two d10 plus the usual bonuses; `1d20 + 1d4` adds a d4 to the normal check.
A plain leading `1d20` retains advantage, Lucky, and die limits. Other formulas
use their explicit dice modifiers. Fixed initiative scores are preserved.
Clear the field to restore the system roll. These settings do not rewrite actors.

## Visibility

Hide entries from players or allow selected players to see them. Hidden values
remain in forms, so saving another field preserves them. These rules support the
standard dnd5e sheets; third-party sheets may need an adapter. Hiding changes the
display, not document permissions, and cannot keep data secret.

## Damage types and rules editions

Only changed fields are saved for standard damage types. Overrides for types
provided by a disabled module remain in settings but do not recreate those types.
Types created in this editor remain available.

Standard condition descriptions follow the world's 2014 or 2024 rules after a
reload. Old or imported overrides cannot pin their references or descriptions.
Existing Active Effects keep the descriptions stored when they were created.

## Releases

A push to `master` validates the module, builds the ZIP, and prepares a GitHub
release draft. Wait for the workflow to finish, review the files, then publish
the draft manually. Pull requests only validate and build the package.

The first draft build creates a version tag. A retry can refresh its files from
the same commit; changes after that require a new version or a build from the
tagged commit. Update both `version` and the tag in `download` in `module.json`.
Published releases are skipped.
