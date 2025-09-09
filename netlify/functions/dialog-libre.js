const { parseLimits } = require('../../utils/limits');

// Sanitiza texto
function sanitize(text) {
  return text.replace(/^\s+|\s+$/g, '').replace(/\s+$/, '');
}

async function fetchCompletion({ apiKey, prompt, maxTokens, systemPrompt, history = [] }) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: prompt }
  ];

  const body = {
    model: 'gpt-4o-mini',
    messages,
    max_tokens: maxTokens,
    temperature: 1,
    frequency_penalty: 0.8
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
  return sanitize(data.choices?.[0]?.message?.content || '');
}

async function safeTurn({ apiKey, prompt, maxTokens, systemPrompt, forcePeriod = false, forceQuestion = false, history = [] }) {
  let out = await fetchCompletion({ apiKey, prompt, maxTokens, systemPrompt, history });

  if (forcePeriod && !/[.?!…]$/.test(out)) {
    const nudgedPrompt = prompt + '.';
    out = await fetchCompletion({ apiKey, prompt: nudgedPrompt, maxTokens, systemPrompt, history });
  }

  if (forceQuestion && !/\?[\s\u00A0]*$/.test(out)) {
    const nudgedPrompt = prompt + ' ¿No te parece?';
    out = await fetchCompletion({ apiKey, prompt: nudgedPrompt, maxTokens, systemPrompt, history });
  }

  return out;
}

exports.handler = async function(event) {
  const { interactions, max_tokens } = parseLimits(event.queryStringParameters);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing OPENAI_API_KEY' }) };
  }

  const conversation = [];
  const alphaPrompt = 'Sos IA Alpha. Argumentá con firmeza, incluí referencias a Adam Smith si es necesario, y cerrá con una pregunta provocadora.';
  const betaPrompt = 'Sos IA Beta. Contradecí respetuosamente, señalá limitaciones históricas o actuales de la visión de Smith. No hagas preguntas.';

  let lastAlpha = 'La noción de mercado de Adam Smith, centrada en la libre competencia y el interés propio, sigue siendo relevante hoy en día, ya que los principios de oferta y demanda subyacen en las dinámicas de plataformas digitales. ¿Cómo puede su enfoque ser irrelevante si aún observamos estos principios en acción?';
  conversation.push({ speaker: 'Alpha', message: lastAlpha });

  let lastBeta = '';

  for (let i = 0; i < interactions; i++) {
    // Beta responde
    const betaMsg = await safeTurn({
      apiKey,
      prompt: lastAlpha,
      maxTokens: max_tokens,
      systemPrompt: betaPrompt,
      forcePeriod: true,
      history: [
        { role: 'user', content: lastAlpha }
      ]
    });
    conversation.push({ speaker: 'Beta', message: betaMsg });
    lastBeta = betaMsg;

    // Alpha responde
    const alphaMsg = await safeTurn({
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
    conversation.push({ speaker: 'Alpha', message: alphaMsg });
    lastAlpha = alphaMsg;
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation })
  };
};
