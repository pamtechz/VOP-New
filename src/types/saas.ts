export type OrganizationStatus = 'active' | 'suspended' | 'archived';
export type OrganizationMemberRole = 'owner' | 'admin' | 'editor' | 'mentor' | 'teacher' | 'learner' | 'viewer';
export type ContentSharingScope = 'private' | 'organization' | 'shared';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'suspended';

export interface OrganizationSubscription {
  id: string;
  organizationId: string;
  planId: string;
  status: SubscriptionStatus;
  startedAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: string;
  provider?: string;
  providerSubscriptionId?: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  ownerUid: string;
  createdAt: string;
  updatedAt: string;
  plan?: string;
  subscription?: OrganizationSubscription;
  quotas?: Record<string, number>;
  features?: Record<string, boolean>;
  settings?: Record<string, unknown>;
  branding?: Record<string, unknown>;
}

export interface OrganizationMembership {
  uid: string;
  organizationId: string;
  role: OrganizationMemberRole;
  active: boolean;
  invitedBy?: string;
  joinedAt: string;
  updatedAt: string;
}

export interface OwnedContentMetadata {
  ownerOrganizationId: string;
  ownerUid: string;
  sharingScope: ContentSharingScope;
  canonical: boolean;
  sourceContentId?: string;
  copiedAt?: string;
  copiedBy?: string;
}

export interface QuizDefinition extends OwnedContentMetadata {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  language: string;
  questions: Array<Record<string, unknown>>;
  published: boolean;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}
