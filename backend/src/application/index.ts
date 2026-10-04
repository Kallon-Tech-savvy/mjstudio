export type ActorType = 'studio_user' | 'client' | 'system';

export interface AuthorizationActor {
  type: ActorType;
  userId?: string;
  clientId?: string;
}

export interface AuthorizationResource {
  type: 'studio' | 'gallery' | 'photo' | 'gallery_access' | 'client' | 'asset';
  id: string;
  context?: Record<string, unknown>;
}

export interface AuthorizationContext {
  studioId?: string;
  galleryId?: string;
  clientId?: string;
  photoId?: string;
  [key: string]: unknown;
}

export interface AuthorizationRequest {
  actor: AuthorizationActor;
  operation: string;
  resource: AuthorizationResource;
  context?: AuthorizationContext;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason?: string;
  actor: AuthorizationActor;
  resource: AuthorizationResource;
  scope?: string[];
}

export interface AuthorizationService {
  authorize(input: AuthorizationRequest): Promise<AuthorizationDecision>;
}

export interface UseCase<In, Out> {
  execute(input: In): Promise<Out>;
}

export type UseCaseInput<T> = T;
