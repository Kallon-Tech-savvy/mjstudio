import React, { useState } from 'react'

interface ClientSubmitModalProps {
  isOpen: boolean
  selectedCount: number
  onClose: () => void
  onSubmit: (clientInfo: { name: string; email: string; notes: string }) => Promise<void>
}

export const ClientSubmitModal: React.FC<ClientSubmitModalProps> = ({
  isOpen,
  selectedCount,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit({ name, email, notes })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="essentials-overlay" onClick={onClose}>
      <div className="essentials-modal spring-slide-down" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
        <div className="essentials-header">
          <div className="essentials-brand">
            <span className="essentials-logo">RIVEN</span>
            <span className="essentials-subtitle">Submit Proof Selections</span>
          </div>
          <button className="essentials-close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="essentials-body" style={{ gap: '16px', display: 'flex', flexDirection: 'column' }}>
          <p className="essentials-lead" style={{ marginBottom: '12px' }}>
            You have selected <strong>{selectedCount} proof{selectedCount === 1 ? '' : 's'}</strong>. Send your final selections and feedback directly to your photographer.
          </p>

          <div>
            <label className="form-label">Your Name</label>
            <input
              type="text"
              required
              className="faq-search-input"
              placeholder="Jane Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label">Your Email</label>
            <input
              type="email"
              required
              className="faq-search-input"
              placeholder="jane@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label">Special Notes or Instructions (Optional)</label>
            <textarea
              className="faq-search-input"
              rows={3}
              placeholder="e.g. Please retouch proof #003..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="spring-btn spring-btn-primary" disabled={submitting}>
              {submitting ? 'Submitting...' : `Submit ${selectedCount} Proofs ✦`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
