# Translation and Curriculum Studio save validation

Translation keys are case-sensitive. The UI includes keys such as `curriculum.guideRequired`; the save validator now accepts their uppercase characters without changing the keys. Invalid document paths remain rejected.

The administrator language subscription supplies uppercase codes. Curriculum Studio now normalizes guide selector codes and loaded guide language values to lowercase, and the server normalizes guide save/archive and lesson save inputs before validation and document selection. Uppercase and lowercase guide submissions update the same canonical document.

Regression coverage exercises translation bulk save and public dictionary retrieval with a camelCase key, uppercase guide creation, lowercase update, uppercase archive, and invalid language rejection. Permission checks are unchanged. Authenticated production editor interaction still requires a user session; automated handler tests use an isolated database and mocked authentication boundaries.
