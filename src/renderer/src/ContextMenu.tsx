export interface ContextMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  /** When defined, renders a checkmark column (✓ when true) — e.g. open views. */
  checked?: boolean
}

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

function ContextMenu({ x, y, items, onClose }: Props) {
  return (
    <div
      className="ctx-backdrop"
      onClick={onClose}
      onContextMenu={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div
        className="ctx-menu"
        style={{ left: x, top: y }}
        onClick={(event) => event.stopPropagation()}
      >
        {items.map((item, index) => (
          <button
            key={index}
            className={`ctx-item${item.danger ? ' danger' : ''}`}
            onClick={() => {
              item.onClick()
              onClose()
            }}
          >
            {item.checked !== undefined && (
              <span className="ctx-check">{item.checked ? '✓' : ''}</span>
            )}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default ContextMenu
