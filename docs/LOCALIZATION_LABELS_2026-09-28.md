# Readable localization labels and English source protection

Admin labels now pass explicit English fallbacks. Runtime lookup rejects namespace keys stored as translated values, and source labels humanize missing or obsolete key-only text. Translation rows and proposal choices show readable source labels instead of exposing raw keys. Discovery refreshes existing English source labels when the authored copy changes.

English remains available as an interface language and public source dictionary. English codes and regional variants are excluded from translation targets, and translation writes/proposals reject English destinations on the server. Other configured languages remain eligible. No production translations were modified.

Validation covers the four reported admin labels, poisoned dictionary values, source-label fallback, English alias/region write rejection, and existing non-English save flows. Full unit suite, build, lint, architecture and release CI validate the change; authenticated production visual interaction is not covered.
