import { describe, expect, it } from 'vitest';
import { ProofingService } from '../src/services/proofing-service.js';
import { DeliveryService } from '../src/services/delivery-service.js';
import type { PhotographerContext, ClientContext } from '../src/auth/context.js';
import { ValidationError } from '../src/errors.js';

describe('Proofing & Delivery Domain Invariants', () => {
  const photographerOwner: PhotographerContext = {
    userId: 'user-owner-id',
    studioId: 'studio-1-id',
    role: 'owner',
    sessionToken: 'token-1',
  };

  const clientAuth: ClientContext = {
    clientSessionId: 'session-1-id',
    galleryAccessId: 'access-1-id',
    galleryId: 'gallery-1-id',
    permission: 'view_download',
  };

  it('rejects proofing revision if revision note is missing', async () => {
    const mockDb = {
      query: async (sql: string) => {
        if (sql.includes('galleries g')) {
          return { rows: [{ role: 'owner', galleryRole: 'owner', studio_id: 'studio-1-id' }] };
        }
        return { rows: [] };
      },
      connect: async () => ({} as any),
    };

    const proofingService = new ProofingService(mockDb as any);

    await expect(
      proofingService.setReview(photographerOwner, 'gallery-1-id', 'photo-1-id', 'needs_revision', '')
    ).rejects.toThrow(ValidationError);
  });

  it('prevents delivery preparation when unapproved photos exist', async () => {
    const mockDb = {
      query: async (sql: string) => {
        if (sql.includes('galleries g')) {
          return { rows: [{ role: 'owner', galleryRole: 'owner', studio_id: 'studio-1-id' }] };
        }
        if (sql.includes('UNAPPROVED') || sql.includes('pr.status IS NULL OR pr.status != \'approved\'')) {
          return {
            rows: [{ id: 'photo-unapproved-id', status: 'pending' }],
          };
        }
        return { rows: [] };
      },
      connect: async () => ({} as any),
    };

    const deliveryService = new DeliveryService(mockDb as any);

    await expect(
      deliveryService.prepareDelivery(photographerOwner, 'gallery-1-id')
    ).rejects.toThrow(ValidationError);
  });

  it('returns empty/unreleased delivery if not yet explicitly released to client', async () => {
    const mockDb = {
      query: async () => ({ rows: [] }),
      connect: async () => ({} as any),
    };

    const deliveryService = new DeliveryService(mockDb as any);
    const result = await deliveryService.getClientDelivery(clientAuth, 'gallery-1-id');

    expect(result.isReleased).toBe(false);
    expect(result.items).toEqual([]);
  });
});
