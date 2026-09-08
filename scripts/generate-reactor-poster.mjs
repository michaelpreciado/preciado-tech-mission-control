import { mkdir, writeFile } from 'node:fs/promises'

// Dependency-free static counterpart of the twelve-sided reactor and six lugs.
const polygon = (radius) => Array.from({ length: 12 }, (_, i) => {
  const angle = i * Math.PI / 6
  return `${(64 + Math.cos(angle) * radius).toFixed(2)},${(64 + Math.sin(angle) * radius).toFixed(2)}`
}).join(' ')
const fins = Array.from({ length: 6 }, (_, i) =>
  `<rect x="97" y="60" width="12" height="8" rx="1" transform="rotate(${i * 60} 64 64)" fill="#00d4ff" opacity=".55"/>`).join('')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
<defs><radialGradient id="energy"><stop stop-color="#a7f2ff"/><stop offset="1" stop-color="#00d4ff" stop-opacity=".5"/></radialGradient></defs>
${fins}
<polygon points="${polygon(38)}" fill="#06313e" stroke="#00d4ff" stroke-width="3" opacity=".85"/>
<polygon points="${polygon(31)}" fill="#07151f" stroke="#00d4ff" stroke-opacity=".35" stroke-width="4"/>
<polygon points="${polygon(23)}" fill="none" stroke="#00d4ff" stroke-width="3"/>
<polygon points="${polygon(18)}" fill="url(#energy)"/>
</svg>\n`
const directory = new URL('../public/visuals/', import.meta.url)
await mkdir(directory, { recursive: true })
await writeFile(new URL('reactor-core-poster.svg', directory), svg)
