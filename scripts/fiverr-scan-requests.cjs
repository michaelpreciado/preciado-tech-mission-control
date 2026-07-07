#!/usr/bin/env node
/**
 * Fiverr Buyer Request Scanner
 * 
 * Setup: Export Fiverr cookies as JSON → save to ~/.fiverr-cookies.json
 * Then run: node fiverr-scan-requests.cjs
 * 
 * Scans latest buyer requests matching keywords, prints top matches.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const COOKIE_FILE = join(homedir(), '.fiverr-cookies.json');
const FIVERR_URL = 'https://www.fiverr.com';

const KEYWORDS = [
  'python', 'automation', 'automate', ' ai ', 'workflow', 'script',
  'zapier', 'make.com', 'notion', 'spreadsheet', 'google sheets',
  'email automation', 'data entry', 'follow up', 'reminder',
  'chatbot', 'business process', 'api integration'
];

async function main() {
  console.log('Fiverr Buyer Request Scanner\n');

  let cookies;
  try {
    const raw = readFileSync(COOKIE_FILE, 'utf8');
    cookies = JSON.parse(raw);
    console.log(`Loaded ${cookies.length} cookies from ${COOKIE_FILE}`);
  } catch (e) {
    console.error(`No cookies file at ${COOKIE_FILE}`);
    console.error('Export cookies from Fiverr → EditThisCookie → Export JSON → save to ~/.fiverr-cookies.json');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();
  await page.goto(`${FIVERR_URL}/buyer_requests`, { timeout: 20000 });
  await page.waitForSelector('[data-qa="buyer-request-card"]', { timeout: 10000 }).catch(() => null);

  const cards = await page.$$('[data-qa="buyer-request-card"]');
  console.log(`Found ${cards.length} buyer requests\n`);

  const matches = [];
  for (const card of cards) {
    try {
      const titleEl = await card.$('[data-qa="request-title"]');
      const descEl = await card.$('[data-qa="request-description"]');
      const budgetEl = await card.$('[data-qa="request-budget"]');
      const nameEl = await card.$('[data-qa="request-buyer-name"]');

      const title = (await titleEl?.textContent())?.trim() || '';
      const desc = (await descEl?.textContent())?.trim() || '';
      const budget = (await budgetEl?.textContent())?.trim() || '';
      const name = (await nameEl?.textContent())?.trim() || 'Buyer';

      const combined = (title + ' ' + desc).toLowerCase();
      const matched = KEYWORDS.filter(k => combined.includes(k.toLowerCase()));
      if (matched.length >= 1) {
        matches.push({ title, desc: desc.slice(0, 180), budget, name, matched });
      }
    } catch (e) {}
  }

  if (matches.length === 0) {
    console.log('No matching requests found. Check Fiverr manually.\n');
  } else {
    console.log(`${matches.length} matching request(s):\n`);
    matches.forEach((m, i) => {
      console.log(`Request ${i + 1} ───────────────────────────`);
      console.log(`Buyer: ${m.name} | Budget: ${m.budget}`);
      console.log(`Matched: ${m.matched.join(', ')}`);
      console.log(`Title: ${m.title}`);
      console.log(`Desc: ${m.desc}...`);
      console.log();
    });
  }

  await browser.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
