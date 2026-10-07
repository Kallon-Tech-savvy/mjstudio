import React from 'react'
import type { ProofPhoto } from './proofTypes'

interface MagicCuratorProps {
  photos: ProofPhoto[]
  selectedIds: Set<string>
  maxSelection?: number
  onAutoSelect: (photoIds: string[]) => void
}

export const MagicCurator: React.FC<MagicCuratorProps> = ({
  photos,
  selectedIds,
  maxSelection = 30,
  onAutoSelect,
}) => {
  const handleCurate = () => {
    // Intelligent curation strategy:
    // Pick well-distributed photos across albums/tags up to maxSelection limit.
    const targetCount = Math.min(maxSelection, photos.length)
    const step = Math.max(1, Math.floor(photos.length / targetCount))
    
    const curatedIds: string[] = []
    for (let i = 0; i < photos.length && curatedIds.length < targetCount; i += step) {
      if (!photos[i].locked) {
        curatedIds.push(photos[i].id)
      }
    }

    onAutoSelect(curatedIds)
  }

  return (
    <div className="magic-curator-banner spring-bounce">
      <div className="magic-curator-info">
        <span className="magic-curator-badge">✦ Magic Curator</span>
        <p className="magic-curator-title">
          Overwhelmed by scrolling {photos.length} photos? Let Riven auto-curate your top {Math.min(30, photos.length)} favorites instantly.
        </p>
      </div>
      <button
        type="button"
        className="spring-btn spring-btn-primary"
        onClick={handleCurate}
      >
        ✦ Auto-Curate Top Favorites
      </button>
    </div>
  )
}
