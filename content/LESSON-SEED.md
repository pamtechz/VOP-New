# VOP lesson seed data

The uploaded VOP ZIP was extracted into a source-derived lesson master outside the React runtime.

Inventory:
- Bemba: 26 lessons
- Tonga: 26 lessons
- Total: 52 lessons
- Reading sections: derived dynamically from the HTML structure; no fixed 20-page assumption.
- Quiz questions: empty where the supplied source contains no verified questions/answers. No quiz data is invented.

The generated master is migration/seed data, not a React component or hardcoded UI dataset.

Use `scripts/seed-firestore.mjs` with Firebase Application Default Credentials to seed the Firestore `lessons` collection. The learner app does not query this collection; the build pipeline can consume the approved master/source and emit the offline snapshots.

The source package is the uploaded lesson archive supplied in this conversation.
