import OpenAI from "openai";

// Modello vision per l'OCR. "gpt-5" e' il piu' accurato su corsivo e moduli
// fotografati; in caso di problemi di disponibilita' sull'account, ripiegare
// su "gpt-4.1" cambiando solo questa costante.
const OCR_MODEL = "gpt-5";

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
Analizza questo documento di scarico sala operatoria (foto, anche inclinata,
con parti stampate e parti scritte a mano). Estrai SOLO i campi indicati.

1. STRUTTURA SANITARIA -> campo "cliente"
- E' l'intestazione del documento: quasi sempre IN ALTO, nell'angolo destro o
  sinistro (a volte centrata), anche su piu' righe o dentro un logo.
- Cerca diciture come: Ospedale, Presidio Ospedaliero, P.O., Azienda
  Ospedaliera, A.O., A.O.U., ASP, Azienda Sanitaria Provinciale, ASL,
  Casa di Cura, Clinica, Policlinico, Istituto, Fondazione.
- Riporta il nome completo della struttura, con l'eventuale citta'.
- NON confondere la struttura con il produttore dei dispositivi
  (es. Zimmer Biomet): quello NON e' il cliente.
- Se davvero assente, usa "".

2. DATA -> campo "data"
- E' la data dell'intervento/documento. Formato SEMPRE italiano
  (giorno/mese/anno): GG/MM/AAAA o GG/MM/AA, separatori possibili / - . ,
  giorno e mese anche a UNA cifra (es. 5/1/26). Spesso scritta a mano.
- Etichette tipiche vicino alla data: Data, Data intervento, Data ricovero,
  del, li.
- Se nel documento ci sono piu' date, scegli quella dell'intervento o del
  documento, MAI la data di nascita del paziente.
- Restituisci la stringa ESATTAMENTE come appare: NON convertirla, NON
  reinterpretare giorno e mese, NON completare l'anno.
- Esempi: "21/12/26" -> "21/12/26" | "05-01-2025" -> "05-01-2025" |
  "5/1/26" -> "5/1/26" | "13.02.26" -> "13.02.26"
- Se non trovi nessuna data, usa "".

3. PAZIENTE -> campo "iniziali_paziente"
- Etichette possibili: Paziente, Paz., Pz., Sig., Sig.ra, Nome, Cognome,
  Iniziali. Spesso scritto a mano.
- Se trovi il nome per esteso NON riportarlo: restituisci SOLO le iniziali
  (prima lettera di nome e cognome). Es. "Mario Rossi" -> "M.R."
- Se trovi gia' delle iniziali (es. "M.R.", "MR"), riportale cosi' come sono.
- Se assente, usa "".

4. CARTELLA CLINICA -> campo "cartella_clinica"
- Etichette possibili: Cartella, Cartella clinica, C.C., CC, N. cartella,
  SDO, Nosologico. E' un numero, a volte con l'anno (es. 1353/26).
- Se assente, usa "".

5. DISPOSITIVI -> campo "righe" (una riga per etichetta dispositivo)
- Per ogni etichetta: REF (codice articolo), LOT (lotto), description.
- Description: breve (2-4 parole), la parte piu' importante e leggibile;
  se presente una misura utile (es. 71mm, 60mm, 10mm), includila.
- Ignora UDI, barcode, GTIN, EDI, indirizzi, materiali e codici lunghi.
- Se stesso REF + LOT compare piu' volte, NON duplicare: somma le quantita'.
- Se il lotto manca, usa stringa vuota.

Rispondi SOLO con JSON valido in questo formato:
{
  "cliente": "nome struttura",
  "data": "GG/MM/AA o GG/MM/AAAA cosi' come appare",
  "iniziali_paziente": "M.R.",
  "cartella_clinica": "12345",
  "righe": [
    {
      "codice_articolo": "REF",
      "description": "Breve descrizione",
      "lotto": "LOT",
      "quantita": 1
    }
  ]
}
`
      : `
Analizza questa etichetta di protesi ortopedica tramite OCR.

Obiettivo: estrarre SOLO questi campi:
- REF (codice articolo)
- LOT (numero di lotto)
- Description (descrizione prodotto breve)

Regole IMPORTANTI:

1. REF:
- È preceduto da "REF", "Ref", "Codice", "Code"
- NON è:
  - UDI
  - GTIN
  - SN / Serial Number
  - EDI
- Di solito è alfanumerico (es. ABC123, 04.001.234)
- Se ci sono più codici, scegli quello più vicino alla dicitura REF

2. LOT:
- È preceduto da "LOT", "Lot", "Lotto"
- Attenzione a errori OCR:
  - "L0T" = LOT
  - "LOI" = LOT
- NON è una data
- NON è un serial number

3. Description:
- Breve (2-4 parole)
- Scegli la parte più importante e leggibile
- Aggiungi misura se presente (es: 71mm, 60mm, 10mm)
- Ignora UDI, barcode, GTIN, codici lunghi, indirizzi, materiali

4. Normalizzazione:
- Applica trim() a tutti i campi
- REF e LOT in MAIUSCOLO
- Description pulita e leggibile
- Non inventare valori

5. Se un campo NON è presente:
- usa stringa vuota ""

5. Ignora completamente:
- barcode
- UDI
- GS1
- QR code
- numeri molto lunghi tipici di GTIN

Rispondi SOLO JSON valido:

{
  "ref": "...",
  "lot": "...",
  "description": "..."
}
`;

    const richiesta = {
      model: OCR_MODEL,
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
    };

    // I modelli gpt-5 ragionano prima di rispondere: per l'OCR basta lo
    // sforzo minimo, che tiene bassa la latenza sul campo.
    if (OCR_MODEL.startsWith("gpt-5")) {
      richiesta.reasoning = { effort: "low" };
    }

    const response = await openai.responses.create(richiesta);

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

// Tollerante sui formati reali: giorno/mese anche a una cifra, separatori
// / - . con eventuali spazi, testo attorno alla data. Rifiuta valori fuori
// range invece di produrre date impossibili.
const normalizeItalianDate = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4}|\d{2})/);
  if (!match) return "";

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = match[3];

  if (day < 1 || day > 31 || month < 1 || month > 12) return "";

  if (year.length === 2) {
    const yy = Number(year);
    year = yy <= 69 ? `20${year}` : `19${year}`;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

// Rete di sicurezza privacy: se il modello riporta un nome per esteso
// nonostante le istruzioni, lo riduce comunque a iniziali.
const normalizeIniziali = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const parole = raw.split(/\s+/).filter((p) => /[A-Za-zÀ-ÿ]/.test(p));
  const sembraNomeEsteso = parole.length >= 2 && parole.every((p) => p.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 2);

  if (sembraNomeEsteso) {
    return parole.map((p) => p.replace(/[^A-Za-zÀ-ÿ]/g, "")[0].toUpperCase() + ".").join("");
  }

  return raw.toUpperCase();
};

if (isDocumentMode) {
  parsed.data = normalizeItalianDate(parsed.data);

  // Sicurezza campi
  parsed.cliente = String(parsed.cliente || "").trim();
  parsed.iniziali_paziente = normalizeIniziali(parsed.iniziali_paziente);
  parsed.cartella_clinica = parsed.cartella_clinica || "";
  parsed.righe = Array.isArray(parsed.righe) ? parsed.righe : [];

  parsed.righe = parsed.righe.map(r => ({
    codice_articolo: String(r.codice_articolo || "").trim().toUpperCase(),
    description: String(r.description || "").trim(),
    lotto: String(r.lotto || "").trim().toUpperCase(),
    quantita: Number(r.quantita) || 1
  }));

  const map = {};

  parsed.righe.forEach(r => {
    const key = r.codice_articolo + "|" + r.lotto;

    if (!map[key]) {
      map[key] = {
        codice_articolo: r.codice_articolo,
        description: r.description,
        lotto: r.lotto,
        quantita: Number(r.quantita) || 1
      };
    } else {
      map[key].quantita += Number(r.quantita) || 1;
    }
  });

  parsed.righe = Object.values(map);
} else {
  parsed.ref = String(parsed.ref || "").trim().toUpperCase();
  parsed.lot = String(parsed.lot || "").trim().toUpperCase();
  parsed.description = String(parsed.description || "").trim();
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
      description: "",
    });

  }

}
