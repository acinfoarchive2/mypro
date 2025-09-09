function parseLimits(params = {}) {
  const MAX_INTERACTIONS = 20;
  const MAX_TOKENS = 200;
  const interactions = Math.min(parseInt(params.interactions || '5', 10), MAX_INTERACTIONS);
  const max_tokens = Math.min(parseInt(params.max_tokens || '60', 10), MAX_TOKENS);
  return { interactions, max_tokens };
}

module.exports = { parseLimits };
