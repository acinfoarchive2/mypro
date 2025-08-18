export async function handler(event, context) {
  try {
    const body = event.body;
    const resp = await fetch("https://hook.us2.make.com/itsh9cxldyb9vgcmost1x6be6mnlf86u", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    });
    const text = await resp.text();
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain" },
      body: text
    };
  } catch (err) {
    return { statusCode: 500, body: "Error en proxy" };
  }
}
