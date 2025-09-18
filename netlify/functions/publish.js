const DEFAULT_BLOG_ID = '7027208528883466919';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS, POST',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function jsonResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, ...extraHeaders },
    body: JSON.stringify(body)
  };
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildContentHtml(rawContent, imageDataUrl, title) {
  const sections = [];
  const safeTitle = escapeHtml(title);

  if (imageDataUrl) {
    sections.push(
      `<figure style="text-align:center;">` +
        `<img src="${imageDataUrl}" alt="${safeTitle}" style="max-width:100%;height:auto;" />` +
      '</figure>'
    );
  }

  const paragraphs = rawContent
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`);

  if (paragraphs.length > 0) {
    sections.push(paragraphs.join('\n'));
  }

  return sections.join('\n\n');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Método no permitido.' }, { 'Allow': 'POST, OPTIONS' });
  }

  const token = process.env.BLOGGER_ACCESS_TOKEN;
  if (!token) {
    return jsonResponse(500, { error: 'Falta configurar BLOGGER_ACCESS_TOKEN.' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (error) {
    return jsonResponse(400, { error: 'JSON inválido.' });
  }

  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const content = typeof payload.content === 'string' ? payload.content.trim() : '';
  const rawImage = typeof payload.imageDataUrl === 'string' ? payload.imageDataUrl.trim() : '';

  if (!title || !content) {
    return jsonResponse(400, { error: 'El título y el contenido son obligatorios.' });
  }

  let imageDataUrl = '';
  if (rawImage) {
    const isValidDataUrl = /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(rawImage);
    if (!isValidDataUrl) {
      return jsonResponse(400, { error: 'Formato de imagen no válido.' });
    }
    imageDataUrl = rawImage;
  }

  const blogId = process.env.BLOGGER_BLOG_ID || DEFAULT_BLOG_ID;
  const apiUrl = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/`;

  const postContent = buildContentHtml(content, imageDataUrl, title);
  const body = {
    kind: 'blogger#post',
    title,
    content: postContent
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data && data.error && data.error.message
        ? data.error.message
        : 'La API de Blogger devolvió un error.';
      return jsonResponse(response.status, { error: message });
    }

    return jsonResponse(200, { id: data.id, url: data.url });
  } catch (error) {
    console.error('Blogger publish error:', error);
    return jsonResponse(500, { error: 'No se pudo contactar con la API de Blogger.' });
  }
};
