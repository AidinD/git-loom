import { useLoom } from './loom-context'

/** Command/activity history: a scrollable log of operations and their results. */
function LogPanel() {
  const { activity, onClearActivity } = useLoom()
  return (
    <div className="log-panel">
      <div className="log-header">
        <span>Command history</span>
        <button
          className="secondary"
          disabled={activity.length === 0}
          onClick={onClearActivity}
        >
          Clear
        </button>
      </div>
      <div className="log-list">
        {activity.length === 0 && <div className="empty">No activity yet.</div>}
        {activity.map((entry) => (
          <div key={entry.id} className={`log-row log-${entry.kind}`}>
            <span className="log-time">{entry.time}</span>
            <span className="log-message">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default LogPanel
