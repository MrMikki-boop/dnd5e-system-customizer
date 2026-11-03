const fs = require("node:fs");
const path = require("node:path");

function verifyPackage(root) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "module.json"), "utf8"));
    const checked = new Set();
    const verify = file => {
        const resolved = path.resolve(root, file);
        if (!fs.existsSync(resolved)) throw new Error(`Missing packaged file: ${file}`);
        if (checked.has(resolved)) return;
        checked.add(resolved);
        if (!/\.(m?js)$/.test(file)) return;
        const source = fs.readFileSync(resolved, "utf8");
        for (const match of source.matchAll(/\b(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) {
            verify(path.join(path.dirname(file), match[1]));
        }
        for (const match of source.matchAll(/modules\/\$\{MODULE_ID\}\/(templates\/[^`"']+)/g)) verify(match[1]);
    };
    for (const file of [...(manifest.esmodules ?? []), ...(manifest.scripts ?? []), ...(manifest.styles ?? []),
        ...(manifest.languages ?? []).map(language => language.path)]) verify(file);
    return checked.size;
}
module.exports = { verifyPackage };
if (require.main === module) console.log(`Package OK: ${verifyPackage(process.argv[2] ?? ".")} runtime files`);
