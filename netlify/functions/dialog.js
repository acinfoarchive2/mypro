const { parseLimits } = require('../../utils/limits');

async function fetchCompletion(apiKey, role, prompt, maxTokens) {
  const systemPrompt = role === 'Alpha'
    ? 'Sos AI Alpha. Respondé breve a AI Beta desde una postura diferente, generá debate.'
    : 'Sos AI Beta. Respondé breve a AI Alpha desde una postura diferente, generá debate..';

  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    max_tokens: maxTokens,
    temperature: 0.7
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error: ${err}`);
  }
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

exports.handler = async function(event) {
  const { interactions, max_tokens } = parseLimits(event.queryStringParameters);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing OPENAI_API_KEY' }) };
  }

  const conversation = [];
  let alphaMsg = 'Hola Beta, ¿cómo estás?';
  conversation.push({ speaker: 'Alpha', message: alphaMsg });

  for (let i = 0; i < interactions; i++) {
    const betaMsg = await fetchCompletion(apiKey, 'Beta', alphaMsg, max_tokens);
    conversation.push({ speaker: 'Beta', message: betaMsg });

    alphaMsg = await fetchCompletion(apiKey, 'Alpha', betaMsg, max_tokens);
    conversation.push({ speaker: 'Alpha', message: alphaMsg });
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation })
  };
};
