import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async (req, res) => {
  const { role, prompt, topic, stance, memory = [] } = req.query;

  try {
    const messages = [];

    // Cargar los últimos 2 turnos previos
    if (memory.length > 0) {
      const history = JSON.parse(memory);
      history.forEach(entry => {
        messages.push({
          role: 'user',
          content: `${entry.speaker}: ${entry.message}`
        });
      });
    }

    // Instrucción base
    messages.push({
      role: 'system',
      content: `Sos AI ${role}. Defendé la postura ${stance.toUpperCase()} sobre el tema "${topic}". Debatí con firmeza y respeto. Respondé con 1 o 2 oraciones.`
    });

    // Último mensaje del oponente
    messages.push({
      role: 'user',
      content: `${role === 'Alpha' ? 'Beta' : 'Alpha'}: ${prompt}`
    });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // Podés cambiar por 'gpt-4o-mini' si querés ahorrar
      messages,
      temperature: 1,
      frequency_penalty: 1.0,
      max_tokens: 150,
    });

    const reply = completion.choices[0].message.content.trim();

    res.status(200).json({ message: reply });
  } catch (err) {
    console.error('ERROR en dialog-libre.js:', err);
    res.status(500).json({ error: 'Error generando respuesta' });
  }
};
