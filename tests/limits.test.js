const { parseLimits } = require('../utils/limits');

const cases = [
  [{ interactions: '5', max_tokens: '100' }, { interactions: 5, max_tokens: 100 }],
  [{ interactions: '50', max_tokens: '500' }, { interactions: 20, max_tokens: 200 }]
];

for (const [input, expected] of cases) {
  const out = parseLimits(input);
  if (out.interactions !== expected.interactions || out.max_tokens !== expected.max_tokens) {
    console.error('Test failed', { input, out, expected });
    process.exit(1);
  }
}

console.log('All tests passed.');
