const { parseLimits } = require('../../utils/limits');

function sanitize(text) {
  let out = (text || '').trim();
  out = out.replace(/\s{2,}/g, ' ').replace(/\.{3,}/g, '…');
  return out;
}

// Core call to OpenAI
async function fetchCompletion({ apiKey, role, prompt, maxTokens, systemPrompt, temperature, frequency_penalty }) {
  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    max_tokens: maxTokens,
    temperature,
    frequency_penalty
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`OpenAI error: ${err}`);
    throw new Error(`OpenAI error: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  return sanitize(typeof content === 'string' ? content : '[sin respuesta]');
}

// Memoria parcial: últimos dos turnos
function buildPromptFromMemory(convo) {
  const lastTwo = convo.slice(-2).map(c => `${c.speaker}: ${c.message}`).join('\n');
  return `Continuá el diálogo respetando el tono y el contenido. Respondé como ${convo[convo.length - 1].speaker === 'Alpha' ? 'Beta' : 'Alpha'}:\n${lastTwo}`;
}

function rolePrompt(role) {
  return [
    `Sos ${role}, una inteligencia artificial que participa en un diálogo argumentativo sobre economía.`,
    "Respondé con claridad, concisión (1–2 oraciones, máx. 45 palabras).",
    "Prohibido saludar, desviar el tema o usar muletillas como 'puedo ayudarte'.",
    role === 'Alpha'
      ? "Siempre terminá con una pregunta directa para sostener el intercambio."
      : "Respondé, contraargumentá y cerrá con punto. No hagas preguntas."
  ].join(' ');
}

async function safeTurnWithMemory({ apiKey, role, conversation, maxTokens, temperature, frequency_penalty }) {
  const systemPrompt = rolePrompt(role);
  const prompt = buildPromptFromMemory(conversation);

  const out = await fetchCompletion({
    apiKey,
    role,
    prompt,
    maxTokens,
    systemPrompt,
    temperature,
    frequency_penalty
  });

  console.log(`🎤 ${role}:`, out);
  return out;
}

exports.handler = async function (event) {
  try {
    const {
      interactions,
      max_tokens,
      topic,
      temperature = 1,
      frequency_penalty = 0.3
    } = parseLimits(event.queryStringParameters || {});
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Missing OPENAI_API_KEY' }) };
    }

    const conversation = [];

    // Semilla inicial
    const alphaSeed = `Alpha: ¿Cómo influye la noción de mercado en Adam Smith en el análisis de plataformas actuales?`;
    conversation.push({ speaker: 'Alpha', message: alphaSeed });

    for (let i = 0; i < interactions; i++) {
      const betaMsg = await safeTurnWithMemory({
        apiKey,
        role: 'Beta',
        conversation,
        maxTokens: max_tokens,
        temperature,
        frequency_penalty
      });
      conversation.push({ speaker: 'Beta', message: betaMsg });

      const alphaMsg = await safeTurnWithMemory({
        apiKey,
        role: 'Alpha',
        conversation,
        maxTokens: max_tokens,
        temperature,
        frequency_penalty
      });
      conversation.push({ speaker: 'Alpha', message: alphaMsg });
    }

    console.log('📋 CONVERSACIÓN FINAL:', conversation);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'debate-libre-memoria', topic, conversation })
    };
  } catch (e) {
    console.error('🔥 ERROR:', e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
