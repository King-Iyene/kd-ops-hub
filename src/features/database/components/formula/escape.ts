/**
 * A dialog closes on Escape before the editor inside it sees the key, so pressing Escape to dismiss the list of
 * suggestions would close the whole dialog and lose the formula. Give this to the dialog's onEscapeKeyDown: while
 * the suggestion list is open it keeps the dialog open, so the first Escape closes the list and a second closes the dialog.
 */
export function keepDialogOpenWhileSuggesting(event: KeyboardEvent): void {
  if (typeof document !== 'undefined' && document.querySelector('.cm-tooltip-autocomplete')) {
    event.preventDefault();
  }
}
