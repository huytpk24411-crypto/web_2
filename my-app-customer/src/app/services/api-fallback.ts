function isJsonParseError(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'name' in error && error.name === 'SyntaxError';
}

export function isApiUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const failure = error as { status?: unknown; error?: unknown };
  // Error prototypes can differ between lazy chunks/realms. The HTTP status is the
  // transport contract; keep the original error intact for the caller.
  if (typeof failure.status === 'number') {
    if (failure.status === 0 || (failure.status >= 500 && failure.status < 600)) return true;
    // A rejected request must never become a successful write, even with a non-JSON body.
    if (failure.status >= 400 && failure.status < 500) return false;
  }
  if (isJsonParseError(error) || isJsonParseError(failure.error)) return true;
  // Angular's JSON backend can wrap the parse error together with the response text.
  return (
    !!failure.error &&
    typeof failure.error === 'object' &&
    'error' in failure.error &&
    isJsonParseError(failure.error.error)
  );
}
