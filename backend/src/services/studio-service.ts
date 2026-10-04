import type { AuthenticatedUserContext } from '../auth/context.js';

export type StudioMember = {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  role: 'owner' | 'admin' | 'photographer' | 'assistant';
};

export type StudioSummary = {
  id: string;
  name: string;
  owner: { id: string; email: string; displayName: string };
  memberCount: number;
};

export class StudioService {
  getStudioSummary(user: AuthenticatedUserContext): StudioSummary {
    if (user.studioId !== '22222222-2222-4222-8222-222222222222') {
      throw new Error('Studio not found for user.');
    }

    return {
      id: user.studioId,
      name: 'MJ Creative Art',
      owner: {
        id: user.userId,
        email: user.email,
        displayName: user.displayName,
      },
      memberCount: 1,
    };
  }

  getStudioMembers(): StudioMember[] {
    return [
      {
        id: '33333333-3333-4333-8333-333333333333',
        userId: '11111111-1111-4111-8111-111111111111',
        email: 'owner@example.com',
        displayName: 'Owner User',
        role: 'owner',
      },
    ];
  }
}
