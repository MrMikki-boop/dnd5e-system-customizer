const SPECIAL_LANGUAGE_KEYS = new Set(["sign", "cant", "druidic"]);
const ROOT_LANGUAGE_GROUP = "__root";
const SPECIAL_LANGUAGE_SECTION = {
    key: "__special",
    label: "Прочие",
    originalLabel: "Прочие",
};

export function usesLanguageGroups(cfg, custom) {
    return Object.values(cfg.languages ?? {}).some(v => v?.children)
        || Object.values(custom.languages ?? {}).some(v => v?.children);
}

export function getDirectChildrenKeys(root = {}) {
    const keys = [];
    for (const [key, value] of Object.entries(root)) {
        if (value?.children) keys.push(...getDirectChildrenKeys(value.children));
        else keys.push(key);
    }
    return keys;
}

function getEntryLabel(value, fallback, loc) {
    if (value && typeof value === "object") return loc(value.label ?? fallback) || fallback;
    return loc(value) || fallback;
}

function getLanguageOverride(overrides, path) {
    return foundry.utils.getProperty(overrides, path.split(".").join(".children.")) ?? {};
}

export function buildLanguageSections(cfg, custom, loc) {
    const src = cfg.languages ?? {};
    const overrides = custom.languages ?? {};
    const sections = [];
    const seen = new Set();

    const flattenLanguageChildren = (children = {}, childOverrides = {}, groupKey, path = []) => {
        const languages = [];
        for (const [key, value] of Object.entries(children)) {
            const childPath = [...path, key];
            if (value?.children) {
                languages.push(...flattenLanguageChildren(value.children, childOverrides, groupKey, childPath));
                continue;
            }
            const ov = getLanguageOverride(childOverrides, childPath.join("."));
            languages.push({
                group: groupKey,
                sourceGroup: groupKey,
                key,
                path: childPath.join("."),
                label: ov.label ?? getEntryLabel(value, key, loc),
                hidden: ov.hidden ?? false,
                allowedUsers: (ov.allowedUsers || []).join(","),
                isCustom: false,
                isSpecial: SPECIAL_LANGUAGE_KEYS.has(key),
            });
        }
        return languages;
    };

    const addSection = (groupKey, groupValue = {}, overrideValue = {}) => {
        seen.add(groupKey);
        const children = groupValue.children ?? {};
        const childOverrides = overrideValue.children ?? {};
        const languages = flattenLanguageChildren(children, childOverrides, groupKey)
            .filter(language => !language.isSpecial);

        for (const [key, value] of Object.entries(childOverrides)) {
            if (children[key]) continue;
            if (!value || typeof value !== "object") continue;
            if (value.children) continue;
            languages.push({
                group: groupKey,
                sourceGroup: groupKey,
                key,
                path: key,
                label: value.label ?? key,
                hidden: value.hidden ?? false,
                allowedUsers: (value.allowedUsers || []).join(","),
                isCustom: true,
            });
        }

        sections.push({
            key: groupKey,
            label: overrideValue.label ?? getEntryLabel(groupValue, groupKey, loc),
            originalLabel: getEntryLabel(groupValue, groupKey, loc),
            isCustom: !src[groupKey] || !!overrideValue._customGroup,
            languages,
        });
    };

    for (const [groupKey, groupValue] of Object.entries(src)) {
        if (groupValue?.children) addSection(groupKey, groupValue, overrides[groupKey] ?? {});
    }

    const specialLanguages = [];
    for (const [groupKey, groupValue] of Object.entries(src)) {
        if (!groupValue?.children) continue;
        const overrideValue = overrides[groupKey] ?? {};
        specialLanguages.push(...flattenLanguageChildren(groupValue.children ?? {}, overrideValue.children ?? {}, groupKey)
            .filter(language => language.isSpecial)
            .map(language => ({ ...language, group: SPECIAL_LANGUAGE_SECTION.key })));
    }
    for (const [key, value] of Object.entries(src)) {
        if (value?.children) continue;
        const ov = overrides[key] ?? {};
        specialLanguages.push({
            group: SPECIAL_LANGUAGE_SECTION.key,
            sourceGroup: ROOT_LANGUAGE_GROUP,
            key,
            path: key,
            label: ov.label ?? getEntryLabel(value, key, loc),
            hidden: ov.hidden ?? false,
            allowedUsers: (ov.allowedUsers || []).join(","),
            isCustom: false,
            isSpecial: SPECIAL_LANGUAGE_KEYS.has(key),
        });
    }
    if (specialLanguages.length) {
        sections.push({
            ...SPECIAL_LANGUAGE_SECTION,
            isCustom: false,
            isVirtual: true,
            languages: specialLanguages,
        });
    }

    for (const [groupKey, groupValue] of Object.entries(overrides)) {
        if (seen.has(groupKey)) continue;
        if (groupValue?.children) addSection(groupKey, {}, groupValue);
    }

    const legacyCustom = Object.entries(overrides).filter(([, value]) => value?._custom && !value.children);
    if (legacyCustom.length) {
        let custom = sections.find(s => s.key === "custom");
        if (!custom) {
            custom = { key: "custom", label: "Author Languages", originalLabel: "Author Languages", isCustom: true, languages: [] };
            sections.push(custom);
        }
        for (const [key, value] of legacyCustom) {
            if (custom.languages.some(l => l.key === key)) continue;
            custom.languages.push({
                group: custom.key,
                sourceGroup: custom.key,
                key,
                path: key,
                label: value.label ?? key,
                hidden: value.hidden ?? false,
                allowedUsers: (value.allowedUsers || []).join(","),
                isCustom: true,
            });
        }
    }

    return sections;
}

export function mergeLanguageGroupOverrides(html, cfg, existing, getArray, loc) {
    const src = cfg.languages ?? {};
    const target = {};

    const ensureGroup = (groupKey) => {
        target[groupKey] ??= {};
        return target[groupKey];
    };
    const ensureChildren = (groupTarget) => {
        groupTarget.children ??= {};
        return groupTarget.children;
    };
    const setChild = (children, path, value) => {
        const parts = path.split(".").filter(Boolean);
        let node = children;
        while (parts.length > 1) {
            const part = parts.shift();
            node[part] ??= { children: {} };
            node[part].children ??= {};
            node = node[part].children;
        }
        node[parts[0]] = value;
    };

    html.querySelectorAll(".sc-language-section[data-group]").forEach(section => {
        const groupKey = section.dataset.group;
        const isVirtual = section.dataset.virtual === "true";
        const srcGroup = src[groupKey] ?? {};
        const existingGroup = existing.languages?.[groupKey] ?? {};
        const groupLabel = section.querySelector(".sc-language-group-label")?.value?.trim();
        const originalGroupLabel = getEntryLabel(srcGroup, groupKey, loc);

        if (!isVirtual) {
            const groupTarget = ensureGroup(groupKey);
            if (groupLabel && (groupLabel !== originalGroupLabel || !src[groupKey])) groupTarget.label = groupLabel;
            if (!src[groupKey]) {
                groupTarget.selectable = false;
                groupTarget._customGroup = true;
            }
        }

        const domKeys = new Set();
        section.querySelectorAll("tr[data-key]").forEach(row => {
            const key = row.dataset.key;
            const sourceGroupKey = row.dataset.sourceGroup || groupKey;
            const childPath = row.dataset.path || key;
            const isRootLanguage = sourceGroupKey === ROOT_LANGUAGE_GROUP;
            const sourceSrcGroup = isRootLanguage ? src : src[sourceGroupKey] ?? {};
            const sourceExistingGroup = isRootLanguage ? existing.languages ?? {} : existing.languages?.[sourceGroupKey] ?? {};
            const sourceTarget = isRootLanguage ? target : ensureGroup(sourceGroupKey);
            const children = isRootLanguage ? sourceTarget : ensureChildren(sourceTarget);
            domKeys.add(`${sourceGroupKey}:${childPath}`);
            const srcValue = isRootLanguage
                ? sourceSrcGroup[childPath]
                : getLanguageOverride(sourceSrcGroup.children ?? {}, childPath);
            const existingValue = (isRootLanguage
                ? sourceExistingGroup[childPath]
                : getLanguageOverride(sourceExistingGroup.children ?? {}, childPath)) ?? {};
            const newLabel = row.querySelector(".sc-language-label")?.value?.trim();
            const hidden = row.querySelector(".sc-hide-check")?.checked ?? false;
            const allowedUsers = getArray(row.querySelector(".sc-allowed-users")?.value);

            if (!srcValue) {
                setChild(children, childPath, { ...(existingValue ?? {}), label: newLabel || existingValue?.label || key, hidden, allowedUsers, _custom: true });
                return;
            }

            const originalLabel = getEntryLabel(srcValue, key, loc);
            const changed = (newLabel && newLabel !== originalLabel) || hidden || allowedUsers.length > 0;
            if (changed) setChild(children, childPath, { ...(existingValue ?? {}), label: newLabel || originalLabel, hidden, allowedUsers });
        });

        if (isVirtual) return;

        const groupTarget = ensureGroup(groupKey);
        const children = ensureChildren(groupTarget);
        for (const [key, value] of Object.entries(existingGroup.children ?? {})) {
            const domKey = `${groupKey}:${key}`;
            if (value?._custom && !domKeys.has(domKey)) continue;
            if (children[key]) continue;
            if (value?._custom) children[key] = value;
            else if (!srcGroup.children?.[key] && value) children[key] = value;
        }
    });

    for (const [groupKey, groupValue] of Object.entries(target)) {
        if (groupValue.children && !Object.keys(groupValue.children).length) delete groupValue.children;
        if (!Object.keys(groupValue).length) delete target[groupKey];
    }
    return target;
}
