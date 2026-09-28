import { isEnglishLocale } from '../shared/locales.js';
import { FieldValue } from 'firebase-admin/firestore';
import type { TenantContext } from './tenant.js';

export function translationKey(value: unknown): string {
  const key = String(value ?? '').trim();
  // Existing catalogues contain legacy flat keys and case-sensitive namespaced keys.
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z][a-zA-Z0-9_-]*)*$/.test(key) || key.length > 200) throw new Error('A valid translation key is required.');
  return key;
}

export async function saveLocaleTranslations(
  ctx: TenantContext, locale: string, values: Record<string, unknown>,
  sources: Record<string, unknown>, status: string,
) {
  if (isEnglishLocale(locale)) throw new Error('English is the source language. Select another language to translate into.');
  if (!['draft', 'review', 'published', 'deleted'].includes(status)) throw new Error('Invalid translation status.');
  const entries = Object.entries(values).map(([key, value]) => [translationKey(key), String(value ?? '')] as const);
  if (entries.length > 350) throw new Error('Save at most 350 translations at a time.');
  const aggregateRef = ctx.db.doc(`translations/${locale}`);
  await ctx.db.runTransaction(async transaction => {
    const aggregate = await transaction.get(aggregateRef);
    const current = aggregate.data() || {};
    if (aggregate.exists && !ctx.isSuperAdmin && current.ownerUid !== ctx.auth.uid) {
      throw new Error('Only the translation owner or Super Admin can change this translation. Submit an improvement for review.');
    }
    const published: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      const state = status === 'deleted' ? 'deleted' : value.trim() ? status : 'draft';
      const record: Record<string, unknown> = {
        key, locale, namespace: key.split('.')[0], value, status: state,
        version: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(), updatedBy: ctx.auth.uid,
      };
      if (sources[key] !== undefined) record.source = String(sources[key]);
      transaction.set(ctx.db.doc(`locales/${locale}/translations/${key}`), record, { merge: true });
      published[key] = state === 'published' ? value : FieldValue.delete();
    }
    transaction.set(aggregateRef, {
      id: locale, languageCode: locale, values: published, sharingScope: 'shared', organizationId: '',
      ownerUid: current.ownerUid || ctx.auth.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: ctx.auth.uid,
    }, { merge: true });
    transaction.set(ctx.db.doc(`locales/${locale}`), { version: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return entries.length;
}
