import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CreditCard, Gauge, RefreshCw, RotateCcw, ShieldCheck, Sparkles, XCircle, Zap } from 'lucide-react';
import type { User } from '../../types';
import { auth } from '../../lib/firebase';
import { appConfirm, appPrompt } from '../layout/AppDialog';
import {
  SUBSCRIPTION_FEATURES, SUBSCRIPTION_QUOTAS,
  subscriptionIntervalLabel, subscriptionQuotaLimit, subscriptionStatusLabel,
} from '../../../shared/subscriptions';

export type SubscriptionPackageView = {
  id: string; name: string; description: string; active: boolean; price: number; priceUsd?: number; baseCurrency?: string; currency: string;
  interval: string; sortOrder: number; defaultForUnsubscribed?: boolean; quotas: Record<string, unknown>; features: Record<string, unknown>;
  billingPrice?: string; billingCurrency?: string; exchangeRate?: number; billingCountryCode?: string;
};

export type BillingTenantOption = {
  id: string; name: string; type: 'organization' | 'church' | 'district' | 'conference' | 'union';
};
type Usage = Record<string, number>;
type Overview = {
  billingTenantType: 'organization' | 'church' | 'district' | 'conference' | 'union';
  billingTenantId: string; tenantName: string; organizationId: string; organizationName: string; plan: string | null;
  catalogPlan: SubscriptionPackageView | null;
  subscription: Record<string, unknown> | null;
  quotas: Record<string, unknown>;
  featureEntitlements: Record<string, unknown>;
  usage: Usage;
  billingProfile: Record<string, unknown>;
  subscriptionAudience?: { learnersCandidates?: boolean; organizations?: boolean; churches?: boolean; districts?: boolean; conferences?: boolean; unions?: boolean };
  freeTier?: boolean;
  paidPlanActive?: boolean;
  exhaustedQuotaKeys?: string[];
  billingAccessSuspended: boolean;
  billingSuspendedReason: string;
  subscriptionRequired?: boolean;
};

interface Props {
  currentUser: User;
  isSuperAdmin: boolean;
  billingTenants: BillingTenantOption[];
  packages: SubscriptionPackageView[];
  busy?: boolean;
  onCreatePlan?: () => void;
  onEditPlan?: (plan: SubscriptionPackageView) => void;
  onDeletePlan?: (plan: SubscriptionPackageView) => void | Promise<void>;
  onOpenCheckout?: (planId?: string) => void;
}

async function planApi(body: Record<string, unknown>) {
  if (!auth?.currentUser) throw new Error('Sign in again.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/admin/plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as {
    error?: string; item?: unknown; items?: unknown[]; subscription?: unknown; usage?: unknown;
  } & Record<string, unknown>;
  if (!response.ok) throw new Error(payload.error || 'Subscription request failed.');
  return payload;
}

function formatDate(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return 'No expiry';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPlanName(name?: unknown): string {
  const raw = String(name || '').trim();
  if (!raw) return 'No active plan';
  return raw.replace(/stater/gi, 'Starter');
}

function reasonLabel(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  if (raw === 'manual_override') return 'Direct Activation';
  return raw.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function planFitsUsage(plan: SubscriptionPackageView, usage: Usage, learnersCandidatesBilled: boolean) {
  return SUBSCRIPTION_QUOTAS.every(definition => {
    if (definition.key === 'maxCandidates' && !learnersCandidatesBilled) return true;
    const limit = subscriptionQuotaLimit(plan.quotas, definition.key);
    return limit === null || Number(usage[definition.usageKey] || 0) <= limit;
  });
}

export default function SubscriptionWorkspace({
  currentUser, isSuperAdmin, billingTenants, packages, busy = false,
  onCreatePlan, onEditPlan, onDeletePlan, onOpenCheckout,
}: Props) {
  const organizationRole = String(currentUser.organizationRole || '');
  const hierarchyType = String(currentUser.role || '').replace('_admin', '') as BillingTenantOption['type'];
  const isHierarchyAdmin = ['union_admin', 'conference_admin', 'district_admin', 'church_admin'].includes(String(currentUser.role || ''));
  const ownTarget: BillingTenantOption | null = isHierarchyAdmin && currentUser.adminNodeId
    ? { id: String(currentUser.adminNodeId), name: 'My institution', type: hierarchyType }
    : Boolean(currentUser.organizationId) && ['owner', 'admin'].includes(organizationRole)
      ? { id: String(currentUser.organizationId), name: 'My organization', type: 'organization' }
      : null;
  const selfService = !isSuperAdmin && Boolean(ownTarget);
  const [billingTargetKey, setBillingTargetKey] = useState(
    isSuperAdmin ? '' : ownTarget ? ownTarget.type + ':' + ownTarget.id : '',
  );
  const selectedTarget = useMemo(() => {
    if (!billingTargetKey) return null;
    const separator = billingTargetKey.indexOf(':');
    if (separator < 1) return null;
    const type = billingTargetKey.slice(0, separator) as BillingTenantOption['type'];
    const id = billingTargetKey.slice(separator + 1);
    return { type, id, name: billingTenants.find(item => item.type === type && item.id === id)?.name || id };
  }, [billingTargetKey, billingTenants]);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [availablePlans, setAvailablePlans] = useState<SubscriptionPackageView[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isSuperAdmin) {
      setBillingTargetKey(ownTarget ? ownTarget.type + ':' + ownTarget.id : '');
      return;
    }
    if (billingTargetKey && billingTenants.some(item => item.type + ':' + item.id === billingTargetKey)) return;
    const first = billingTenants[0];
    setBillingTargetKey(first ? first.type + ':' + first.id : '');
  }, [
    isSuperAdmin, currentUser.organizationId, currentUser.organizationRole, currentUser.role, currentUser.adminNodeId,
    billingTenants, billingTargetKey, ownTarget,
  ]);

  const refresh = async () => {
    if (!selectedTarget) { setOverview(null); setAvailablePlans([]); return; }
    setLoading(true); setError('');
    try {
      const [current, catalog] = await Promise.all([
        planApi({ action: 'getSubscription', billingTenantType: selectedTarget.type, billingTenantId: selectedTarget.id }),
        planApi({ action: 'listAvailablePlans', billingTenantType: selectedTarget.type, billingTenantId: selectedTarget.id }),
      ]);
      setOverview(current as unknown as Overview);
      setAvailablePlans((catalog.items || []) as SubscriptionPackageView[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Subscription details could not be loaded.');
      setOverview(null);
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, [billingTargetKey]);

  const usage = overview?.usage || {};
  const subscription = overview?.subscription || {};
  const currentPlanId = String(overview?.plan || subscription.planId || '');
  const snapshotPlan = subscription.planSnapshot && typeof subscription.planSnapshot === 'object'
    ? subscription.planSnapshot as SubscriptionPackageView : null;
  const currentPlan = snapshotPlan
    || availablePlans.find(plan => plan.id === currentPlanId)
    || overview?.catalogPlan
    || packages.find(plan => plan.id === currentPlanId)
    || null;

  const currentPlanName = formatPlanName(subscription.planName || currentPlan?.name);
  const currentPlanFree = Boolean(currentPlan) && Number(currentPlan?.priceUsd ?? currentPlan?.price ?? 0) === 0;
  const status = String(subscription.status || '');
  const active = status === 'active';
  const cancelAtPeriodEnd = subscription.cancelAtPeriodEnd === true;

  const planOptions = useMemo(() => {
    const source = isSuperAdmin
      ? availablePlans.length ? availablePlans : packages.filter(plan => plan.active !== false)
      : availablePlans;
    return [...source].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
  }, [availablePlans, packages, isSuperAdmin]);

  const assign = async (plan: SubscriptionPackageView) => {
    if (!isSuperAdmin || !selectedTarget) return;
    const planTitle = formatPlanName(plan.name);
    const reason = await appPrompt('Record why this subscription is being activated without a customer payment.', {
      title: 'Assign subscription plan', placeholder: 'Complimentary access, migration, support adjustment…',
    });
    if (reason === null || !reason.trim()) return;
    setWorking(true); setError('');
    try {
      await planApi({
        action: 'assignPlan', billingTenantType: selectedTarget.type, billingTenantId: selectedTarget.id,
        planId: plan.id, activationSource: 'manual_override', overrideReason: reason.trim(),
      });
      setMessage(planTitle + ' assigned. The institution now uses this plan’s entitlement snapshot.');
      await refresh();
    } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : 'The subscription could not be assigned.'); }
    finally { setWorking(false); }
  };

  const activateFreePlan = async (plan: SubscriptionPackageView) => {
    if (isSuperAdmin || !selectedTarget) return;
    const planTitle = formatPlanName(plan.name);
    setWorking(true); setError('');
    try {
      const result = await planApi({
        action: 'activateFreePlan', billingTenantType: selectedTarget.type, billingTenantId: selectedTarget.id, planId: plan.id,
      });
      setMessage(result.alreadyActive === true
        ? planTitle + ' is already active.'
        : planTitle + ' activated. No payment is required for this plan.');
      await refresh();
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'The free subscription plan could not be activated.');
    } finally { setWorking(false); }
  };

  const cancel = async (mode: 'period_end' | 'immediate') => {
    if (!selectedTarget || (!isSuperAdmin && mode === 'immediate')) return;
    const confirmed = await appConfirm(
      mode === 'period_end'
        ? 'Schedule this subscription to end after the current paid term? Access remains active until the period ends.'
        : 'Cancel this subscription immediately? Paid feature access and new resource creation will be suspended now.',
      { title: mode === 'period_end' ? 'Cancel at period end' : 'Cancel subscription now', confirmLabel: mode === 'period_end' ? 'Schedule cancellation' : 'Cancel now', tone: 'danger' },
    );
    if (!confirmed) return;
    const reason = await appPrompt('Record the cancellation reason.', { title: 'Cancellation reason', placeholder: 'Requested by institution, billing correction…' });
    if (reason === null || !reason.trim()) return;
    setWorking(true); setError('');
    try {
      await planApi({
        action: 'cancelSubscription', billingTenantType: selectedTarget.type, billingTenantId: selectedTarget.id,
        mode, reason: reason.trim(),
      });
      setMessage(mode === 'period_end' ? 'Cancellation scheduled for the end of the current term.' : 'Subscription cancelled and paid feature access suspended.');
      await refresh();
    } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : 'The subscription could not be cancelled.'); }
    finally { setWorking(false); }
  };

  const reactivate = async () => {
    if (!selectedTarget) return;
    let overrideReason = '';
    if (isSuperAdmin) {
      const reason = await appPrompt('Record why this subscription is being reactivated without a new payment.', {
        title: 'Reactivate subscription', placeholder: 'Cancellation reversed, support adjustment…',
      });
      if (reason === null || !reason.trim()) return;
      overrideReason = reason.trim();
    }
    setWorking(true); setError('');
    try {
      await planApi({
        action: 'reactivateSubscription', billingTenantType: selectedTarget.type, billingTenantId: selectedTarget.id,
        ...(overrideReason ? { overrideReason } : {}),
      });
      setMessage(cancelAtPeriodEnd ? 'Scheduled cancellation removed.' : 'Subscription reactivated.');
      await refresh();
    } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : 'The subscription could not be reactivated.'); }
    finally { setWorking(false); }
  };

  const openCheckout = (planId?: string) => {
    if (onOpenCheckout) onOpenCheckout(planId);
  };

  if (!isSuperAdmin && !selfService) {
    return <div className="vop-payment-empty">Subscription administration is available to the institution’s authorized administrators.</div>;
  }

  const activePlanAssigned = Boolean(active || currentPlan || currentPlanId || overview?.paidPlanActive || overview?.freeTier || (currentPlanName && currentPlanName !== "No active plan"));
  const displayDescription = currentPlan?.description && currentPlan?.description.toLowerCase() !== currentPlanName.toLowerCase()
    ? currentPlan.description
    : (activePlanAssigned
      ? 'Active institutional plan with standard limits and features.'
      : 'No subscription package is currently assigned.');

  return (
    <div className="vop-subscription-workspace">
      <section className="vop-subscription-toolbar">
        <div>
          <span className="vop-page-kicker">Subscription Management</span>
          <h2>Plan, subscription & usage</h2>
          <p>Manage subscription packages, monitor live institutional capacity, and handle billing options seamlessly.</p>
        </div>
        <div className="vop-subscription-toolbar-actions">
          {isSuperAdmin && (
            <label>
              <span>Target Institution</span>
              <select value={billingTargetKey} onChange={event => setBillingTargetKey(event.target.value)}>
                <option value="">Choose institution</option>
                {billingTenants.map(item => (
                  <option key={item.type + ':' + item.id} value={item.type + ':' + item.id}>
                    {item.name} · {item.type}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="btn btn-outline" type="button" disabled={loading || !selectedTarget} onClick={() => void refresh()}>
            <RefreshCw size={15} /> Refresh
          </button>
          {isSuperAdmin && onCreatePlan && (
            <button className="btn btn-primary" type="button" onClick={onCreatePlan}>
              <Sparkles size={15} /> Create Plan
            </button>
          )}
        </div>
      </section>

      {error && (
        <div className="vop-payment-alert danger">
          <XCircle size={18} />
          <span>{error}</span>
          <button onClick={() => setError('')}>×</button>
        </div>
      )}
      {message && (
        <div className="vop-payment-alert success">
          <Check size={18} />
          <span>{message}</span>
          <button onClick={() => setMessage('')}>×</button>
        </div>
      )}

      {!selectedTarget ? (
        <div className="vop-payment-empty">Choose an institution to view its subscription details and consumption.</div>
      ) : loading && !overview ? (
        <div className="vop-payment-empty">Loading subscription details…</div>
      ) : overview && (
        <>
          <div className="vop-subscription-summary-grid">
            <article className="vop-subscription-current">
              <div className="vop-subscription-card-head">
                <div>
                  <span className="vop-card-kicker">Current Plan</span>
                  <h3>{currentPlanName}</h3>
                </div>
                <span className={'vop-subscription-status ' + (active ? 'active' : 'inactive')}>
                  <Zap size={13} style={{ marginRight: 4 }} />
                  {subscriptionStatusLabel(status)}
                </span>
              </div>
              <p className="vop-subscription-desc">{displayDescription}</p>

              <dl className="vop-subscription-meta-list">
                <div>
                  <dt>Billing Interval</dt>
                  <dd>{currentPlan || subscription.planInterval ? subscriptionIntervalLabel(subscription.planInterval || currentPlan?.interval) : '—'}</dd>
                </div>
                <div>
                  <dt>Current Term Ends</dt>
                  <dd>{formatDate(subscription.currentPeriodEnd)}</dd>
                </div>
                <div>
                  <dt>Activation Method</dt>
                  <dd>{reasonLabel(subscription.activationSource)}</dd>
                </div>
                <div>
                  <dt>Billing Currency</dt>
                  <dd>{String(subscription.billingCurrency || overview.billingProfile?.billingCurrency || currentPlan?.billingCurrency || 'USD')}</dd>
                </div>
              </dl>

              {overview.freeTier && (
                <div className="vop-subscription-warning">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Free Tier Active</strong>
                    <span>Your institution is operating on the free tier. Upgrade to increase capacity limits.</span>
                  </div>
                </div>
              )}
              {overview.billingAccessSuspended && (
                <div className="vop-subscription-warning danger">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Paid Access Suspended</strong>
                    <span>{reasonLabel(overview.billingSuspendedReason)}</span>
                  </div>
                </div>
              )}
              {cancelAtPeriodEnd && (
                <div className="vop-subscription-warning">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Cancellation Scheduled</strong>
                    <span>Subscription remains active until {formatDate(subscription.currentPeriodEnd)}.</span>
                  </div>
                </div>
              )}

              <div className="vop-subscription-actions">
                {!isSuperAdmin && (
                  <button className="btn btn-primary" type="button" onClick={() => openCheckout(currentPlanId || undefined)}>
                    <CreditCard size={15} />
                    {active ? 'Renew / Change Plan' : 'Choose a Plan'}
                  </button>
                )}
                {active && !currentPlanFree && !cancelAtPeriodEnd && (
                  <button className="btn btn-outline" type="button" disabled={working || busy} onClick={() => void cancel('period_end')}>
                    Cancel at period end
                  </button>
                )}
                {isSuperAdmin && active && (
                  <button className="btn btn-danger" type="button" disabled={working || busy} onClick={() => void cancel('immediate')}>
                    Cancel Now
                  </button>
                )}
                {cancelAtPeriodEnd && (
                  <button className="btn btn-outline" type="button" disabled={working || busy} onClick={() => void reactivate()}>
                    <RotateCcw size={15} /> Keep Subscription
                  </button>
                )}
                {isSuperAdmin && !active && currentPlanId && (
                  <button className="btn btn-primary" type="button" disabled={working || busy} onClick={() => void reactivate()}>
                    <RotateCcw size={15} /> Reactivate Subscription
                  </button>
                )}
              </div>
            </article>

            <article className="vop-subscription-entitlements">
              <div className="vop-subscription-card-head">
                <div>
                  <span className="vop-card-kicker">Included Features</span>
                  <h3>Plan entitlements</h3>
                </div>
                <ShieldCheck size={22} className="vop-head-icon" />
              </div>
              <div className="vop-subscription-feature-grid">
                {SUBSCRIPTION_FEATURES.map(feature => {
                  const included = overview.featureEntitlements?.[feature.key] === true;
                  return (
                    <span key={feature.key} className={'vop-subscription-feature ' + (included ? 'included' : 'excluded')}>
                      {included ? <Check size={14} className="icon-check" /> : <XCircle size={14} className="icon-cross" />}
                      {feature.label}
                    </span>
                  );
                })}
              </div>
              <p className="vop-subscription-footnote">
                Entitlements are snapshotted on activation. Changes to catalog plans will not disrupt active institution terms.
              </p>
            </article>
          </div>

          <section className="vop-subscription-usage-section">
            <div className="vop-subscription-section-head">
              <div>
                <span className="vop-card-kicker">Live Capacity</span>
                <h3>Usage against plan limits</h3>
                <p>Enforced in real-time before new institutional members or resources are allocated.</p>
              </div>
              <Gauge size={24} className="vop-head-icon" />
            </div>

            <div className="vop-subscription-usage-grid">
              {SUBSCRIPTION_QUOTAS.map(definition => {
                const used = Math.max(0, Number(usage[definition.usageKey] || 0));
                const excludedFromBilling = definition.key === 'maxCandidates' && overview.subscriptionAudience?.learnersCandidates !== true;
                const limit = excludedFromBilling ? null : subscriptionQuotaLimit(overview.quotas, definition.key);
                const percent = limit === null ? 0 : limit === 0 ? (used > 0 ? 100 : 0) : Math.min(100, Math.round((used / limit) * 100));
                const level = limit !== null && used >= limit ? 'danger' : limit !== null && percent >= 80 ? 'warning' : 'normal';

                return (
                  <article key={definition.key} className={'vop-subscription-usage-card ' + level}>
                    <div className="vop-usage-card-top">
                      <strong className="vop-usage-title">{definition.label}</strong>
                      <span className="vop-usage-count">
                        {used} / {excludedFromBilling ? 'Unlimited' : limit === null ? 'Unlimited' : limit}
                        {limit !== null && <small className="vop-usage-pct"> ({percent}%)</small>}
                      </span>
                    </div>
                    <div className="vop-subscription-meter" aria-label={definition.label + ' usage'}>
                      <span style={{ width: (limit === null ? 0 : percent) + '%' }} />
                    </div>
                    <small className="vop-usage-desc">
                      {excludedFromBilling ? 'Learners/candidates are currently exempt from billing limits.' : definition.description}
                    </small>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="vop-subscription-plans-section">
            <div className="vop-subscription-section-head">
              <div>
                <span className="vop-card-kicker">Plan Catalog</span>
                <h3>{isSuperAdmin ? 'Available Plans for Institution' : 'Upgrade, Downgrade or Renew'}</h3>
                <p>
                  {isSuperAdmin
                    ? 'Manual assignments require audit justification. Customer plan changes execute via checkout.'
                    : 'Prices are listed for your institution’s billing region. Final validation occurs at checkout.'}
                </p>
              </div>
            </div>

            <div className="vop-subscription-plan-grid">
              {planOptions.map(plan => {
                const planTitle = formatPlanName(plan.name);
                const isCurrent = plan.id === currentPlanId;
                const fits = planFitsUsage(plan, usage, overview.subscriptionAudience?.learnersCandidates === true);
                const freePlan = Number(plan.priceUsd ?? plan.price ?? 0) === 0;
                const enabledFeatures = SUBSCRIPTION_FEATURES.filter(feature => plan.features?.[feature.key] === true);

                return (
                  <article key={plan.id} className={'vop-subscription-plan-card ' + (isCurrent ? 'current' : '') + (fits ? '' : ' incompatible')}>
                    <header>
                      <div>
                        <span className="vop-plan-tag">{subscriptionIntervalLabel(plan.interval)}</span>
                        <h4>{planTitle}</h4>
                      </div>
                      {isCurrent && <span className="vop-subscription-current-chip">Current Plan</span>}
                    </header>

                    <p className="vop-plan-desc">{plan.description && plan.description.toLowerCase() !== planTitle.toLowerCase() ? plan.description : 'Institutional subscription package'}</p>

                    <div className="vop-subscription-price">
                      {freePlan ? (
                        <>
                          <strong>Free</strong>
                          <span className="vop-price-sub"> / forever</span>
                        </>
                      ) : (
                        <>
                          <span className="vop-price-currency">{plan.billingCurrency || 'USD'}</span>
                          <strong>{plan.billingPrice || Number(plan.priceUsd ?? plan.price ?? 0).toFixed(2)}</strong>
                          <span className="vop-price-sub"> / {plan.interval === 'year' ? 'year' : plan.interval === 'one_time' ? 'one-time' : 'month'}</span>
                        </>
                      )}
                    </div>

                    <div className="vop-plan-section-title">Quotas & Capacity</div>
                    <div className="vop-subscription-plan-limits">
                      {SUBSCRIPTION_QUOTAS.slice(0, 4).map(definition => {
                        const limit = subscriptionQuotaLimit(plan.quotas, definition.key);
                        return (
                          <span key={definition.key}>
                            {definition.label}: <strong>{limit === null ? 'Unlimited' : limit}</strong>
                          </span>
                        );
                      })}
                    </div>

                    <div className="vop-plan-section-title">Included Features</div>
                    <div className="vop-subscription-feature-summary">
                      {enabledFeatures.map(feature => (
                        <span key={feature.key}>
                          <Check size={14} className="icon-check" />
                          {feature.label}
                        </span>
                      ))}
                    </div>

                    {!fits && (
                      <div className="vop-subscription-plan-warning">
                        <AlertTriangle size={15} /> Insufficient capacity for current usage
                      </div>
                    )}

                    <footer>
                      {isSuperAdmin && onEditPlan && (
                        <button className="btn btn-outline" type="button" onClick={() => onEditPlan(plan)}>
                          Edit
                        </button>
                      )}
                      {isSuperAdmin && onDeletePlan && (
                        <button className="btn btn-outline" type="button" disabled={isCurrent || busy} onClick={() => void onDeletePlan(plan)}>
                          Delete
                        </button>
                      )}
                      {isSuperAdmin ? (
                        <button className="btn btn-primary" type="button" disabled={isCurrent || !fits || working || busy} onClick={() => void assign(plan)}>
                          {isCurrent ? 'Current Plan' : 'Assign manually'}
                        </button>
                      ) : freePlan ? (
                        <button className="btn btn-primary" type="button" disabled={!fits || working || busy || (isCurrent && active)} onClick={() => void activateFreePlan(plan)}>
                          {isCurrent && active ? 'Current Plan' : 'Activate free plan'}
                        </button>
                      ) : (
                        <button className="btn btn-primary" type="button" disabled={!fits || working || busy} onClick={() => openCheckout(plan.id)}>
                          {isCurrent && active ? 'Renew in checkout' : 'Choose plan'}
                        </button>
                      )}
                    </footer>
                  </article>
                );
              })}
            </div>
            {!planOptions.length && <div className="vop-payment-empty">No active subscription plans are available.</div>}
          </section>
        </>
      )}
    </div>
  );
}
