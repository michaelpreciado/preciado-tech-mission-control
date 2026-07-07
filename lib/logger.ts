/**
 * Structured logger for Friday Mission Control.
 *
 * - Development: human-readable console output with timestamp + context.
 * - Production:  single-line JSON (ready for any log aggregator).
 * - Never logs raw Error objects (which may contain credentials or filesystem paths).
 */

const IS_PROD = process.env.NODE_ENV === 'production'

function safeMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'unknown error'
}

function emit(level: 'info' | 'warn' | 'error', context: string, message: string, extra?: Record<string, unknown>) {
  if (IS_PROD) {
    const entry = { level, context, message, ts: new Date().toISOString(), ...extra }
    // Single-line JSON — safe for structured log ingestion
    process.stderr.write(JSON.stringify(entry) + '\n')
  } else {
    const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${context}:`
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
    fn(prefix, message, extra ?? '')
  }
}

export const logger = {
  info(context: string, message: string, extra?: Record<string, unknown>) {
    emit('info', context, message, extra)
  },
  warn(context: string, message: string, extra?: Record<string, unknown>) {
    emit('warn', context, message, extra)
  },
  error(context: string, err: unknown, extra?: Record<string, unknown>) {
    emit('error', context, safeMessage(err), extra)
  },
}
