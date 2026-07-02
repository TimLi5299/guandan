/**
 * Personas.js — 茶馆牌友群像（批2-①）
 *
 * 设计原则（路线图+铁律）：
 *   - 性格 = 现成参数旋钮（NPCConfig 权重）的具名组合，不新写决策逻辑。
 *   - 性格差异 > 强度差异：每位牌友宣称"进阶档"强度，胜率台校准落在 进阶±3pp 内
 *     （校准结果见 arena/EXPERIMENTS.md 批2 记录；error 字段是校准后的失误率补偿）。
 *   - 服务端单一数据源：客户端只传 persona id，技能/失误率/权重全部在这里解析。
 *   - cfg 是【全量合并后】的配置（模块加载时与 NPCConfig 合并），PracticeNPC 直接整块替换。
 */

import { NPCConfig } from './NPCConfig.js';

const L = NPCConfig.lead, B = NPCConfig.bomb;

export const PERSONAS = {
  // 🧨 炮仗刘：见炸就想放——抢权阈值大幅放宽、大炸弹也舍得、残局早早掏炸清场
  paozhang: {
    id: 'paozhang', name: '炮仗刘', icon: '🧨',
    desc: '有炸就手痒，宁可炸错不肯放过',
    preset: 'expert', level: 'expert', error: 0.15,
    cfg: {
      lead: { ...L },
      bomb: { ...B, useThreshold: -3, tricksValueBase: 8, bombSizeCost: 1, handTrivial: 8 },
    },
  },
  // 🧮 铁算盘周：捂牌到死——轻易不炸、王和万能攥得更紧、领牌先走小的
  tiesuanpan: {
    id: 'tiesuanpan', name: '铁算盘周', icon: '🧮',
    desc: '大牌捂到死，不见兔子不撒鹰',
    preset: 'expert', level: 'expert', error: 0.15,
    cfg: {
      lead: { ...L, controlReserve: 55, wildOtherPenalty: 130, avgRankPenalty: 1.6 },
      bomb: { ...B, useThreshold: 5, bombSizeCost: 5, wildBombCost: 4 },
    },
  },
  // 🐎 顺溜马：长牌一把梭——顺子连对钢板优先甩，肯拆结构换清手速度
  shunliu: {
    id: 'shunliu', name: '顺溜马', icon: '🐎',
    desc: '长牌一把梭，清手快如流水',
    preset: 'expert', level: 'expert', error: 0.15,
    cfg: {
      lead: { ...L, lenBonus: { 6: 65, 5: 50, 4: 26, 3: 15, 2: 8 }, lenReward: 7, breakLossPenalty: 12, avgRankPenalty: 1.5 },
      bomb: { ...B },
    },
  },
};
