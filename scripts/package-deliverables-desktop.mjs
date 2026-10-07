/** Generated display policy/link convention. No independent desktop file parser. */
import fs from 'node:fs'
import ts from 'typescript'
import { CADENCE } from '../lib/pt/contract.ts'
const out = new URL('../../desktop/mp.preciadoTech.deliverables/', import.meta.url)
fs.writeFileSync(new URL('cadence.json', out), JSON.stringify(CADENCE.deliverables) + '\n')
for (const file of ['deliverables-display.mjs', 'presentation-state.mjs']) fs.copyFileSync(new URL('../lib/pt/' + file, import.meta.url), new URL(file, out))
const links = fs.readFileSync(new URL('../lib/vault-links.ts', import.meta.url), 'utf8')
fs.writeFileSync(new URL('vault-links.mjs', out), ts.transpileModule(links, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText)
