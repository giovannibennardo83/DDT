import OpenAI from "openai";

export default async function handler(req, res) {

  try {

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "No image provided" });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const prompt = `
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

    const text = response.output[0].content[0].text;

    const parsed = JSON.parse(text);

    return res.status(200).json(parsed);

  } catch (err) {

    console.error("OCR ERROR:", err);

    return res.status(500).json({
      ref: "",
      lot: ""
    });

  }

}
