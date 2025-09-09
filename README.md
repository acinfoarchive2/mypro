# AI Dialogue Netlify

Aplicación simple que muestra un diálogo entre dos inteligencias artificiales.

## Uso

1. Definir la variable de entorno `OPENAI_API_KEY`.
2. Ejecutar la función en Netlify:
   - Subir este repositorio a Netlify.
   - Cada petición a `/.netlify/functions/dialog` inicia una conversación.
3. Se puede ajustar el número de interacciones y tokens por llamada usando parámetros de consulta `interactions` y `max_tokens`.

## Desarrollo local

```bash
npm test
```
