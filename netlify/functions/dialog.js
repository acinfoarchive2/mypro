const { parseLimits } = require('../../utils/limits');

function rolePrompt(role) {
  if (role === 'Alpha') {
    return [
      "Sos AI Alpha.",
      "Tu ÚNICA tarea es formular UNA pregunta breve y concreta para avanzar el tema.",
      "NO ofrezcas ayuda, NO digas 'puedo ayudar', NO propongas pasos a seguir.",
      "No des consejos, no expliques. Solo UNA pregunta de máximo 15 palabras.",
      "Terminá SIEMPRE con signo de interrogación."
    ].join(' ');
  }
  // Beta
  return [
    "Sos AI Beta.",
    "Tu ÚNICA tarea es responder DIRECTAMENTE a la última pregunta de Alpha.",
    "NO ofrezcas ayuda, NO invites a seguir, NO preguntes nada.",
    "No incluyas frases como 'si necesitás', 'puedo ayudarte', 'avisame'.",
    "Respondé en 1–3 oraciones, sin preguntas."
  ].join(' ');
}

// Sanea muletillas típicas de ofrecimiento de ayuda o cierres “marketineros”
function sanitize(text) {
  const patterns = [
    /¿?en qué (más )?puedo ayudarte\??/gi,
    /¿?cómo puedo ayudarte\??/gi,
    /si necesitás (algo|más) .*? avis(a|á)me\.?/gi,
    /qued(o|a) a disposici(ó|o)n\.?/gi,
    /puedo (ayudarte|asistirte).*/gi,
    /no dudes en.*/gi,
    /si quer(e|é)s, puedo.*/gi
  ];
  let out = text.trim();
  for (const p of patterns) out = out.replace(p, '').trim();

  // Si Beta llega a terminar con "?" (no debería), forzamos punto.
  if (out.endsWith('?')) out = out.slice(0, -1) + '.';

  // Limpieza de espacios dobles y puntos repetidos
  out = out.replace(/\s{2,}/g, ' ').replace(/\.{3,}/g, '…');
  return out;
}

async function fetchCompletion(apiKey, role, prompt, maxTokens) {
  const systemPrompt = rolePrompt(role);

  const body = {
    // Sugerido: modelos actuales económicos y buenos para chats breves
    model: 'gpt-4o-mini',          // si querés ultra low-cost: 'gpt-4.1-mini'
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    max_tokens: maxTokens,
    temperature: 0.3,
    presence_penalty: 0,
    frequency_penalty: 0.2
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
  return sanitize(data.choices[0].message.content || '');
}

exports.handler = async function(event) {
  const { interactions, max_tokens, topic } = parseLimits(event.queryStringParameters);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing OPENAI_API_KEY' }) };
  }

  const conversation = [];
  // Alpha arranca SIEMPRE con una pregunta, no con saludo
  let alphaMsg = topic
    ? `Sobre "${topic}", ¿qué dato clave falta para avanzar?`
    : '¿Cuál es el dato clave que falta para avanzar?';
  conversation.push({ speaker: 'Alpha', message: alphaMsg });

  for (let i = 0; i < interactions; i++) {
    const betaMsg = await fetchCompletion(apiKey, 'Beta', alphaMsg, max_tokens);
    conversation.push({ speaker: 'Beta', message: betaMsg });

    const nextAlpha = await fetchCompletion(apiKey, 'Alpha', betaMsg, max_tokens);
    conversation.push({ speaker: 'Alpha', message: nextAlpha });
    alphaMsg = nextAlpha;
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation })
  };
};
