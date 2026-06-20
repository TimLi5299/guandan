/**
 * Design audit screenshot capture script
 * Navigates the Guandan game through 4 key states and saves screenshots.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/homebrew/lib/node_modules/playwright');

const BASE = 'http://localhost:3737?demo=1';
const OUT  = './design-audit';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Re-query nth card by index (stable even if DOM re-renders) */
async function clickCard(page, index) {
  const cards = await page.$$('#hand-area .card');
  if (index < cards.length) {
    await cards[index].click();
  }
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page    = await ctx.newPage();

  // ── 0. Load lobby & enter nickname ────────────────────────────────────────
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(800);

  // Type nickname
  await page.fill('#nickname-input', '设计审查');
  await sleep(300);

  // Solo mode should already be selected; click "开始对战"
  await page.click('#solo-start-btn');

  // Wait for game screen to appear (hand cards rendered)
  await page.waitForSelector('#hand-area .card', { timeout: 15000 });
  await sleep(2000); // let animations settle

  // ── Screenshot 1: Initial deal – it's my turn ─────────────────────────────
  await page.screenshot({ path: `${OUT}/01-initial.png`, fullPage: false });
  console.log('✅  01-initial.png saved');

  // ── Screenshot 2: Select 2-3 cards ────────────────────────────────────────
  const cardCount = await page.$$eval('#hand-area .card', c => c.length);
  console.log(`   Found ${cardCount} cards in hand`);

  if (cardCount >= 3) {
    await clickCard(page, 0); await sleep(250);
    await clickCard(page, 2); await sleep(250);
    await clickCard(page, 4); await sleep(250);
  }
  await page.screenshot({ path: `${OUT}/02-card-selected.png`, fullPage: false });
  console.log('✅  02-card-selected.png saved');

  // ── Screenshot 3: AI playing – deselect then pass so AI gets a turn ───────
  // Deselect previously selected cards
  if (cardCount >= 3) {
    await clickCard(page, 0); await sleep(150);
    await clickCard(page, 2); await sleep(150);
    await clickCard(page, 4); await sleep(150);
  }

  // Click "不出" (pass) to give turn to AI
  const passVisible = await page.$eval('#pass-btn', b => {
    return !b.disabled && b.offsetParent !== null;
  }).catch(() => false);

  if (passVisible) {
    await page.click('#pass-btn');
    console.log('   Clicked 不出 (pass)');
  } else {
    // Must play — select a single card and play it
    console.log('   Cannot pass; playing a single card instead');
    await clickCard(page, 0); await sleep(200);
    await page.click('#play-btn');
  }

  // Wait for AI to take its turn(s)
  await sleep(3500);
  await page.screenshot({ path: `${OUT}/03-ai-playing.png`, fullPage: false });
  console.log('✅  03-ai-playing.png saved');

  // ── Screenshot 4: My turn prompt – wait for play button to become active ──
  await sleep(2000);
  try {
    await page.waitForFunction(() => {
      const btn = document.getElementById('play-btn');
      return btn && !btn.disabled && btn.offsetParent !== null;
    }, { timeout: 10000 });
  } catch(e) {
    console.log('   (play button wait timed out, capturing anyway)');
  }
  await sleep(500);
  await page.screenshot({ path: `${OUT}/04-my-turn-prompt.png`, fullPage: false });
  console.log('✅  04-my-turn-prompt.png saved');

  await browser.close();
  console.log('\n🎉  All screenshots saved to ./design-audit/');
}

run().catch(e => { console.error(e); process.exit(1); });
