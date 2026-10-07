import type { Session } from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'
import type { StaffMember } from '../types'

interface AdminHeaderProps {
  session: Session
  staff: StaffMember
}

export function AdminHeader({
  staff,
}: AdminHeaderProps) {
  const displayName =
    staff.name ||
    staff.email.split('@')[0]

  return (
    <header className="admin-header">
      <div>
        <h2>
          Welcome back, {displayName}
        </h2>
      </div>

      <div className="admin-header__actions" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span
          className={`role-badge ${
            staff.role === 'owner'
              ? 'role-badge--owner'
              : ''
          }`}
        >
          {staff.role}
        </span>

        <button
          type="button"
          className="admin-button admin-button--secondary"
          onClick={() =>
            supabase.auth.signOut()
          }
        >
          Sign out
        </button>
      </div>
    </header>
  )
}