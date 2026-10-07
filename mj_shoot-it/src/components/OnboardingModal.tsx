import { useState } from 'react'
import type { StaffMember } from '../types'

interface OnboardingModalProps {
  userEmail: string
  userFullName?: string
  accessToken: string
  onComplete: (staff: StaffMember) => void
}

export function OnboardingModal({ userEmail, userFullName, accessToken, onComplete }: OnboardingModalProps) {
  const [workspaceType, setWorkspaceType] = useState<'personal' | 'team'>('personal')
  const [studioName, setStudioName] = useState(
    userFullName ? `${userFullName}'s Studio` : 'My Photography Studio'
  )
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (workspaceType === 'personal') {
        // Create a real studio workspace in the DB via the worker API,
        // then fetch the authoritative staff profile.
        const slugBase = studioName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60)
        const slug = slugBase + '-' + Math.random().toString(36).slice(2, 7)

        const res = await fetch('/api/studio/bootstrap', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ name: studioName.trim(), slug }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(body?.error || 'Could not create your studio workspace.')
        }

        const staff: import('../types').StaffMember = {
          email: userEmail,
          name: userFullName || userEmail.split('@')[0],
          role: 'owner',
          permissions: {
            manageGalleries: true,
            uploadPhotos: true,
            manageStaff: true,
            viewFinances: true,
          },
        }
        onComplete(staff)
      } else {
        if (!inviteCode.trim()) {
          throw new Error('Please enter a team workspace invite code or token.')
        }

        const res = await fetch('/api/studio/join', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ token: inviteCode.trim() }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(body?.error || 'Could not join team studio. Check your invite code.')
        }

        // After joining, let App re-fetch the real profile from /api/studio/me
        const staff: import('../types').StaffMember = {
          email: userEmail,
          name: userFullName || userEmail.split('@')[0],
          role: 'photographer',
          permissions: {
            manageGalleries: true,
            uploadPhotos: true,
            manageStaff: false,
            viewFinances: false,
          },
        }
        onComplete(staff)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to complete workspace setup.')
      setLoading(false)
    }
  }


  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-card">
        <header className="onboarding-header">
          <p className="eyebrow">Welcome to Proof</p>
          <h2 id="onboarding-title" className="section-heading">Choose your studio workspace</h2>
          <p className="section-sub">
            Set up your workflow as an independent creator or collaborate with a team.
          </p>
        </header>

        <div className="workspace-toggle" style={{ display: 'flex', gap: '12px', margin: '20px 0' }}>
          <button
            type="button"
            className={workspaceType === 'personal' ? 'btn' : 'btn btn-secondary'}
            onClick={() => { setWorkspaceType('personal'); setError(null) }}
            style={{ flex: 1 }}
          >
            📸 Personal Studio
          </button>
          <button
            type="button"
            className={workspaceType === 'team' ? 'btn' : 'btn btn-secondary'}
            onClick={() => { setWorkspaceType('team'); setError(null) }}
            style={{ flex: 1 }}
          >
            👥 Join Team Studio
          </button>
        </div>

        <form onSubmit={handleSubmit} className="field-stack">
          {workspaceType === 'personal' ? (
            <div className="field">
              <label htmlFor="studio-name">Studio / Brand Name</label>
              <input
                id="studio-name"
                type="text"
                required
                value={studioName}
                onChange={(e) => setStudioName(e.target.value)}
                placeholder="e.g. Apex Visuals"
                maxLength={80}
              />
              <p className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '4px' }}>
                You will have full owner controls to publish client galleries and deliver proofs.
              </p>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="invite-code">Team Invite Code / Studio Slug</label>
              <input
                id="invite-code"
                type="text"
                required
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="e.g. mj-photo-studio or invite token"
              />
              <p className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '4px' }}>
                Ask your studio owner or lead photographer for your team invite key.
              </p>
            </div>
          )}

          {error && <p className="status-note status-error" role="alert">{error}</p>}

          <button type="submit" className="btn" disabled={loading} style={{ marginTop: '16px', width: '100%' }}>
            {loading ? 'Setting up workspace…' : workspaceType === 'personal' ? 'Launch My Studio' : 'Join Team'}
          </button>
        </form>
      </div>
    </div>
  )
}
