const { parseLimits } = require('../../utils/limits');

const alphaPrompt = `Sos Alpha, una inteligencia artificial que sostiene una postura. Respondé con convicción y argumentos claros. Mantené un tono firme pero constructivo. Siempre terminá tu intervención con una pregunta desafiante para Beta.`;
const betaPrompt = `Sos Beta, una inteligencia artificial que adopta una postura contraria. Respondé con argumentos sólidos y matices. Reconocé si hay algo válido en lo dicho por Alpha, pero desarrollá una posición diferente. Terminá con una frase contundente, no con una pregunta.`;

async function safeTurn({ apiKey, prompt, maxTokens, systemPrompt, forceQuestion = false, forcePeriod = false, history = [] }) {
  const fullPrompt = history.concat([{ role: 'user', content: prompt }]);

  const body = {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      ...fullPrompt
    ],
    max_tokens: maxTokens,
    temperature: 1,
    frequency_penalty: 0.3
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
  let content = data.choices[0].message.content.trim();

  if (forceQuestion && !content.trim().endsWith('?')) {
    content = content.replace(/[.!]+$/, '') + '?';
  }

  if (forcePeriod && !content.trim().endsWith('.')) {
    content = content.replace(/[!?]+$/, '') + '.';
  }

  return content;
}

exports.handler = async function(event) {
  const { interactions, max_tokens } = parseLimits(event.queryStringParameters);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing OPENAI_API_KEY' })
    };
  }

  const conversation = [];

  // 🔸 Primera intervención de Alpha
  let lastAlpha = 'La noción de mercado de Adam Smith, centrada en la libre competencia y el interés propio, sigue siendo relevante hoy en día, ya que los principios de oferta y demanda subyacen en las dinámicas de plataformas digitales. ¿Cómo puede su enfoque ser irrelevante si aún observamos estos principios en acción?';
  conversation.push({ speaker: 'Alpha', message: lastAlpha });

  // 🔸 Primer turno de Beta
  let lastBeta = await safeTurn({
    apiKey,
    prompt: lastAlpha,
    maxTokens: max_tokens,
    systemPrompt: betaPrompt,
    forcePeriod: true,
    history: [
      { role: 'user', content: lastAlpha }
    ]
  });
  conversation.push({ speaker: 'Beta', message: lastBeta });

  // 🔁 Ciclo de turnos restantes
  for (let i = 0; i < interactions - 1; i++) {
    // Alpha responde a Beta
    lastAlpha = await safeTurn({
      apiKey,
      prompt: lastBeta,
      maxTokens: Math.max(60, Math.min(90, max_tokens)),
      systemPrompt: alphaPrompt,
      forceQuestion: true,
      history: [
        { role: 'user', content: lastBeta },
        { role: 'assistant', content: lastAlpha }
      ]
    });
    conversation.push({ speaker: 'Alpha', message: lastAlpha });

    // Beta responde a Alpha
    lastBeta = await safeTurn({
      apiKey,
      prompt: lastAlpha,
      maxTokens: max_tokens,
      systemPrompt: betaPrompt,
      forcePeriod: true,
      history: [
        { role: 'user', content: lastAlpha }
      ]
    });
    conversation.push({ speaker: 'Beta', message: lastBeta });
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation })
  };
};
