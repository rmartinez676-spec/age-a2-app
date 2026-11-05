export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.APIGEMINI || process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'API Key no configurada. Añade GEMINI_API_KEY o APIGEMINI en Settings > Environment Variables de Vercel.'
    });
  }

  const { action } = req.query;
  const body = req.body || {};

  try {
    switch (action) {
      case 'tutor-chat': {
        const tutorName = body.tutorName || 'Racket';
        const topic = body.currentTopicTitle ? `Tema actual: "${body.currentTopicTitle}". ` : '';
        const summary = body.currentTopicSummary ? `Resumen del tema: "${body.currentTopicSummary}". ` : '';
        const laws = body.currentLaws && body.currentLaws.length ? `Leyes clave aplicables: ${body.currentLaws.join(', ')}. ` : '';

        const system = `Eres ${tutorName}, tutora y preparadora de élite para las Oposiciones del Cuerpo de Gestión de la Administración Civil del Estado (Subgrupo A2 GACE) de España.
Tus respuestas deben ser rigurosas, didácticas y específicas de examen. Cita siempre la ley aplicable (Ley 39/2015, Ley 40/2015, TREBEP, LCSP 9/2017, LGP 47/2003, CE 1978, etc.) y los números exactos de artículo.
Destaca siempre los plazos (días hábiles vs naturales), los órganos competentes, el silencio administrativo y los recursos procedentes. Motiva al opositor con rigor administrativo.
${topic}${summary}${laws}`;

        const reply = await callGemini(apiKey, system, body.userMessage || 'Hola');
        return res.status(200).json({ reply });
      }

      case 'explain-concept': {
        const system = `Eres un tribunal examinador y preparador de Gestión A2 del INAP. Explica con precisión jurídica la justificación de la respuesta correcta de la siguiente pregunta de examen.`;
        const prompt = `Pregunta: "${body.question}"
Opciones: ${JSON.stringify(body.options)}
Respuesta correcta (índice 0-3): ${body.correctAnswer}
Referencia legal: ${body.concept || ''}

Redacta una explicación técnica y didáctica:
1. Justifica por qué la opción indicada es la legalmente correcta citando el precepto normativo exacto (artículo, apartado y ley).
2. Explica brevemente por qué las otras opciones son incorrectas o trampas habituales del INAP.`;

        const explanation = await callGemini(apiKey, system, prompt);
        return res.status(200).json({ explanation });
      }

      case 'generate-questions': {
        const count = Math.min(Math.max(body.count || 5, 1), 30);
        const system = `Eres un redactor experto de la Comisión Permanente de Selección (CPS) del INAP para el Cuerpo de Gestión del Estado (A2).
Genera exactamente ${count} preguntas tipo test inéditas, oficiales y rigurosas basadas en la literalidad de la ley.
Devuelve EXCLUSIVAMENTE un objeto JSON con la clave "questions" conteniendo un array:
{
  "questions": [
    {
      "question": "Texto de la pregunta...",
      "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
      "correctAnswer": 0,
      "lawReference": "Art. XX de la Ley YY/ZZZZ",
      "explanation": "Justificación jurídica detallada citando el artículo y aclarando la trampa..."
    }
  ]
}`;
        const prompt = `Bloque: ${body.blockName || 'General'}
Tema: ${body.topicTitle || 'Temario oficial'}
Dificultad: ${body.difficulty || 'Oficial INAP A2'}`;

        const rawJson = await callGemini(apiKey, system, prompt, true);
        const parsed = JSON.parse(rawJson);
        return res.status(200).json(parsed);
      }

      case 'generate-flashcards': {
        const system = `Eres un preparador de oposiciones A2. Genera tarjetas de memoria (flashcards) para repasar plazos críticos, mayorías, órganos competentes y conceptos de examen.
Devuelve EXCLUSIVAMENTE un JSON:
{
  "success": true,
  "cards": [
    {
      "id": "card-1",
      "question": "Pregunta corta o concepto...",
      "answer": "Respuesta clave directa...",
      "legalBasis": "Referencia normativa (Ley y Art.)...",
      "category": "Plazos / Órganos / Procedimiento / Contratación"
    }
  ]
}`;
        const prompt = `Tema: ${body.topicTitle}
Bloque: ${body.blockName}
Leyes: ${JSON.stringify(body.laws || [])}`;

        const rawJson = await callGemini(apiKey, system, prompt, true);
        const parsed = JSON.parse(rawJson);
        return res.status(200).json(parsed);
      }

      case 'generate-case-study': {
        const system = `Eres preparador del Segundo Ejercicio (Caso Práctico) de Gestión de la Administración Civil del Estado (A2 GACE).
Genera un supuesto práctico inédito de formato oficial INAP con un escenario complejo de expediente administrativo/contractual/personal y 4-5 preguntas redactadas para dictamen jurídico.
Devuelve EXCLUSIVAMENTE un JSON:
{
  "success": true,
  "caseStudy": {
    "title": "Título del Caso Práctico",
    "block": "${body.blockName || 'Bloque IV'}",
    "category": "${body.blockName || 'Derecho Administrativo'}",
    "estimatedTimeMinutes": 90,
    "difficulty": "Oficial INAP",
    "scenario": "Descripción detallada con fechas concretas, importes con y sin IVA, procedimiento, plazos y recursos...",
    "questions": [
      {
        "id": "q1",
        "question": "Cuestión jurídica planteada...",
        "maxScore": 2.5,
        "criteria": "Artículos aplicables de la LPAC, LCSP, TREBEP o LGP y doctrina aplicable..."
      }
    ]
  }
}`;
        const prompt = `Bloque temático: ${body.blockName}`;
        const rawJson = await callGemini(apiKey, system, prompt, true);
        const parsed = JSON.parse(rawJson);
        return res.status(200).json(parsed);
      }

      case 'evaluate-case-study': {
        const system = `Eres miembro del Tribunal Calificador del Segundo Ejercicio de Gestión A2 del Estado.
Evalúa con rigor técnico el dictamen presentado por el opositor, puntuando sobre 10 según los criterios oficiales del INAP.
Devuelve EXCLUSIVAMENTE un JSON:
{
  "success": true,
  "evaluation": {
    "score": 7.5,
    "strengths": ["Puntos fuertes y normas bien citadas..."],
    "weaknesses": ["Errores jurídicos u omisiones de plazos/artículos..."],
    "suggestions": "Consejos específicos para mejorar el dictamen ante el tribunal...",
    "modelAnswer": "Respuesta modelo ideal redactada con estilo administrativo formal..."
  }
}`;
        const prompt = `Supuesto: ${body.caseTitle}
Hechos: ${body.scenario}
Preguntas: ${JSON.stringify(body.questions)}
Redacción del alumno:
"""
${body.userDraft}
"""`;
        const rawJson = await callGemini(apiKey, system, prompt, true);
        const parsed = JSON.parse(rawJson);
        return res.status(200).json(parsed);
      }

      case 'check-law-updates': {
        const system = `Eres la tutora preparadora y analista jurídica del BOE para las Oposiciones de Gestión de la Administración Civil del Estado (A2).
Analiza con máximo detalle y rigor la vigencia de la norma y las reformas legislativas que la han modificado recientemente (ej. Real Decreto-ley 6/2023, reformas de empleo público, contratación pública, paridad, etc.).
Debes especificar los cambios normativos reales, los artículos afectados y cómo influyen en las preguntas del examen del INAP.

Devuelve EXCLUSIVAMENTE un JSON con esta estructura exacta:
{
  "success": true,
  "analysis": {
    "lawName": "${body.lawName}",
    "hasUpdates": true,
    "summary": "Análisis técnico exhaustivo de la vigencia de la norma, detallando las reformas recientes y qué títulos o materias son prioritarias para el examen A2...",
    "recentReforms": [
      {
        "normaModificadora": "Ej. Real Decreto-ley 6/2023 o norma correspondiente",
        "articulosAfectados": "Artículos y materias específicas modificadas",
        "impactoEnElTema": "Impacto directo en el examen: preguntas típicas, plazos modificados o posibles trampas del tribunal"
      }
    ],
    "claraAdvice": "Consejo directo de la preparadora sobre qué memorizar al detalle (plazos, competencias o recursos) de esta norma."
  }
}`;
        const prompt = `Norma: ${body.lawName}. Tema: ${body.topicTitle || ''}`;
        const rawJson = await callGemini(apiKey, system, prompt, true);
        const parsed = JSON.parse(rawJson);
        if (parsed.analysis) {
          parsed.analysis.recentReforms = parsed.analysis.recentReforms || [];
          parsed.analysis.claraAdvice = parsed.analysis.claraAdvice || 'Asegura la literalidad de los plazos y las excepciones normativas en este tema.';
        }
        return res.status(200).json(parsed);
      }

      case 'check-all-law-updates': {
        const laws = body.laws || [];
        const system = `Eres un preparador y analista normativo de élite para las Oposiciones del Cuerpo de Gestión del Estado (A2 GACE).
Tu misión es revisar la lista de leyes oficiales del temario y especificar con detalle si han sufrido modificaciones normativas recientes (ej. Real Decreto-ley 6/2023, reformas en función pública y TREBEP, reforma art. 49 CE, novedades en contratación pública LCSP, paridad, etc.).

Para CADA norma de la lista:
1. Si ha tenido reformas recientes relevantes para el examen A2:
   - Marca "status": "revisar"
   - En "summary": especifica la norma modificadora reciente (ej. RDL 6/2023), qué artículos o materias concretas se han modificado y la advertencia clave para el opositor.
2. Si la norma está consolidada sin reformas de última hora:
   - Marca "status": "al_dia"
   - En "summary": especifica de forma técnica los artículos clave más preguntados por el tribunal del INAP (plazos esenciales, órganos competentes y recursos aplicables).
NUNCA pongas textos genéricos como 'la norma está al día'. Aporta siempre detalles concretos (artículos y normas).

Devuelve EXCLUSIVAMENTE un JSON:
{
  "success": true,
  "results": [
    {
      "lawName": "Nombre exacto de la norma",
      "status": "revisar",
      "summary": "Detalle técnico de las modificaciones normativas o artículos clave para el examen..."
    }
  ]
}`;
        const prompt = `Leyes a verificar: ${JSON.stringify(laws)}`;
        const rawJson = await callGemini(apiKey, system, prompt, true);
        const parsed = JSON.parse(rawJson);
        if (parsed.results && Array.isArray(parsed.results)) {
          parsed.results = parsed.results.map(r => ({
            lawName: r.lawName,
            status: r.status === 'revisar' ? 'revisar' : 'al_dia',
            summary: r.summary || 'Norma plenamente vigente en el BOE y consolidada en el temario A2.'
          }));
        }
        return res.status(200).json(parsed);
      }

      default:
        return res.status(400).json({ error: `Acción '${action}' no reconocida` });
    }
  } catch (err) {
    console.error('Gemini Handler Error:', err);
    return res.status(500).json({
      error: 'Error al comunicarse con Gemini AI',
      details: err.message
    });
  }
}

async function callGemini(apiKey, systemInstruction, userPrompt, isJson = false) {
  const models = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const payload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }]
          }
        ]
      };

      if (systemInstruction) {
        payload.systemInstruction = {
          parts: [{ text: systemInstruction }]
        };
      }

      if (isJson) {
        payload.generationConfig = {
          responseMimeType: 'application/json'
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google API (${model}) respondió con código ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return text;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Google Gemini no devolvió contenido.');
}
