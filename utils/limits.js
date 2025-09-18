// utils/limits.js
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function parseIntSafe(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function normalizeStance(x, def) {
  const v = String(x || '').toLowerCase().trim();
  if (['pro', 'contra'].includes(v)) return v;
  return def;
}

function parseLimits(qs = {}) {
  const interactions = clamp(parseIntSafe(qs.interactions, 3), 1, 10);
  const max_tokens = clamp(parseIntSafe(qs.max_tokens, 120), 30, 300);
  const topic = (qs.topic || "Mercados como unidad de análisis en el contexto histórico de Adam Smith y mercados actuales").toString().trim();

  const mode = (qs.mode || 'dialog').toString().trim().toLowerCase(); // 'dialog' | 'debate'
  const alpha_stance = normalizeStance(qs.alpha_stance, 'pro');   // pro o contra
  const beta_stance  = normalizeStance(qs.beta_stance,  'contra'); // pro o contra

  return { interactions, max_tokens, topic, mode, alpha_stance, beta_stance };
}

module.exports = { parseLimits };
