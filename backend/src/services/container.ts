import type { Pool } from 'pg';
import type { PasswordVerifier, PhotographerAuthService } from './photographer-auth-service.js';
import { PhotographerAuthService as AuthService, PostgresScryptPasswordVerifier } from './photographer-auth-service.js';
import { GalleryService } from './gallery-service.js';
import { PhotoService, type PhotoStorage } from './photo-service.js';
import { ClientSessionService, GalleryAccessService, type AccessCredentialDelivery, type PinAttemptLimiter } from './client-access-service.js';
import { DownloadService, FeedbackService, RecommendationService, SelectionService } from './client-workflow-services.js';
import { ServiceUnavailableError } from '../errors.js';
import { CatalogService } from './catalog-service.js';
import { PostgresRateLimitService } from './rate-limit-service.js';
import { JobService } from './job-service.js';
import { PhotoRepresentationService } from './photo-representation-service.js';
import { ProofingService } from './proofing-service.js';

export type ApplicationServices = {
  auth: PhotographerAuthService;
  galleries: GalleryService;
  photos: PhotoService;
  galleryAccess: GalleryAccessService;
  clientSessions: ClientSessionService;
  selections: SelectionService;
  recommendations: RecommendationService;
  downloads: DownloadService;
  feedback: FeedbackService;
  proofing: ProofingService;
  catalog: CatalogService;
  rateLimits: RateLimitProvider;
  jobs: JobService;
};

export interface RateLimitProvider {
  assertAllowed(key: string, scope: 'login' | 'client-access' | 'access-reset' | 'download' | 'feedback'): Promise<void>;
}

export type ServiceProviders = {
  database: Pool;
  passwords: PasswordVerifier;
  photoStorage: PhotoStorage;
  accessDelivery: AccessCredentialDelivery;
  pinAttemptLimiter: PinAttemptLimiter;
  rateLimits: RateLimitProvider;
};

export function createApplicationServices(providers: ServiceProviders): ApplicationServices {
  return {
    auth: new AuthService(providers.database, providers.passwords),
    galleries: new GalleryService(providers.database),
    photos: new PhotoService(providers.database, providers.photoStorage, new JobService(providers.database)),
    galleryAccess: new GalleryAccessService(providers.database, providers.accessDelivery),
    clientSessions: new ClientSessionService(providers.database, providers.pinAttemptLimiter),
    selections: new SelectionService(providers.database),
    recommendations: new RecommendationService(providers.database),
    downloads: new DownloadService(providers.database, providers.photoStorage),
    feedback: new FeedbackService(providers.database),
    proofing: new ProofingService(providers.database),
    catalog: new CatalogService(
      providers.database,
      new PhotoRepresentationService(providers.photoStorage),
    ),
    rateLimits: providers.rateLimits,
    jobs: new JobService(providers.database),
  };
}

export function unavailableServices(): ApplicationServices {
  const unavailable = async (): Promise<never> => { throw new ServiceUnavailableError(); };
  return {
    auth: { login: unavailable, resolve: unavailable, logout: unavailable } as unknown as PhotographerAuthService,
    galleries: { create: unavailable, get: unavailable, update: unavailable, publish: unavailable, archive: unavailable } as unknown as GalleryService,
    photos: { create: unavailable, get: unavailable, update: unavailable, delete: unavailable, reorder: unavailable, uploadComplete: unavailable, list: unavailable, resolveGalleryId: unavailable } as unknown as PhotoService,
    galleryAccess: { create: unavailable, get: unavailable, reset: unavailable, revoke: unavailable, resend: unavailable } as unknown as GalleryAccessService,
    clientSessions: { create: unavailable, resolve: unavailable, revoke: unavailable } as unknown as ClientSessionService,
    selections: { setSelection: unavailable, getSelections: unavailable, getSelection: unavailable, submitSelection: unavailable } as unknown as SelectionService,
    recommendations: { recommend: unavailable, unrecommend: unavailable, list: unavailable } as unknown as RecommendationService,
    downloads: { create: unavailable } as unknown as DownloadService,
    feedback: { createGalleryFeedback: unavailable, createPhotoFeedback: unavailable, listForStudio: unavailable } as unknown as FeedbackService,
    proofing: { setReview: unavailable, list: unavailable } as unknown as ProofingService,
    catalog: { listClients: unavailable, getClient: unavailable, createClient: unavailable, updateClient: unavailable, listGalleries: unavailable, listPhotos: unavailable, getClientGallery: unavailable, listClientPhotos: unavailable, getStudioSummary: unavailable, listStudioMembers: unavailable } as unknown as CatalogService,
    rateLimits: { assertAllowed: unavailable },
    jobs: { enqueue: unavailable, enqueueInTransaction: unavailable, claim: unavailable, heartbeat: unavailable, complete: unavailable, fail: unavailable } as unknown as JobService,
  };
}

export function unavailableProviders(database: Pool): ServiceProviders {
  const unavailable = async (): Promise<never> => { throw new ServiceUnavailableError('External storage, delivery, or processing provider is not configured.'); };
  const rateLimits = new PostgresRateLimitService(database);
  return {
    database,
    passwords: new PostgresScryptPasswordVerifier(database),
    photoStorage: {
      createUploadCapability: unavailable,
      verifyObject: unavailable,
      createViewCapability: unavailable,
      createDownloadCapability: unavailable,
    },
    accessDelivery: { deliver: unavailable, resend: unavailable },
    pinAttemptLimiter: { assertAllowed: (key) => rateLimits.assertAllowed(key, 'client-access') },
    rateLimits,
  };
}