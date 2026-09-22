/**
 * Sanitize diagnostics that may cross the server/API boundary.
 *
 * Child processes are allowed to mention their local environment in both
 * stdout and stderr. Keep useful human-facing failure text, but never return
 * paths, URLs, credentials, environment assignments, or internal issue IDs.
 */

const ANSI_ESCAPE_RE = /\u001b\[[0-?]*[ -\/]*[@-~]/g
const FAILURE_SIGNATURE_RE = /\b(?:error|failed|failure|fatal|exception|traceback|denied|refused|unable|cannot|couldn['’]t|invalid|timed?\s*out|timeout|not\s+found|no\s+such|exit(?:ed|\s+with)?|abort(?:ed)?|unavailable)\b/i
const INTERNAL_ISSUE_RE = /\b(?:internal\s+)?(?:issue|ticket|incident|bug)\s*#?\s*\d+\b|#\d+\b/gi
const URL_RE = /\b(?:https?|file|ssh|ws|wss|git):\/\/[^\s<>'"`]+/gi
const CREDENTIAL_RE = /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|secret|password|authorization|bearer|token)\b\s*[:=]\s*[^\s,;]+/gi
const ENV_ASSIGNMENT_RE = /\b[A-Z][A-Z0-9_]{2,}\s*=\s*[^\s,;]+/g
const PATH_RE = /(^|[\s("'`=])(?:~\/|\.\.?[\\/]|\/[A-Za-z0-9._-]+|[A-Za-z]:[\\/])[^\s\r\n"'`<>)]*/g

export const CLI_ERROR_TAIL_MAX = 320

function asText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Buffer.isBuffer(value)) return value.toString()
  return ''
}

function clip(text: string, maxLength: number): string {
  return text.length > maxLength ? `…${text.slice(-(maxLength - 1))}` : text
}

/** Sanitize one diagnostic string without changing its line selection. */
export function sanitizeServerError(value: unknown, maxLength = CLI_ERROR_TAIL_MAX): string {
  const text = asText(value)
  if (!text) return ''
  const sanitized = text
    .replace(ANSI_ESCAPE_RE, '')
    .replace(URL_RE, '[url]')
    .replace(CREDENTIAL_RE, '[credential redacted]')
    .replace(ENV_ASSIGNMENT_RE, '[environment value redacted]')
    .replace(PATH_RE, '$1[path redacted]')
    .replace(INTERNAL_ISSUE_RE, '[internal issue redacted]')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return clip(sanitized, maxLength)
}

function failureLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .find(line => !/^(?:Warning:|\[HERMES_HOME fallback\]|Session .* starting fresh\.?)/i.test(line) && FAILURE_SIGNATURE_RE.test(line)) ?? ''
}

/**
 * Pick a useful bounded diagnostic from a failed CLI invocation. Prefer a
 * failure-signature line in stderr; when stderr is only notices, inspect
 * stdout, where several Hermes failure modes print the actual reason.
 */
export function sanitizeCliFailure(stderr: unknown, stdout: unknown, fallback?: unknown): string {
  const stderrText = asText(stderr)
  const stderrLine = failureLine(stderrText)
  if (stderrLine) return sanitizeServerError(stderrLine)

  const stdoutText = asText(stdout)
  const stdoutLine = failureLine(stdoutText)
  if (stdoutLine) return sanitizeServerError(stdoutLine)

  const stdoutTail = sanitizeServerError(stdoutText)
  if (stdoutTail) return stdoutTail
  const stderrTail = sanitizeServerError(stderrText)
  if (stderrTail) return stderrTail
  return sanitizeServerError(fallback)
}

/** Backward-compatible name for callers that only have stderr. */
export function sanitizeCliStderr(stderr: unknown): string {
  return sanitizeServerError(stderr)
}
