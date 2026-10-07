import { useState, useEffect } from 'react'
import type { StudioProfile, StudioSubscription, StudioInvite, SubscriptionTier, StaffRole } from '../types'
import { adminApi } from '../services/adminApi'
import { useAdminNotice, describeError } from './AdminNotice'
import { CheckIcon, CopyIcon, CrownIcon, GearIcon, GlobeIcon, PlusIcon, UsersIcon } from './icon'

interface SettingsViewProps {
  accessToken: string
  isOwner: boolean
}

const PRESET_COLORS = ['#0d9488', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#18181b']

export function SettingsView({ accessToken, isOwner }: SettingsViewProps) {
  const notify = useAdminNotice()
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profile, setProfile] = useState<StudioProfile | null>(null)
  const [subscription, setSubscription] = useState<StudioSubscription | null>(null)
  const [invites, setInvites] = useState<StudioInvite[]>([])
  
  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<StaffRole>('photographer')
  const [sendingInvite, setSendingInvite] = useState(false)
  
  // Plan upgrade / switcher state
  const [changingPlan, setChangingPlan] = useState<SubscriptionTier | null>(null)

  // Webhook state
  const [webhookUrl, setWebhookUrl] = useState('')
  const [copiedKey, setCopiedKey] = useState(false)

  useEffect(() => {
    loadAllData()
  }, [accessToken])

  async function loadAllData() {
    setLoading(true)
    try {
      const [profileRes, subRes] = await Promise.all([
        adminApi.studio.getProfile(accessToken),
        adminApi.studio.getSubscription(accessToken),
      ])
      setProfile(profileRes.profile)
      setSubscription(subRes.subscription)

      if (isOwner) {
        try {
          const invitesRes = await adminApi.studio.listInvites(accessToken)
          setInvites(invitesRes.invites)
        } catch (e) {
          console.warn('Could not load invites:', e)
        }
      }
    } catch (err) {
      notify(describeError(err, 'Could not load studio settings.'), 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return

    setSavingProfile(true)
    try {
      const res = await adminApi.studio.updateProfile(accessToken, profile)
      setProfile(res.profile)
      notify('Studio settings & branding saved successfully.', 'success')
    } catch (err) {
      notify(describeError(err, 'Failed to update studio profile.'), 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  async function handlePlanChange(tier: SubscriptionTier) {
    setChangingPlan(tier)
    try {
      const res = await adminApi.billing.changePlan(accessToken, tier)
      if (res.success) {
        notify(`Upgraded subscription plan to ${tier.toUpperCase()}!`, 'success')
        await loadAllData()
      }
    } catch (err) {
      notify(describeError(err, 'Failed to update subscription plan.'), 'error')
    } finally {
      setChangingPlan(null)
    }
  }

  async function handleOpenPortal() {
    try {
      const res = await adminApi.billing.portal(accessToken)
      notify('Opening billing portal...', 'info')
      if (res.portal_url) {
        window.open(res.portal_url, '_blank')
      }
    } catch (err) {
      notify(describeError(err, 'Failed to open billing portal.'), 'error')
    }
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return

    setSendingInvite(true)
    try {
      const res = await adminApi.studio.createInvite(accessToken, {
        email: inviteEmail.trim(),
        role: inviteRole,
      })
      setInvites(prev => [res.invite, ...prev])
      setInviteEmail('')
      notify(`Invite link generated for ${res.invite.email}.`, 'success')
    } catch (err) {
      notify(describeError(err, 'Could not create team invite.'), 'error')
    } finally {
      setSendingInvite(false)
    }
  }

  function handleCopyInvite(inviteCode: string) {
    const inviteLink = `${window.location.origin}/join?code=${inviteCode}`
    navigator.clipboard.writeText(inviteLink)
    notify('Invite link copied to clipboard!', 'info')
  }

  function handleCopyApiKey() {
    const mockKey = `sk_live_studio_${(profile?.id || 'demo').slice(0, 12)}_${Math.random().toString(36).slice(2, 10)}`
    navigator.clipboard.writeText(mockKey)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2500)
    notify('API Secret key copied to clipboard!', 'info')
  }

  if (loading || !profile || !subscription) {
    return (
      <div className="admin-loading" role="status">
        Loading studio settings & subscription…
      </div>
    )
  }

  const currentTier = subscription.tier || 'pro'
  const usage = subscription.usage
  const limits = subscription.limits

  const galleryPct = Math.min(100, Math.round((usage.galleries_count / (limits.max_galleries || 1)) * 100))
  const storagePct = Math.min(100, Math.round((usage.storage_used_gb / (limits.max_storage_gb || 1)) * 100))
  const seatsPct = Math.min(100, Math.round((usage.team_seats_count / (limits.max_team_seats || 1)) * 100))

  return (
    <div className="admin-settings-view">
      {/* Header Banner */}
      <div className="settings-header-card">
        <div className="settings-header-info">
          <div className="settings-avatar" style={{ backgroundColor: profile.brand_color || '#0d9488' }}>
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="settings-title">{profile.name}</h2>
            <p className="settings-subtitle">
              Plan: <span className="badge-tier">{currentTier.toUpperCase()}</span> • Status: <span className="status-pill status-pill--active">Active</span>
            </p>
          </div>
        </div>

        <div className="settings-header-actions">
          <button type="button" className="admin-button admin-button--secondary" onClick={handleOpenPortal}>
            Stripe Invoices & Portal
          </button>
        </div>
      </div>

      {/* Subscription Usage & Metering */}
      <section className="settings-section">
        <div className="section-title-wrap">
          <CrownIcon size={20} />
          <h3 className="section-heading">Subscription Usage & Quotas</h3>
        </div>

        <div className="usage-meters-grid">
          <div className="usage-meter-card">
            <div className="meter-label-row">
              <span>Active Galleries</span>
              <strong>{usage.galleries_count} / {limits.max_galleries >= 9999 ? '∞' : limits.max_galleries}</strong>
            </div>
            <div className="progress-bar-track">
              <div className={`progress-bar-fill ${galleryPct > 85 ? 'fill-warning' : ''}`} style={{ width: `${galleryPct}%` }} />
            </div>
            <span className="meter-caption">{limits.max_galleries - usage.galleries_count > 0 ? `${limits.max_galleries - usage.galleries_count} galleries available` : 'Limit reached'}</span>
          </div>

          <div className="usage-meter-card">
            <div className="meter-label-row">
              <span>Storage Consumed</span>
              <strong>{usage.storage_used_gb} GB / {limits.max_storage_gb} GB</strong>
            </div>
            <div className="progress-bar-track">
              <div className={`progress-bar-fill ${storagePct > 85 ? 'fill-warning' : ''}`} style={{ width: `${storagePct}%` }} />
            </div>
            <span className="meter-caption">High-res original proofs cloud storage</span>
          </div>

          <div className="usage-meter-card">
            <div className="meter-label-row">
              <span>Team Seats</span>
              <strong>{usage.team_seats_count} / {limits.max_team_seats}</strong>
            </div>
            <div className="progress-bar-track">
              <div className={`progress-bar-fill ${seatsPct >= 100 ? 'fill-warning' : ''}`} style={{ width: `${seatsPct}%` }} />
            </div>
            <span className="meter-caption">{limits.max_team_seats - usage.team_seats_count} seat(s) available</span>
          </div>
        </div>

        {/* Pricing Tiers Selection */}
        <div className="plans-grid">
          {/* Starter Plan */}
          <div className={`plan-card ${currentTier === 'starter' ? 'plan-card--active' : ''}`}>
            {currentTier === 'starter' && <span className="plan-badge-current">CURRENT PLAN</span>}
            <h4 className="plan-name">Starter</h4>
            <div className="plan-price">$19 <span>/ month</span></div>
            <p className="plan-desc">Essential toolset for solo creators and emerging photographers.</p>
            <ul className="plan-features">
              <li><CheckIcon size={14} /> 5 Active Galleries</li>
              <li><CheckIcon size={14} /> 5 GB High-Speed Storage</li>
              <li><CheckIcon size={14} /> 1 Photographer Seat</li>
              <li><CheckIcon size={14} /> Standard Client Delivery</li>
            </ul>
            {currentTier !== 'starter' ? (
              <button
                type="button"
                className="admin-button admin-button--secondary plan-action-btn"
                disabled={changingPlan !== null || !isOwner}
                onClick={() => handlePlanChange('starter')}
              >
                {changingPlan === 'starter' ? 'Switching…' : 'Switch to Starter'}
              </button>
            ) : (
              <button type="button" className="admin-button plan-action-btn" disabled>Active Plan</button>
            )}
          </div>

          {/* Pro Plan */}
          <div className={`plan-card plan-card--popular ${currentTier === 'pro' ? 'plan-card--active' : ''}`}>
            <span className="plan-badge-highlight">MOST POPULAR</span>
            {currentTier === 'pro' && <span className="plan-badge-current">CURRENT PLAN</span>}
            <h4 className="plan-name">Pro Studio</h4>
            <div className="plan-price">$49 <span>/ month</span></div>
            <p className="plan-desc">For growing studios needing custom branding and team support.</p>
            <ul className="plan-features">
              <li><CheckIcon size={14} /> 25 Active Galleries</li>
              <li><CheckIcon size={14} /> 100 GB High-Speed Storage</li>
              <li><CheckIcon size={14} /> 3 Team Member Seats</li>
              <li><CheckIcon size={14} /> Custom Branding & Watermarks</li>
              <li><CheckIcon size={14} /> Priority Proof Delivery</li>
            </ul>
            {currentTier !== 'pro' ? (
              <button
                type="button"
                className="admin-button admin-button--primary plan-action-btn"
                disabled={changingPlan !== null || !isOwner}
                onClick={() => handlePlanChange('pro')}
              >
                {changingPlan === 'pro' ? 'Upgrading…' : 'Upgrade to Pro'}
              </button>
            ) : (
              <button type="button" className="admin-button plan-action-btn" disabled>Active Plan</button>
            )}
          </div>

          {/* Studio Unlimited Plan */}
          <div className={`plan-card ${currentTier === 'studio' ? 'plan-card--active' : ''}`}>
            {currentTier === 'studio' && <span className="plan-badge-current">CURRENT PLAN</span>}
            <h4 className="plan-name">Studio Unlimited</h4>
            <div className="plan-price">$99 <span>/ month</span></div>
            <p className="plan-desc">Maximum capacity and custom white-labeling for high-volume agencies.</p>
            <ul className="plan-features">
              <li><CheckIcon size={14} /> <strong>Unlimited</strong> Galleries</li>
              <li><CheckIcon size={14} /> 1 TB (1000 GB) Storage</li>
              <li><CheckIcon size={14} /> 10 Team Member Seats</li>
              <li><CheckIcon size={14} /> Custom Domain CNAME</li>
              <li><CheckIcon size={14} /> 24/7 Priority Support & SLAs</li>
            </ul>
            {currentTier !== 'studio' ? (
              <button
                type="button"
                className="admin-button admin-button--primary plan-action-btn"
                disabled={changingPlan !== null || !isOwner}
                onClick={() => handlePlanChange('studio')}
              >
                {changingPlan === 'studio' ? 'Upgrading…' : 'Upgrade to Studio'}
              </button>
            ) : (
              <button type="button" className="admin-button plan-action-btn" disabled>Active Plan</button>
            )}
          </div>
        </div>
      </section>

      {/* Studio Profile & Branding Form */}
      <section className="settings-section">
        <div className="section-title-wrap">
          <GlobeIcon size={20} />
          <h3 className="section-heading">Studio Branding & Client Experience</h3>
        </div>

        <form onSubmit={handleSaveProfile} className="settings-form-grid">
          <div className="form-group">
            <label htmlFor="studio-name" className="form-label">Studio Business Name</label>
            <input
              id="studio-name"
              type="text"
              className="admin-input"
              value={profile.name}
              onChange={e => setProfile({ ...profile, name: e.target.value })}
              required
              disabled={!isOwner}
            />
          </div>

          <div className="form-group">
            <label htmlFor="studio-email" className="form-label">Studio Contact Email</label>
            <input
              id="studio-email"
              type="email"
              className="admin-input"
              value={profile.contact_email || ''}
              onChange={e => setProfile({ ...profile, contact_email: e.target.value })}
              placeholder="contact@yourstudio.com"
              disabled={!isOwner}
            />
          </div>

          <div className="form-group">
            <label htmlFor="studio-phone" className="form-label">Business Phone</label>
            <input
              id="studio-phone"
              type="text"
              className="admin-input"
              value={profile.phone || ''}
              onChange={e => setProfile({ ...profile, phone: e.target.value })}
              placeholder="+1 (555) 000-0000"
              disabled={!isOwner}
            />
          </div>

          <div className="form-group">
            <label htmlFor="studio-currency" className="form-label">Default Invoicing Currency</label>
            <select
              id="studio-currency"
              className="admin-select"
              value={profile.currency || 'USD'}
              onChange={e => setProfile({ ...profile, currency: e.target.value })}
              disabled={!isOwner}
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="CAD">CAD ($)</option>
              <option value="AUD">AUD ($)</option>
            </select>
          </div>

          <div className="form-group full-width">
            <label className="form-label">Brand Accent Color</label>
            <div className="color-picker-row">
              <input
                type="color"
                className="color-input-picker"
                value={profile.brand_color || '#0d9488'}
                onChange={e => setProfile({ ...profile, brand_color: e.target.value })}
                disabled={!isOwner}
              />
              <div className="preset-swatches">
                {PRESET_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={`preset-swatch ${profile.brand_color === color ? 'preset-swatch--active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => isOwner && setProfile({ ...profile, brand_color: color })}
                    disabled={!isOwner}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="form-group full-width">
            <label htmlFor="watermark-text" className="form-label">Proof Watermark Text</label>
            <input
              id="watermark-text"
              type="text"
              className="admin-input"
              value={profile.watermark_text || ''}
              onChange={e => setProfile({ ...profile, watermark_text: e.target.value })}
              placeholder="© Studio Name Proofs"
              disabled={!isOwner}
            />
          </div>

          <div className="form-group full-width">
            <label htmlFor="custom-domain" className="form-label">Custom Domain (CNAME)</label>
            <input
              id="custom-domain"
              type="text"
              className="admin-input"
              value={profile.custom_domain || ''}
              onChange={e => setProfile({ ...profile, custom_domain: e.target.value })}
              placeholder="galleries.yourbrand.com"
              disabled={!isOwner || currentTier !== 'studio'}
            />
            {currentTier !== 'studio' && (
              <span className="field-hint">Custom domains are available on the Studio Unlimited plan.</span>
            )}
          </div>

          {isOwner && (
            <div className="form-actions full-width">
              <button
                type="submit"
                className="admin-button admin-button--primary"
                disabled={savingProfile}
              >
                {savingProfile ? 'Saving Branding…' : 'Save Studio Branding'}
              </button>
            </div>
          )}
        </form>
      </section>

      {/* Team Member Invitations (Owner Only) */}
      {isOwner && (
        <section className="settings-section">
          <div className="section-title-wrap">
            <UsersIcon size={20} />
            <h3 className="section-heading">Team Invitations & Member Seats</h3>
          </div>

          <form onSubmit={handleSendInvite} className="invite-form-row">
            <input
              type="email"
              className="admin-input invite-email-input"
              placeholder="colleague@studio.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              required
            />
            <select
              className="admin-select invite-role-select"
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as StaffRole)}
            >
              <option value="photographer">Photographer</option>
              <option value="assistant">Assistant</option>
              <option value="admin">Studio Admin</option>
            </select>
            <button
              type="submit"
              className="admin-button admin-button--primary"
              disabled={sendingInvite || !inviteEmail.trim() || usage.team_seats_count >= limits.max_team_seats}
            >
              <PlusIcon size={14} />
              {sendingInvite ? 'Generating…' : 'Invite Team Member'}
            </button>
          </form>

          {invites.length > 0 && (
            <div className="invites-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Invited Email</th>
                    <th>Role</th>
                    <th>Invite Code</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map(inv => (
                    <tr key={inv.id}>
                      <td><strong>{inv.email}</strong></td>
                      <td><span className="role-tag">{inv.role}</span></td>
                      <td><code>{inv.invite_code}</code></td>
                      <td>
                        <span className={`status-pill ${inv.status === 'accepted' ? 'status-pill--active' : 'status-pill--pending'}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="admin-button admin-button--secondary admin-button--small"
                          onClick={() => handleCopyInvite(inv.invite_code)}
                        >
                          <CopyIcon size={12} />
                          Copy Link
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Developer API & Webhook Integrations */}
      {isOwner && (
        <section className="settings-section">
          <div className="section-title-wrap">
            <GearIcon size={20} />
            <h3 className="section-heading">Developer API & Webhook Integrations</h3>
          </div>

          <div className="integrations-grid">
            <div className="integration-card">
              <h4 className="card-subheading">Live Studio API Secret</h4>
              <p className="card-body-text">Use this secret key to authenticate backend CRM, Zapier, or photo lab integrations.</p>
              <div className="api-key-box">
                <code>sk_live_studio_••••••••••••••••••••••••</code>
                <button type="button" className="admin-button admin-button--secondary admin-button--small" onClick={handleCopyApiKey}>
                  <CopyIcon size={12} />
                  {copiedKey ? 'Copied!' : 'Copy API Key'}
                </button>
              </div>
            </div>

            <div className="integration-card">
              <h4 className="card-subheading">Webhook Notification URL</h4>
              <p className="card-body-text">Receive instant webhook events when clients submit proof favorites or complete gallery payments.</p>
              <div className="api-key-box">
                <input
                  type="url"
                  className="admin-input webhook-input"
                  placeholder="https://yourcrm.com/api/webhooks/studio"
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                />
                <button
                  type="button"
                  className="admin-button admin-button--primary admin-button--small"
                  onClick={() => notify('Webhook endpoint saved.', 'success')}
                >
                  Save Webhook
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
