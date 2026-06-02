type Props = {
  open: boolean;
  onClose: () => void;
};

const SHORTCUTS: [string, string][] = [
  ["j", "Next item"],
  ["k", "Previous item"],
  ["o / Enter", "Open article pane"],
  ["m", "Toggle read / unread"],
  ["s", "Toggle star"],
  ["Shift+A", "Mark all visible items as read"],
  ["Escape", "Close article pane"],
  ["?", "Show this help"],
];

export default function ShortcutsModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm ghost-border bg-surface-container shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-5 py-4">
          <h2 className="text-[11px] font-label font-bold uppercase tracking-widest text-on-surface-variant">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-outline transition-colors hover:text-on-surface"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
            </svg>
          </button>
        </div>
        <div className="p-5">
          <table className="w-full">
            <tbody>
              {SHORTCUTS.map(([key, desc]) => (
                <tr key={key} className="border-b border-outline-variant/10 last:border-0">
                  <td className="py-2.5 pr-4">
                    <kbd className="ghost-border bg-surface-container-low px-2 py-0.5 font-mono text-[11px] text-primary">
                      {key}
                    </kbd>
                  </td>
                  <td className="py-2.5 text-[12px] font-body text-on-surface-variant">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
