import { useEffect, useState } from 'react'
import type { PullRequest } from '../../shared/types'
import { useLoom } from './loom-context'

function PrPanel() {
  const { repoPath, onCheckoutPr } = useLoom()
  const [prs, setPrs] = useState<PullRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function refresh(): void {
    if (!repoPath) {
      setPrs([])
      return
    }
    setLoading(true)
    setError(null)
    window.api.listPullRequests(repoPath).then((result) => {
      if (result.ok) {
        setPrs(result.prs)
      } else {
        setPrs([])
        setError(result.error)
      }
      setLoading(false)
    })
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath])

  return (
    <div className="pr-pane">
      <header className="pr-header">
        <span>Pull requests</span>
        <button className="secondary" onClick={refresh}>
          Refresh
        </button>
      </header>
      <div className="pr-list">
        {loading && <div className="empty">Loading…</div>}
        {error && <div className="error">{error}</div>}
        {!loading && !error && prs.length === 0 && (
          <div className="empty">No open pull requests.</div>
        )}
        {!loading &&
          !error &&
          prs.map((pr) => (
            <div key={pr.number} className="pr-item">
              <div className="pr-row1">
                <span className="pr-title">
                  <span className="pr-number">#{pr.number}</span> {pr.title}
                </span>
                <button className="secondary" onClick={() => onCheckoutPr(pr.number)}>
                  Checkout
                </button>
              </div>
              <div className="pr-meta">
                {pr.branch} · {pr.author}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

export default PrPanel
