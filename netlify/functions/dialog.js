// netlify/functions/dialog.js
const { parseLimits } = require('../../utils/limits');

const OFFTOPIC_PATTERNS = [
  /eficiencia operativa|satisfacci[oó]n del cliente|kpi|kpis|metas específicas|smart|roadmap|recursos y plazos|objetivos|okrs/i,
  /puedo ayudarte|no tengo preferencias|tema específico/i
];

function sanitize(text) {
  let out = (text || '').trim();
  out = out.replace(/\s{2,}/g, ' ').replace(/\.{3,}/g, '…');
  return out;
}
function isOffTopic(text) {
  if (!text) return true;
  return OFFTOPIC_PATTERNS.some(r => r.test(text));
}
function looksTruncated(text) {
  if (!text) return true;
  const t = text.trim();
  const endOK = /[.!?…]$/.test(t);
  const cutStems = /(distors|compet|innov|regulac|coordinac|instituc|plataform)$/i.test(t);
  return !endOK || cutStems;
}

/* ======================
   PROMPTS (DIALOG MODE)
   ====================== */
function rolePromptDialog(role, topic) {
  const scope = `Tema obligatorio: ${topic}. Responde solo sobre historia del pensamiento económico (Adam Smith, s. XVIII), mercados como unidad de análisis y contraste con mercados actuales (oferta/demanda, instituciones, información, competencia, plataformas, efectos de red).`;
  const forbidden = "Prohibido: gestión de proyectos, KPIs empresariales, metas SMART, roadmap, 'puedo ayudarte', 'no tengo preferencias'.";

  if (role === 'Alpha') {
    return [
      "Sos AI Alpha.",
      scope,
      forbidden,
      "ÚNICA tarea: formular UNA pregunta breve, específica y progresiva sobre el tema.",
      "No saludes ni ofrezcas ayuda. Máx. 14 palabras. Terminá con signo de interrogación."
    ].join(' ');
  }
  return [
    "Sos AI Beta.",
    scope,
    forbidden,
    "ÚNICA tarea: responder directa y brevemente (1–2 oraciones, MÁX. 35 palabras), sin preguntas, sin ofertas de ayuda.",
    "Siempre terminá la respuesta con punto. Condensá si falta espacio."
  ].join(' ');
}

/* ======================
   PROMPTS (DEBATE MODE)
   ====================== */
function stanceSentence(role, stance) {
  // Frase corta para fijar postura
  if (stance === 'pro') {
    return role === 'Alpha'
      ? "Defendé la postura PRO: la noción de mercado en Smith sigue siendo fértil para analizar mercados actuales."
      : "Defendé la postura PRO: la noción de mercado en Smith conserva vigencia, con matices contemporáneos.";
  }
  return role === 'Alpha'
    ? "Defendé la postura CONTRA: la noción de mercado en Smith resulta insuficiente para mercados digitales actuales."
    : "Defendé la postura CONTRA: la noción de mercado en Smith es limitada ante plataformas y efectos de red.";
}

function rolePromptDebate(role, topic, stance, opponentStance) {
  const scope = `Tema obligatorio: ${topic}. Centrate en Adam Smith (s. XVIII), su concepto de mercado, y el contraste con mercados actuales (plataformas, información, competencia, regulación, efectos de red).`;
  const rules = [
    stanceSentence(role, stance),
    `Tu oponente defiende la postura ${opponentStance.toUpperCase()}. No coincidas salvo concesión mínima explícita y justificada.`,
    "Evitá muletillas de asistencia. Prohibido: 'puedo ayudarte', 'no tengo preferencias', desvíos a gestión/OKR/KPI.",
  ];

  if (role === 'Alpha') {
    // Alpha SIEMPRE termina con pregunta para forzar el cruce
    rules.push("Producí 1–2 oraciones (MÁX. 40 palabras). Terminá SIEMPRE con una pregunta directa.");
  } else {
    // Beta NO pregunta: rebate y cierra con punto
    rules.push("Producí 1–2 oraciones (MÁX. 40 palabras). Respondé y contra-argumentá. No hagas preguntas. Cerrá con punto.");
  }

  return ["Sos un debatiente disciplinado.", scope, ...rules].join(' ');
}

/* ======================
   CORE CALL
   ====================== */
async function fetchCompletion({ apiKey, role, prompt, maxTokens, systemPrompt }) {
  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    max_tokens: maxTokens,
    temperature: 0.2,
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
  return sanitize(data.choices?.[0]?.message?.content || '');
}

async function safeTurn({ apiKey, role, prompt, maxTokens, systemPrompt, forcePeriod=false, forceQuestion=false }) {
  // intento 1
  let out = await fetchCompletion({ apiKey, role, prompt, maxTokens, systemPrompt });

  // corrige desvío o corte
  if (isOffTopic(out) || looksTruncated(out)) {
    const nudgedPrompt = systemPrompt + " Recordatorio: mantené foco y cerrá correctamente la idea.";
    const boosted = Math.min(Math.ceil(maxTokens * 1.5), 220);
    out = await fetchCompletion({ apiKey, role, prompt, maxTokens: boosted, systemPrompt: nudgedPrompt });
  }

  // aplicar cierres formales según rol
  if (forcePeriod && !/[.!?…]$/.test(out)) out += '.';
  if (forceQuestion) {
    // si no termina en signo de interrogación, reconvierte el cierre
    if (!/\?$/.test(out)) {
      // intenta transformar el último punto en "?"
      out = out.replace(/[.!…]\s*$/, '?');
      if (!/\?$/.test(out)) out += '?';
    }
  }
  return out;
}

/* ======================
   HANDLER
   ====================== */
exports.handler = async function(event) {
  try {
    const { interactions, max_tokens, topic, mode, alpha_stance, beta_stance } =
      parseLimits(event.queryStringParameters || {});
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Missing OPENAI_API_KEY' }) };
    }

    const conversation = [];

    if (mode === 'debate') {
      // Semilla de Alpha con su postura y pregunta
      let alphaPrompt = rolePromptDebate('Alpha', topic, alpha_stance, beta_stance);
      let betaPrompt  = rolePromptDebate('Beta',  topic, beta_stance,  alpha_stance);

      // Alpha inicia con tesis breve y pregunta
      let alphaMsg = await safeTurn({
        apiKey,
        role: 'Alpha',
        prompt: "Iniciá tu tesis según tu postura y cerrá con una pregunta dirigida al punto débil del oponente.",
        maxTokens: max_tokens,
        systemPrompt: alphaPrompt,
        forceQuestion: true
      });
      conversation.push({ speaker: 'Alpha', message: alphaMsg });

      for (let i = 0; i < interactions; i++) {
        // Beta: responde y contra-argumenta (sin preguntas)
        const betaMsg = await safeTurn({
          apiKey,
          role: 'Beta',
          prompt: alphaMsg,
          maxTokens: max_tokens,
          systemPrompt: betaPrompt,
          forcePeriod: true
        });
        conversation.push({ speaker: 'Beta', message: betaMsg });

        // Alpha: recoge lo dicho y vuelve a preguntar (sosteniendo su postura)
        alphaMsg = await safeTurn({
          apiKey,
          role: 'Alpha',
          prompt: betaMsg,
          maxTokens: Math.max(60, Math.min(90, max_tokens)),
          systemPrompt: alphaPrompt,
          forceQuestion: true
        });
        conversation.push({ speaker: 'Alpha', message: alphaMsg });
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, topic, alpha_stance, beta_stance, conversation })
      };
    }

    // ====== MODO DIÁLOGO (por compatibilidad) ======
    let alphaPrompt = rolePromptDialog('Alpha', topic);
    let betaPrompt  = rolePromptDialog('Beta',  topic);

    // Semilla
    let alphaMsg = "En Smith, ¿qué implica tomar el ‘mercado’ como unidad de análisis para precio y competencia?";
    conversation.push({ speaker: 'Alpha', message: alphaMsg });

    for (let i = 0; i < interactions; i++) {
      const betaMsg = await safeTurn({
        apiKey,
        role: 'Beta',
        prompt: alphaMsg,
        maxTokens: max_tokens,
        systemPrompt: betaPrompt,
        forcePeriod: true
      });
      conversation.push({ speaker: 'Beta', message: betaMsg });

      const nextAlpha = await safeTurn({
        apiKey,
        role: 'Alpha',
        prompt: betaMsg,
        maxTokens: Math.max(40, Math.min(80, max_tokens)),
        systemPrompt: alphaPrompt,
        forceQuestion: true
      });
      conversation.push({ speaker: 'Alpha', message: nextAlpha });
      alphaMsg = nextAlpha;
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'dialog', topic, conversation })
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
