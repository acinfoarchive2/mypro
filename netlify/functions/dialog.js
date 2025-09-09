// netlify/functions/dialog.js
const { parseLimits } = require('../../utils/limits');

// --- prompts estrictos y topic-aware ---
function rolePrompt(role, topic) {
  const scope = `Tema obligatorio: ${topic}. Responde solo sobre historia del pensamiento económico (Adam Smith, s. XVIII), mercados como unidad de análisis y contraste con mercados actuales (oferta/demanda, instituciones, información, competencia, plataformas, efectos de red).`;
  const forbidden = "Prohibido: hablar de gestión de proyectos, KPIs empresariales, eficiencia operativa, satisfacción del cliente, metas SMART, roadmap, 'puedo ayudarte', 'no tengo preferencias'.";

  if (role === 'Alpha') {
    return [
      "Sos AI Alpha.",
      scope,
      forbidden,
      "Tu única tarea: formular UNA pregunta breve, específica y progresiva sobre el tema.",
      "No saludes ni ofrezcas ayuda. Máx. 18 palabras. Terminá con signo de interrogación."
    ].join(' ');
  }
  // Beta
  return [
    "Sos AI Beta.",
    scope,
    forbidden,
    "Tu única tarea: responder de forma directa y breve (1–3 oraciones), sin preguntas, sin ofertas de ayuda.",
    "Si Alpha es ambiguo, inferí desde el tema y mantené el foco histórico/conceptual."
  ].join(' ');
}

// --- chequeo de desvío y sanitizado ---
const OFFTOPIC_PATTERNS = [
  /eficiencia operativa|satisfacci[oó]n del cliente|kpi|kpis|metas específicas|smart|roadmap|recursos y plazos|objetivos|okrs/i,
  /puedo ayudarte|no tengo preferencias|tema específico/i
];

function sanitize(text) {
  let out = (text || '').trim();
  out = out.replace(/\s{2,}/g, ' ').replace(/\.{3,}/g, '…');
  // Evitar terminar en signo de pregunta para Beta (no debe preguntar)
  if (out.endsWith('?')) out = out.slice(0, -1) + '.';
  return out;
}

function isOffTopic(text) {
  if (!text) return true;
  return OFFTOPIC_PATTERNS.some(r => r.test(text));
}

async function fetchCompletion(apiKey, role, prompt, maxTokens, topic, strictNudge=false) {
  const systemPrompt = strictNudge
    ? rolePrompt(role, topic) + " Recordatorio fuerte: mantené el foco en Adam Smith vs mercados actuales; nada de gestión empresarial."
    : rolePrompt(role, topic);

  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    max_tokens: maxTokens,
    temperature: 0.25,
    frequency_penalty: 0.2
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error: ${err}`);
  }

  const data = await res.json();
  const content = (data.choices?.[0]?.message?.content || '').trim();
  return sanitize(content);
}

exports.handler = async function(event) {
  try {
    const { interactions, max_tokens, topic } = parseLimits(event.queryStringParameters || {});
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Missing OPENAI_API_KEY' }) };
    }

    const t = topic || "Mercados como unidad de análisis en el contexto histórico de Adam Smith y mercados actuales";
    const conversation = [];

    // Semilla: Alpha arranca ya enfocado en el tema
    let alphaMsg = "En Smith, ¿qué implica tomar el ‘mercado’ como unidad de análisis respecto de precio y competencia?";
    conversation.push({ speaker: 'Alpha', message: alphaMsg });

    for (let i = 0; i < interactions; i++) {
      // Beta responde
      let betaMsg = await fetchCompletion(apiKey, 'Beta', alphaMsg, max_tokens, t);
      if (isOffTopic(betaMsg)) {
        betaMsg = await fetchCompletion(apiKey, 'Beta', alphaMsg, max_tokens, t, true);
      }
      conversation.push({ speaker: 'Beta', message: betaMsg });

      // Alpha pregunta en base a la respuesta de Beta
      let nextAlpha = await fetchCompletion(apiKey, 'Alpha', betaMsg, max_tokens, t);
      if (isOffTopic(nextAlpha)) {
        nextAlpha = await fetchCompletion(apiKey, 'Alpha', betaMsg, max_tokens, t, true);
      }
      conversation.push({ speaker: 'Alpha', message: nextAlpha });
      alphaMsg = nextAlpha;
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation, topic: t })
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
