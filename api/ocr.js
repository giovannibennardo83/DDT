import OpenAI from "openai";

export default async function handler(req, res) {

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { imageBase64, mode } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "No image provided" });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const isDocumentMode = mode === "document";

    const prompt = isDocumentMode
      ? `
Analizza questo documento di scarico sala operatoria.

Regole OCR:
- Estrai intestazione ospedale/struttura come "cliente"
- Estrai data documento in formato YYYY-MM-DD
- Estrai iniziali paziente come "iniziali_paziente"
- Estrai numero cartella clinica (C/C) come "cartella_clinica"
- Estrai tutte le etichette dispositivi come righe con REF e LOT
- Ignora UDI, barcode, EDI
- Se lotto manca, usa stringa vuota
- Gestisci anche foto inclinate

Rispondi SOLO JSON valido in questo formato:
{
  "cliente": "nome struttura",
  "data": "YYYY-MM-DD",
  "iniziali_paziente": "XX",
  "cartella_clinica": "12345",
  "righe": [
    {
      "codice_articolo": "REF",
      "lotto": "LOT",
      "quantita": 1
    }
  ]
}
`
      : `
Analizza questa etichetta di protesi ortopedica.

Trova:
REF = codice articolo
LOT = numero lotto

Rispondi SOLO JSON:

{
 "ref": "...",
 "lot": "..."
}
`;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            {
              type: "input_image",
              image_url: "data:image/jpeg;base64," + imageBase64
            }
          ]
        }
      ]
    });

    const outputText = response.output_text;

const clean = outputText
  .replace(/```json/g, "")
  .replace(/```/g, "")
  .trim();

let parsed;

try {
  parsed = JSON.parse(clean);
} catch (e) {
  console.error("JSON PARSE ERROR:", clean);
  throw new Error("Invalid JSON from OCR");
}
    return res.status(200).json(parsed);

  } catch (err) {

    console.error("OCR ERROR:", err);

    const isDocumentMode = req.body?.mode === "document";
    if (isDocumentMode) {
      return res.status(500).json({
        cliente: "",
        data: "",
        iniziali_paziente: "",
        cartella_clinica: "",
        righe: [],
      });
    }

    return res.status(500).json({
      ref: "",
      lot: "",
    });

  }

}
