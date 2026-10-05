export type Shortcut = 'toggle' | 'prev' | 'next' | null
type Key = Pick<KeyboardEvent, 'key' | 'repeat' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>
type Target = { tagName: string; type?: string; isContentEditable?: boolean }

const SPACE_IS_THEIRS = ['BUTTON', 'A', 'SUMMARY', 'INPUT', 'SELECT', 'TEXTAREA'] // Space already presses, opens, ticks or types there

/**
 * Which timeline action a key press means, given what has the focus. Pure, so the whole table of cases is testable.
 * `panningMap`: the focus is on the map and got there by Tab — that person steers the map with the arrow keys.
 */
export function shortcut(e: Key, target: Target | null, panningMap: boolean): Shortcut {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null // the browser's and the map's own (Alt+← is Back)
  const tag = target?.tagName ?? '', typing = tag === 'TEXTAREA' || !!target?.isContentEditable
  if (e.key === ' ') return e.repeat || typing || SPACE_IS_THEIRS.includes(tag) ? null : 'toggle'
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return null
  // The slider and the speed list already move with the arrows; a checkbox does nothing with them.
  if (panningMap || typing || tag === 'SELECT' || (tag === 'INPUT' && target?.type !== 'checkbox')) return null
  return e.key === 'ArrowLeft' ? 'prev' : 'next'
}
