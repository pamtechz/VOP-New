# Localization save and apply repair

Selecting an interface language now loads its published translations and renders
the matching UI keys in that language. Untranslated labels retain their original
fallback. Study language remains independent.

Fixed:
- Lowercased bulkSave action could never match its handler.
- Legacy flat translation keys were rejected by the namespaced-only validator.
- English fallback labels in two-argument translation calls were treated as locale codes.
- UI components used study language instead of the selected interface locale.
- Profile restoration and the header selector changed both UI and study language.
- Approved proposals updated only legacy storage, leaving canonical published values stale.
- Draft/unpublished entries could reappear from legacy aggregates or local editor caches.
- Personal-settings metadata was returned as editable settings and failed the next save.

Saving uses ownership-checked transactions, retains the original contributor,
limits each batch to 350 entries, and refreshes the active dictionary. English
aliases remain registry-driven. Per-account language preferences are persisted
independently. Existing translation ownership and proposal-review permissions
remain enforced.

Verification: 66 automated tests, including handler save -> public dictionary,
legacy keys, alias writes, ownership denial, unpublish/delete, invalid writes,
and rendered Header translation while study language remains English. Production
build, lint and architecture gate passed. Local browser preview was blocked by
the browser environment; visual verification is not claimed.

The attached Google popup COOP warnings and click-triggered admin/content 403
cannot be attributed to a particular authenticated operation from the console
excerpt alone. No popup-security or authorization bypass was introduced. Full
literal-string coverage and authenticated production UI verification remain
separate follow-up work.
