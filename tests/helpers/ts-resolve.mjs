/**
 * Resolve hook so `node --test` can load the app's own modules.
 *
 * The app imports siblings without a file extension (`from '../config'`),
 * which is what TypeScript and bundlers expect but Node's ESM resolver
 * rejects outright. Until now that forced anything we wanted to unit-test to
 * be written import-free, which is a real constraint on where logic can live:
 * the costs aggregation pipeline stayed inside a module that also walked the
 * filesystem and called the OpenRouter API, purely because splitting it would
 * have made it untestable.
 *
 * This hook appends `.ts`/`.tsx` to relative specifiers that would otherwise
 * fail. It touches nothing in production — it exists only for the test run,
 * and it defers to the default resolver for everything it does not rescue.
 */
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CANDIDATES = ['.ts', '.tsx', '/index.ts', '/index.tsx']

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (err) {
      // Only rescue relative specifiers; a bare package name that fails to
      // resolve is a genuine missing dependency and must keep throwing.
      if (!specifier.startsWith('.') || !context.parentURL) throw err
      for (const ext of CANDIDATES) {
        const url = new URL(specifier + ext, context.parentURL)
        if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true }
      }
      throw err
    }
  },
})
