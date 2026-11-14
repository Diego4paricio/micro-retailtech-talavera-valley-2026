import type { FacturapiClient } from "@kardo/billing";
import type { FirstVisitFinder } from "../analytics-engine.js";
import type { AssetRepository, AssetWorkerClient } from "../assets.js";
import type { FiscalRepository } from "../billing/fiscal.js";
import type { PlanSelectionRepository } from "../billing/plan-selection.js";
import type { BillingService } from "../billing/service.js";
import type { CustomHtmlBudget } from "../custom-html/budget.js";
import type { CustomHtmlLimiter } from "../custom-html/limiter.js";
import type { CustomHtmlModel } from "../custom-html/model.js";
import type { CustomHtmlUserLimits } from "../custom-html/user-limits.js";
import type {
  CustomerSessionVerifier,
  SessionStateLookup,
} from "../customer-session.js";
import type { HelpAssistant } from "../help/assistant.js";
import type { InvitationMailer } from "../invitation-mailer.js";
import type { PublisherKick } from "../publisher-kick.js";
import type { RateLimiters } from "../rate-limit.js";
import type { AccountRepository } from "../repositories/account.js";
import type { AnalyticsRepository } from "../repositories/analytics.js";
import type { BusinessSlugRepository } from "../repositories/business-slug.js";
import type { CustomHtmlAssistantRepository } from "../repositories/custom-html.js";
import type { DashboardRepository } from "../repositories/dashboard.js";
import type { ExperienceRepository } from "../repositories/experiences.js";
import type { TouchpointGroupRepository } from "../repositories/groups.js";
import type { ItemAvailabilityRepository } from "../repositories/item-availability.js";
import type { KardoPieceRepository } from "../repositories/kardo-pieces.js";
import type { LeadDeliveryRepository } from "../repositories/lead-delivery.js";
import type { LeadRepository } from "../repositories/leads.js";
import type { LinkRepository } from "../repositories/links.js";
import type { MemberRepository } from "../repositories/members.js";
import type { NotificationRepository } from "../repositories/notifications.js";
import type { ProfileRepository } from "../repositories/profile.js";
import type { QrDesignRepository } from "../repositories/qr-designs.js";
import type { TouchpointRepository } from "../repositories/touchpoints.js";
import type { WorkspaceProfileRepository } from "../repositories/workspace-profile.js";
import type { CustomerWorkspaceRepository } from "../repositories/workspaces.js";
import type { TouchpointAvailabilityClient } from "../resolver-clients/touchpoint-availability.js";
import type { WorkspaceExporter } from "../workspace-export.js";

/** Every dependency a route module needs, gathered in one place so
 * `app.ts` builds them once and each `routes/*.ts` module stays a plain
 * function of `(app, deps)`. */
export type AppDependencies = {
  sessionVerifier: CustomerSessionVerifier;
  /** Lets the account routes drop a session they close (ADR 023). */
  sessionStates: SessionStateLookup;
  profileRepository: ProfileRepository;
  /** Tu cuenta → Seguridad: sessions and sign-in history (ADR 023). */
  accountRepository: AccountRepository;
  /** Retires the QR pages and removes the files of deleted spaces (R2 and
   * the Resolver); null without those clients. */
  deletionCleanup: (() => Promise<unknown>) | null;
  workspaceRepository: CustomerWorkspaceRepository;
  workspaceProfileRepository: WorkspaceProfileRepository;
  workspaceExporter: WorkspaceExporter;
  businessSlugRepository: BusinessSlugRepository;
  linkRepository: LinkRepository;
  memberRepository: MemberRepository;
  touchpointRepository: TouchpointRepository;
  /** «Producto de Kardo» (ADR 026). */
  kardoPieceRepository: KardoPieceRepository;
  qrDesignRepository: QrDesignRepository;
  groupRepository: TouchpointGroupRepository;
  experienceRepository: ExperienceRepository;
  assetRepository: AssetRepository;
  assetWorker: AssetWorkerClient | null;
  touchpointAvailability: TouchpointAvailabilityClient | null;
  /** «Pruébalo» (relevo 36): null without Analytics Engine. */
  touchpointObjectProbe?: FirstVisitFinder | null;
  leadRepository: LeadRepository;
  leadDeliveryRepository: LeadDeliveryRepository;
  analyticsRepository: AnalyticsRepository;
  dashboardRepository: DashboardRepository;
  /** The bell in the panel header (ADR 022). */
  notificationRepository: NotificationRepository;
  itemAvailabilityRepository: ItemAvailabilityRepository;
  rateLimiters: RateLimiters;
  publisherKick: PublisherKick;
  invitationMailer: InvitationMailer;
  helpAssistant: HelpAssistant;
  /** Estudio de Experiences, modo HTML: "Pídele a la IA de Kardo" (ADR 018,
   * extended 2026-09-29). `customHtmlModel` is `null` when no provider is
   * configured or `CUSTOM_HTML_AI_ENABLED=false` (503 AI_UNAVAILABLE). */
  customHtmlModel: CustomHtmlModel | null;
  customHtmlAssistantRepository: CustomHtmlAssistantRepository;
  customHtmlLimiter: CustomHtmlLimiter;
  customHtmlBudget: CustomHtmlBudget;
  customHtmlUserLimits: CustomHtmlUserLimits;
  /** Suscripciones con Stripe (ADR 019). */
  billing: BillingService;
  /** Bajada de plan, opción B (ADR 023). */
  planSelection: PlanSelectionRepository;
  /** Datos fiscales y solicitudes de CFDI (ADR 020 §6). */
  fiscal: FiscalRepository;
  /** CFDI con Facturapi: descarga del PDF y el XML. Null sin FACTURAPI_KEY. */
  facturapi: FacturapiClient | null;
  /** Customer panel origin, used to build links sent by email. */
  customerAppOrigin: string;
};
