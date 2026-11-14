import { randomUUID } from "node:crypto";
import type {
  StaffAuditEvent,
  StaffMemberList,
  StaffMetricsOverview,
  StaffPlan,
  StaffPublicationRow,
  StaffTouchpointDetail,
  StaffTouchpointRow,
  StaffWorkspaceDetail,
  StaffWorkspaceRow,
} from "@kardo/contracts";

export const staffIdentity = {
  subject: "e6abf26a-3263-4149-9d75-9b7441165d29",
  email: "operator@kardo.test",
};

const now = () => new Date().toISOString();

export function metricsOverviewFixture(): StaffMetricsOverview {
  return {
    days: 30,
    generatedAt: now(),
    totals: {
      customers: 10,
      workspaces: 5,
      organizations: 1,
      touchpoints: 20,
      activeTouchpoints: 15,
      suspendedTouchpoints: 1,
      experiences: 8,
      liveExperiences: 6,
      leads: 40,
      pendingPublications: 2,
      failedPublicationsLast24Hours: 0,
    },
    period: {
      newCustomers: 3,
      newWorkspaces: 1,
      newTouchpoints: 4,
      publications: 6,
      leads: 9,
      previousNewCustomers: 2,
      previousNewTouchpoints: 3,
      previousPublications: 5,
      previousLeads: 7,
    },
    daily: [],
    taps: null,
    experienceTypes: [],
    touchpointStatuses: [],
    plans: [],
    topWorkspaces: [],
    publicationHealth: {
      succeeded: 5,
      failed: 1,
      pending: 2,
      successRate: 5 / 6,
      medianSeconds: 120,
    },
  };
}

export function workspaceRowFixture(
  overrides: Partial<StaffWorkspaceRow> = {},
): StaffWorkspaceRow {
  return {
    id: randomUUID(),
    publicId: "workspacepublicid0000001",
    name: "Acme Cafe",
    kind: "organization",
    createdAt: now(),
    ownerEmail: "owner@acme.test",
    members: 3,
    touchpoints: 5,
    activeTouchpoints: 4,
    suspendedTouchpoints: 0,
    experiences: 2,
    leads: 10,
    planCode: "beta",
    lastActivityAt: now(),
    ...overrides,
  };
}

export function workspaceDetailFixture(
  overrides: Partial<StaffWorkspaceDetail> = {},
): StaffWorkspaceDetail {
  return {
    workspace: workspaceRowFixture(),
    members: [],
    touchpoints: [],
    experiences: [],
    plan: null,
    leads: { total: 0, last30Days: 0 },
    taps30Days: null,
    recentAudit: [],
    ...overrides,
  };
}

export function touchpointRowFixture(
  overrides: Partial<StaffTouchpointRow> = {},
): StaffTouchpointRow {
  return {
    id: randomUUID(),
    publicId: "touchpointpublicid00001",
    workspaceId: randomUUID(),
    workspaceName: "Acme Cafe",
    operationalName: "Mesa 1",
    physicalType: "card",
    status: "active",
    suspended: false,
    groupName: null,
    liveExperienceName: "Menu",
    liveExperienceType: "menu",
    lastPublicationStatus: "published",
    createdAt: now(),
    ...overrides,
  };
}

export function touchpointDetailFixture(
  overrides: Partial<StaffTouchpointDetail> = {},
): StaffTouchpointDetail {
  return {
    touchpoint: touchpointRowFixture(),
    urls: {
      link: "https://resolver.kardo.invalid/t/touchpointpublicid00001",
      nfc: "https://resolver.kardo.invalid/t/touchpointpublicid00001?src=nfc",
      qr: "https://resolver.kardo.invalid/t/touchpointpublicid00001?src=qr",
    },
    suspension: null,
    publications: [],
    taps30Days: null,
    ...overrides,
  };
}

export function publicationRowFixture(
  overrides: Partial<StaffPublicationRow> = {},
): StaffPublicationRow {
  return {
    id: randomUUID(),
    touchpointId: randomUUID(),
    touchpointPublicId: "touchpointpublicid00001",
    touchpointName: "Mesa 1",
    workspaceId: randomUUID(),
    workspaceName: "Acme Cafe",
    experienceId: randomUUID(),
    experienceName: "Menu",
    experienceType: "menu",
    versionRevision: 1,
    status: "failed",
    jobStatus: "failed",
    attempts: 3,
    lastError: "boom",
    createdAt: now(),
    publishedAt: null,
    ...overrides,
  };
}

export function auditEventFixture(
  overrides: Partial<StaffAuditEvent> = {},
): StaffAuditEvent {
  return {
    id: randomUUID(),
    occurredAt: now(),
    workspaceId: randomUUID(),
    workspaceName: "Acme Cafe",
    actorType: "staff",
    actorSubject: staffIdentity.subject,
    actorEmail: staffIdentity.email,
    action: "staff.touchpoint_suspended",
    targetType: "touchpoint",
    targetId: randomUUID(),
    result: "succeeded",
    metadata: {},
    ...overrides,
  };
}

export function planFixture(overrides: Partial<StaffPlan> = {}): StaffPlan {
  return {
    id: randomUUID(),
    code: "beta",
    name: "Beta",
    isActive: true,
    entitlements: { "touchpoints.max": 10 },
    description: null,
    isPublic: false,
    isDefault: false,
    sortOrder: 0,
    trialDays: null,
    workspaces: 2,
    prices: [],
    createdAt: now(),
    ...overrides,
  };
}

export function staffMemberListFixture(): StaffMemberList {
  return [
    {
      id: staffIdentity.subject,
      email: staffIdentity.email,
      displayName: "Operaciones Kardo",
      status: "active",
      roles: ["operations"],
      createdAt: now(),
    },
  ];
}
