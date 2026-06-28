/**
 * NPCConfig.js — NPC 决策的可调权重/阈值集中配置
 *
 * 目的：把原先散落在 PracticeNPC.js 函数体里的"魔法数字"收拢到一处，
 * 便于胜率台自动/手动调参，也便于一眼看清每个旋钮的含义。
 *
 * ⚠️ R1（收拢）这一轮只搬不改值——数值与 v2.5 完全一致，强度应持平。
 *    后续轮次（炸弹收益化等）在此基础上调具体旋钮。
 */
export const NPCConfig = {
  // 领牌评分 scoreLeadPlay 的权重
  lead: {
    lenBonus: { 6: 45, 5: 35, 4: 22, 3: 15, 2: 8 },  // 牌型复杂度（越长对手越难跟）
    unbeatableEndgame: 55,            // 残局(手牌≤阈值)组合型无敌牌奖励
    unbeatableMidgame: 25,            // 中盘组合型无敌牌奖励
    unbeatableHandThreshold: 8,       // 残局/中盘分界（手牌张数）
    breakLossPenalty: 18,             // 每破坏 1 手的扣分
    breakLossHardPenalty: 50,         // "不减总手数"的结构性硬罚（breakLoss≥1）
    wildSeqPenalty: 35,               // 万能牌填序列缺口的折扣罚
    wildOtherPenalty: 90,             // 万能牌当垫牌的严格保护罚
    levelPenalty: 20,                 // 每张普通级牌的扣分
    avgRankPenalty: 1.2,              // 平均 rank 每点扣分（留大牌后手）
    lenReward: 4,                     // 每多出 1 张的奖励（清手快）
    controlReserve: 30,               // 控制牌(王)保留成本（手牌多时）
    controlReserveHandThreshold: 8,   // 控制牌保留生效的手牌阈值
  },

  // 炸弹时机 shouldUseBomb
  bomb: {
    handTrivial: 6,        // 手牌≤此 → 直接用炸弹收尾
    tricksLow: 3,          // 剩余手数≤此 → 用炸弹（快赢了）
    // R2 收益化（替代原"剩余手数>4 一刀切禁炸"）：跟牌没普通牌能压时，
    // 按"抢回出牌权的价值"决定炸不炸。value ≥ useThreshold 才炸。
    tricksValueBase: 6,    // 剩余手数 < 此 → 越接近赢，抢权越值得
    tricksValueWeight: 1.0,
    oppThreatBase: 10,     // 对手最少手牌 < 此 → 越少越该拦
    oppThreatWeight: 1.0,
    bombSizeCost: 3,       // 炸弹每超 4 张的保留成本（大炸弹/天王炸更该留）
    wildBombCost: 2,       // 炸弹每含 1 张万能牌的保留成本（病例：拿两万能炸单小王=白扔）
    useThreshold: 1,       // 收益阈值
  },
};
