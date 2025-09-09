const { parseLimits } = require('../../utils/limits');

// Seguridad para texto
function sanitize(text) {
  let out = (text || '').trim();
  out = out.replace(/\s{2,}/g, ' ').replace(/\.{3,}/g, '…');
  return out;
}

// Último mensaje por hablante
function getLastMessage(conversation, speaker) {
  return [...conversation].reverse().find(msg => msg.speaker === speaker)?.message || '';
}

// Prompts
function rolePromptDebate(role, topic, stance, opponentStance) {
  const scope = `Tema obligatorio: ${topic}. Centrate en Adam Smith (s. XVIII), su concepto de mercado, y el contraste con mercados actuales (plataformas, información, competencia, regulación, efectos de red).`;
  const rules = [
    stance === 'pro'
      ? role === 'Alpha'
        ? "Defendé la postura PRO: la noción de mercado en Smith sigue siendo fértil para analizar mercados actuales."
        : "Defendé la postura PRO: la noción de mercado en Smith conserva vigencia, con matices contemporáneos."
      : role === 'Alpha'
      ? "Defendé la postura CONTRA: la noción de mercado en Smith resulta insuficiente para mercados digitales actuales."
      : "Defendé la postura CONTRA: la noción de mercado en Smith es limitada ante plataformas y efectos de red.",
    `Tu oponente defiende la postura ${opponentStance.toUpperCase()}. No coincidas salvo concesión mínima explícita y justificada.`,
    "Evitá muletillas de asistencia. Prohibido: 'puedo ayudarte', 'no tengo preferencias', desvíos a gestión/OKR/KPI."
  ];

  if (role === 'Alpha') {
    rules.push("Producí 1–2 oraciones (MÁX. 40 palabras). Terminá SIEMPRE con una pregunta directa.");
  } else {
    rules.push("Producí 1–2 oraciones (MÁX. 40 palabras). Respondé y contra-argumentá. No hagas preguntas. Cerrá con punto.");
  }

  return ["Sos un debatiente disciplinado.", scope, ...rules].join(' ');
}

// Llamada al modelo
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
  return sanitize(data.choices?.[0]?.message?.content || '');
}

// Turno robusto
async function safeTurn({
  apiKey, role, prompt, maxTokens, systemPrompt,
  temperature, frequency_penalty, forcePeriod = false, forceQuestion = false
}) {
  let out = await fetchCompletion({ apiKey, role, prompt, maxTokens, systemPrompt, temperature, frequency_penalty });

  // corregimos cierre
  if (forcePeriod && !/[.!?…]$/.test(out)) out += '.';
  if (forceQuestion && !/\?$/.test(out)) {
    out = out.replace(/[.!…]\s*$/, '?');
    if (!/\?$/.test(out)) out += '?';
  }

  return out;
}

// Handler principal
exports.handler = async function(event) {
  try {
    const {
      interactions,
      max_tokens,
      topic,
      mode,
      alpha_stance,
      beta_stance,
      temperature = 1,
      frequency_penalty = 0.3,
      conversation: conversationRaw
    } = parseLimits(event.queryStringParameters || {});

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing OPENAI_API_KEY' })
      };
    }

    // Recuperar conversación previa
    let conversation = [];
    if (conversationRaw) {
      try {
        conversation = JSON.parse(conversationRaw);
      } catch (err) {
        console.warn("No se pudo parsear 'conversation'", err);
      }
    }

    const alphaPrompt = rolePromptDebate('Alpha', topic, alpha_stance, beta_stance);
    const betaPrompt = rolePromptDebate('Beta', topic, beta_stance, alpha_stance);

    // Si no hay turnos previos, generamos semilla inicial
    if (conversation.length === 0) {
      const alphaSeed = await safeTurn({
        apiKey,
        role: 'Alpha',
        prompt: "Iniciá la tesis PRO o CONTRA según postura, y cerrá con pregunta al oponente.",
        maxTokens: max_tokens,
        systemPrompt: alphaPrompt,
        temperature,
        frequency_penalty,
        forceQuestion: true
      });

      conversation.push({ speaker: 'Alpha', message: alphaSeed });
    }

    let lastSpeaker = conversation.at(-1).speaker;
    let nextSpeaker = lastSpeaker === 'Alpha' ? 'Beta' : 'Alpha';

    for (let i = 0; i < interactions; i++) {
      const lastMsg = conversation.at(-1).message;

      const systemPrompt = nextSpeaker === 'Alpha' ? alphaPrompt : betaPrompt;
      const forceQuestion = nextSpeaker === 'Alpha';
      const forcePeriod = nextSpeaker === 'Beta';

      const response = await safeTurn({
        apiKey,
        role: nextSpeaker,
        prompt: lastMsg,
        maxTokens: max_tokens,
        systemPrompt,
        temperature,
        frequency_penalty,
        forceQuestion,
        forcePeriod
      });

      conversation.push({ speaker: nextSpeaker, message: response });

      // Alternar turno
      nextSpeaker = nextSpeaker === 'Alpha' ? 'Beta' : 'Alpha';
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'debate-memoria',
        topic,
        alpha_stance,
        beta_stance,
        temperature,
        frequency_penalty,
        conversation
      })
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
