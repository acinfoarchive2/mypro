// netlify/functions/dialog-libre.js

exports.handler = async function(event) {
  const { role, prompt, topic, stance } = event.queryStringParameters;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: 'Falta OPENAI_API_KEY' }) };

  const stanceLabel = stance?.toLowerCase() === 'contra' ? 'en contra' : 'a favor';

  const systemPrompt = [
    `Tema: ${topic}.`,
    `Tu rol es ${role}.`,
    `Defendé la postura ${stanceLabel} con respeto y argumentos breves.`,
    role === 'Alpha'
      ? 'Hacé una afirmación o contraargumento, y terminá con una pregunta desafiante. No repitas lo anterior.'
      : 'Respondé la pregunta anterior y contraargumentá sin devolver preguntas. Cerrá con punto.'
  ].join(' ');

  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    max_tokens: 100,
    temperature: 0.3,
    frequency_penalty: 0.3
  };

  try {
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
      return { statusCode: 500, body: JSON.stringify({ error: 'OpenAI error: ' + err }) };
    }

    const data = await res.json();
    const message = data.choices?.[0]?.message?.content?.trim() || '';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    };

  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
