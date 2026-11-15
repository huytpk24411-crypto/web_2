/** Change type before restoring the selection so Angular cannot reset the caret afterwards. */
export function togglePasswordVisibility(input: HTMLInputElement, visible: boolean): boolean {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const direction = input.selectionDirection;
  input.type = visible ? 'password' : 'text';
  input.focus({ preventScroll: true });
  if (start !== null && end !== null) input.setSelectionRange(start, end, direction ?? undefined);
  return !visible;
}
