/**
 * SkillProfiles.js — 掼蛋 NPC 技能树
 *
 * 将 PracticeNPC v3 的 9 项规则技能拆解为可独立开关的 SkillProfile（Set<string>），
 * 便于消融测试量化每项技能的贡献，也为 Search / RL 路线提供扩展槽位。
 *
 * 技能 ID 命名规范：路线前缀_简写
 *   R = Rule-based（规则路线）
 *   S = Search（搜索/MCTS，待实现）
 *   L = Learned（监督/RL，待实现）
 */

export const SKILLS = {
  // ─── 规则路线 R1-R9 ───────────────────────────────────────────
  /** ③ 队友领牌主动让路 + 护送清场 */
  R1: 'r1_yield',
  /** ④ 炸弹时机增强（残局/对手快赢时使用炸弹） */
  R2: 'r2_bomb_timing',
  /** ① 拆牌质量优化（跟牌时选破坏性最低的候选） */
  R3: 'r3_decomp_quality',
  /** ② 记牌推断——isEffectivelyMax（桌面牌是否已是最大） */
  R4: 'r4_memory',
  /** ⑦ 级牌 / 万能牌保护（不轻易在低价值场合消耗） */
  R5: 'r5_level_guard',
  /** ⑧ 对手手牌推断——isLastPlayUnbeatable（无人能打过则省大牌） */
  R6: 'r6_opponent_infer',
  /** ⑨ 信号传递（领牌编码强/弱信号；读队友信号调整让路策略） */
  R7: 'r7_signal',
  /** ⑥ 残局解算器（全场 ≤28 张时优先出"无敌牌型"） */
  R8: 'r8_endgame',
  /** ⑤ 领牌评分（综合难度 + 记牌 + 破坏性 + 级牌扣分） */
  R9: 'r9_lead_score',

  // ─── 规则路线 R10-R12（第二期强化） ──────────────────────────
  /** 形势感知领牌：在 R9 评分上叠加局势动态因子（游戏阶段 + 对手/队友手牌压力） */
  R10: 'r10_adaptive_lead',
  /** 万能牌感知拆牌：利用万能牌填补顺子缺口，减少分组所需手数 */
  R11: 'r11_wild_decomp',
  /** 忍牌保型：跟牌时若所有选项对手型破坏过高且场面不紧急，选择不出 */
  R12: 'r12_hold_back',

  // ─── 规则路线 R13-R14（第三期强化） ──────────────────────────
  /** 出口规划：手牌≤3手时领牌优先选能留下无敌下一手的出法，加速清手退场 */
  R13: 'r13_exit_plan',
  /** 顺子保护：跟牌时若出顺子/连对会破坏手型（loss≥1），且场面不紧急，选择不出 */
  R14: 'r14_seq_guard',
  /** 三张保护：跟牌时若出三张会破坏三带二组合（loss≥1），且场面不紧急，选择不出 */
  R15: 'r15_triple_guard',

  // ─── B 路线 S1（v1.4 大师档） ─────────────────────────────────
  /** 残局前瞻：全场剩牌≤24 且我手牌≤10 时，对全部候选做前瞻评估
   *（剩余手数 + 记忆推断可压性 + 清手奖励），替代启发式选牌 */
  S1: 's1_endgame_search',
  // ─── 第四档 S2（残局精确求解：确定化采样 + 完美信息搜索 + 多世界投票） ───
  S2: 's2_endgame_exact',
  // ─── 第二档 R16（最少手数精确评估：拆牌 DP 替代贪心，全局算账） ───
  R16: 'r16_min_tricks',
  // ─── 第三档 S3（中盘多世界模拟：确定化采样 + 轻量 rollout + 显著性接管） ───
  S3: 's3_midgame_sim',
};

/**
 * 内置预设
 *   noob   — 无任何高级技能，纯随机/贪心
 *   normal — 基础配合 + 炸弹时机 + 拆牌 + 记牌（R1-R4）
 *   expert — 14 项技能（R1-R15 减 R5；详见下方注释）
 *
 * M2 决策（2026-05-03）：从 expert 删除 R5
 *   依据：M1 v1.0 三维度 t-test 数据（200 场 × 10 重复 × 3 维度）
 *   - 手数维度：去掉 R5 → -0.64 手数，p<.001（更快赢）
 *   - 让路率维度：去掉 R5 → +0.2%，p<.001（微改善）
 *   - 拦截率维度：去掉 R5 → +2.0%，p=.001（拦截率提升）
 *   三维度都是负贡献，无对冲。R5 实现的"硬阈值"过于保守（lastPlay.mainRank<8 即停手），
 *   导致 NPC 在低价值跟牌局面无意义放过。R5 编号保留，未来可重做精细级牌保护。
 */
export const NPC_PRESETS = {
  noob:   new Set([]),
  normal: new Set([SKILLS.R1, SKILLS.R2, SKILLS.R3, SKILLS.R4]),
  // expert：R 路线全集（去 R5 反向技能、不含 S1）—— 14 项
  // 教训第 4 次（v1.4 加 s1 / v2.1 加 s2+r16 都曾漏进 expert）：排除式 filter 对新增
  // 枚举值不设防，改为显式白名单——新技能默认不进任何档位，必须显式挂载
  expert: new Set([SKILLS.R1, SKILLS.R2, SKILLS.R3, SKILLS.R4, SKILLS.R6, SKILLS.R7,
                   SKILLS.R8, SKILLS.R9, SKILLS.R10, SKILLS.R11, SKILLS.R12, SKILLS.R13,
                   SKILLS.R14, SKILLS.R15]),
  // v1.4 lean：精简实验 preset（M2 三维度 t-test 的 6 项核心）
  lean:   new Set([SKILLS.R1, SKILLS.R3, SKILLS.R9, SKILLS.R10, SKILLS.R11, SKILLS.R12]),
  // 实验：expert(14规则) + S2 残局精算 —— 测"给普通档上搜索"的增量
  expertS2: new Set([SKILLS.R1, SKILLS.R2, SKILLS.R3, SKILLS.R4, SKILLS.R6, SKILLS.R7,
                     SKILLS.R8, SKILLS.R9, SKILLS.R10, SKILLS.R11, SKILLS.R12, SKILLS.R13,
                     SKILLS.R14, SKILLS.R15, SKILLS.S2]),
  // v1.4 master：大师档 = lean 核心 6 项 + R2（生死关头拦截，v1.4 修复后）+ S1（残局制胜探测）
  // 选型依据：lean vs expert 对抗 51.1%（13k 局显著）——8 项不显著技能整体是负资产；
  // R2 修复后重新有效（关键炸弹拦截不再无条件泄漏给全部 profile）；S1 零成本挂载 B 路线
  master: new Set([SKILLS.R1, SKILLS.R2, SKILLS.R3, SKILLS.R9, SKILLS.R10, SKILLS.R11, SKILLS.R12, SKILLS.S1, SKILLS.S2, SKILLS.R16, SKILLS.S3]),
};

/**
 * 根据 level 字符串返回对应的默认 SkillProfile
 * @param {string} level - 'noob' | 'normal' | 'expert'
 * @returns {Set<string>}
 */
export function profileFromLevel(level) {
  return NPC_PRESETS[level] ?? NPC_PRESETS.normal;
}
