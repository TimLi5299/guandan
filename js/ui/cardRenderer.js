/**
 * cardRenderer.js — 扑克牌渲染工具
 */

const SUIT_SYMBOLS = { 0: '♠', 1: '♥', 2: '♣', 3: '♦' };
const SUIT_COLORS = { 0: 'black', 1: 'red', 2: 'black', 3: 'red' };
const RANK_DISPLAY = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
  9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
  15: '小', 16: '大'
};

/**
 * 创建一个牌的 DOM 元素
 */
function createCardElement(card, options = {}) {
  const el = document.createElement('div');
  const isJoker = card.rank >= 15;
  const isRed = isJoker ? card.rank === 16 : (card.suit === 1 || card.suit === 3);

  el.className = 'card' +
    (isRed ? ' red' : ' black') +
    (isJoker ? (card.rank === 16 ? ' joker-red' : ' joker-black') : '') +
    (options.played ? ' played-card' : '') +
    (options.selected ? ' selected' : '');

  el.dataset.cardId = card.id;

  if (isJoker) {
    el.innerHTML = `
      <span class="card-rank">${card.rank === 16 ? '大' : '小'}</span>
      <span class="card-suit">🃏</span>
    `;
  } else {
    el.innerHTML = `
      <span class="card-rank">${RANK_DISPLAY[card.rank]}</span>
      <span class="card-suit">${SUIT_SYMBOLS[card.suit]}</span>
    `;
  }

  return el;
}

/**
 * 渲染手牌到容器，动态计算间距让所有牌都可见
 */
function renderHand(container, cards, selectedIds = new Set()) {
  container.innerHTML = '';
  if (cards.length === 0) return;

  const isMobile = window.innerWidth <= 600;
  // review-P1 修复：桌面卡宽与 CSS 实际渲染对齐（Phase 2 起 .hand-area .card 是 48px，
  // 原按 70 计算导致 800-1100px 窗口下 27 张牌每张只露 6-15px）
  const cardWidth = isMobile ? 44 : 48;
  // Available width: container width or fallback to viewport minus padding
  const containerW = container.clientWidth || (window.innerWidth - 32);
  const minVisible = isMobile ? 14 : 22; // review: 桌面最少露出 22px 保证点数可辨

  // Calculate overlap so all cards fit; default overlap capped by minVisible constraint
  let marginLeft = isMobile ? -28 : -40;
  if (cards.length > 1) {
    // space = (containerW - cardWidth) spread across (n-1) gaps
    const naturalVisible = (containerW - cardWidth) / (cards.length - 1);
    // clamp: at least minVisible, at most cardWidth (no overlap)
    const visiblePerCard = Math.min(cardWidth, Math.max(minVisible, naturalVisible));
    marginLeft = Math.round(visiblePerCard - cardWidth); // negative = overlap
  }

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const el = createCardElement(card, { selected: selectedIds.has(card.id) });
    el.style.marginLeft = i === 0 ? '0px' : `${marginLeft}px`;
    el.style.setProperty('--deal-i', i);   // v1.2 发牌 stagger 动画索引
    el.addEventListener('click', () => {
      window.gameUI.toggleCardSelection(card.id);
    });
    container.appendChild(el);
  }
}

/**
 * 渲染出的牌（小号展示）
 */
function renderPlayedCards(container, cards) {
  container.innerHTML = '';
  if (!cards || cards.length === 0) return;
  for (const card of cards) {
    const el = createCardElement(card, { played: true });
    container.appendChild(el);
  }
}

/**
 * 渲染牌背（其他玩家的手牌数量）
 */
function renderCardBacks(container, count) {
  container.innerHTML = '';
  const showCount = Math.min(count, 15); // 最多展示15张牌背
  for (let i = 0; i < showCount; i++) {
    const el = document.createElement('div');
    el.className = 'card-back';
    container.appendChild(el);
  }
}

window.CardRenderer = {
  createCardElement,
  renderHand,
  renderPlayedCards,
  renderCardBacks,
};
