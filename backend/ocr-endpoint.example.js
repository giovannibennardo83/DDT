/**
 * Esempio endpoint OCR per /api/ocr (Node + Express + OpenAI Vision)
 *
 * Requisiti:
 *   npm i express openai dotenv
 *   OPENAI_API_KEY=...
 */

const express = require('express');
const OpenAI = require('openai');

const app = express();
app.use(express.json({ limit: '10mb' }));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/api/ocr', async (req, res) => {
  try {
    const imageBase64 = String(req.body?.imageBase64 || '').trim();

    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 mancante' });
    }

    const prompt = `Analizza questa immagine di una etichetta medica di protesi ortopedica.

Trova:

* REF (codice articolo)
* LOT (numero lotto)

Rispondi SOLO con JSON valido nel formato:
{
  "ref": "...",
  "lot": "..."
}

Se uno dei valori non è presente restituisci stringa vuota.`;

    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            {
              type: 'input_image',
              image_url: `data:image/jpeg;base64,${imageBase64}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'ocr_ref_lot',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              ref: { type: 'string' },
              lot: { type: 'string' },
            },
            required: ['ref', 'lot'],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = response.output_parsed || { ref: '', lot: '' };
    return res.json({
      ref: String(parsed.ref || '').trim(),
      lot: String(parsed.lot || '').trim(),
    });
  } catch (error) {
    console.error('OCR endpoint error:', error);
    return res.status(500).json({ error: 'OCR_FAILED' });
  }
});

app.listen(3000, () => {
  console.log('OCR API pronta su http://localhost:3000');
});
