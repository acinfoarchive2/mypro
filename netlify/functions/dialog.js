// netlify/functions/dialog.js
// Requiere Node 18+ (fetch global). Si usás una versión anterior, instalá node-fetch.

const { parseLimits } = require('../../utils/limits');

/**
 * Llama a OpenAI para que uno de los roles (Alpha/Beta) responda al otro.
 */
async function fetchCompletion(apiKey, role, prompt, maxTokens) {
  const systemPrompt =
    role === 'Alpha'
      ? 'Sos AI Alpha. Respondé muy breve no más de 14 palabras a AI Beta desde una postura diferente, generá debate.'
      : 'Sos AI Beta. Respondé  muy breve no más de 14 palabras a AI Alpha desde una postura diferente, generá debate.';

  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    max_tokens: maxTokens,
    temperature: 1.5
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error: ${err}`);
  }

  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

exports.handler = async function (event) {
  try {
    const { interactions, max_tokens } = parseLimits(event.queryStringParameters || {});
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Missing OPENAI_API_KEY' }) };
    }

    // Lee el tema del debate desde la query del front
    const topic = (event.queryStringParameters && event.queryStringParameters.topic) || 'Tema libre';

    // Guardas de seguridad suaves
    const turns = Math.max(1, Math.min(Number(interactions) || 3, 12)); // máx 12 rondas
    const maxTokens = Math.max(16, Math.min(Number(max_tokens) || 80, 256)); // 16–256

    const conversation = [];

    // Primer mensaje de Alpha abre el debate con el tema
    let alphaMsg = `Propongo que debatamos sobre: ${topic}. ¿Qué posición tomás, Beta?`;
    conversation.push({ speaker: 'Alpha', message: alphaMsg });

    // Rondas: Beta responde a Alpha, luego Alpha responde a Beta, y así
    for (let i = 0; i < turns; i++) {
      const betaMsg = await fetchCompletion(apiKey, 'Beta', alphaMsg, maxTokens);
      conversation.push({ speaker: 'Beta', message: betaMsg });

      const nextAlpha = await fetchCompletion(apiKey, 'Alpha', betaMsg, maxTokens);
      conversation.push({ speaker: 'Alpha', message: nextAlpha });

      alphaMsg = nextAlpha; // avanza el hilo
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, conversation })
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Internal error' })
    };
  }
};
