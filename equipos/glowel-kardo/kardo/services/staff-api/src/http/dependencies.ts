import type { PublisherKick } from "../clients/publisher-kick.js";
import type { ResolverSuspensionClient } from "../clients/resolver-suspension.js";
import type { StatusWorkerClient } from "../clients/status-worker.js";
import type { StaffAuditRepository } from "../repositories/audit.js";
import type { StaffBillingRepository } from "../repositories/billing.js";
import type { StaffMetricsRepository } from "../repositories/metrics.js";
import type { StaffNotificationRepository } from "../repositories/notifications.js";
import type { StaffPieceRepository } from "../repositories/pieces.js";
import type { StaffPlanRepository } from "../repositories/plans.js";
import type { StaffPublicationRepository } from "../repositories/publications.js";
import type { SessionRepository } from "../repositories/session.js";
import type { StaffMemberRepository } from "../repositories/staff-members.js";
import type { StaffStatusRepository } from "../repositories/status.js";
import type { StaffTouchpointRepository } from "../repositories/touchpoints.js";
import type { StaffWorkspaceRepository } from "../repositories/workspaces.js";
import type { StaffSessionVerifier } from "../staff-session.js";

/** Every dependency a route module needs, gathered in one place so `app.ts`
 * builds them once and each `routes/*.ts` module stays a plain function of
 * `(app, deps)`. */
export type AppDependencies = {
  sessionVerifier: StaffSessionVerifier;
  sessionRepository: SessionRepository;
  metricsRepository: StaffMetricsRepository;
  workspaceRepository: StaffWorkspaceRepository;
  touchpointRepository: StaffTouchpointRepository;
  publicationRepository: StaffPublicationRepository;
  auditRepository: StaffAuditRepository;
  planRepository: StaffPlanRepository;
  staffMemberRepository: StaffMemberRepository;
  /** Suscripciones con Stripe (ADR 019). */
  billingRepository: StaffBillingRepository;
  /** `null` when `TAP_RESOLVER_URL`/`SUSPENSION_COMMAND_KEY` are not
   * configured; routes that need it return 503 `STAFF_DEPENDENCY_UNAVAILABLE`
   * instead of calling the repository. */
  resolverSuspension: ResolverSuspensionClient | null;
  publisherKick: PublisherKick;
  /** Notificaciones del panel (ADR 022). */
  notificationRepository: StaffNotificationRepository;
  /** Incidentes y mantenimientos (ADR 022). */
  statusRepository: StaffStatusRepository;
  /** Piezas de Kardo: lotes y archivo del taller (ADR 026). */
  pieceRepository: StaffPieceRepository;
  /** `null` without STATUS_URL/STATUS_COMMAND_KEY: Estado answers 503. */
  statusWorker: StatusWorkerClient | null;
};
