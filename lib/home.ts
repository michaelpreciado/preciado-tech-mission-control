/**
 * Compat shim — the canonical base directory now resolves in lib/config.ts
 * (MC_HOME > data/config.json homeDir > os.homedir()). Import getConfig()
 * for new code; this export remains for existing call sites.
 */
import { getConfig } from './config'

export const HOME = getConfig().homeDir
