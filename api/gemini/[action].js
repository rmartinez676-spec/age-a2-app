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
        const summary = body.currentTopicSummary ? `Resumen: "${body.currentTopicSummary}". ` : '';
        const laws = body.currentLaws && body.currentLaws.length ? `Leyes aplicables: ${body.currentLaws.join(', ')}. ` : '';

        const system = `Eres ${tutorName}, tutora y preparadora de élite para las Oposiciones del Cuerpo de Gestión de la Administración Civil del Estado (Subgrupo A2 GACE) de España.
Responde a las dudas del opositor de forma didáctica, rigurosa y motivadora, citando siempre los artículos y leyes oficiales españolas (CE 1978, Ley 39/2015, Ley 40/2015, TREBEP, LCSP 9/2017, LGP 47/2003, etc.).
${topic}${summary}${laws}`;

        const reply = await callGemini(apiKey, system, body.userMessage || 'Hola');
        return res.status(200).json({ reply });
      }

      case 'explain-concept': {
        const system = `Eres un tribunal examinador y preparador de Gestión A2 del INAP. Explica con precisión jurídica la justificación de la respuesta correcta de la siguiente pregunta.`;
        const prompt = `Pregunta: "${body.question}"
Opciones: ${JSON.stringify(body.options)}
Respuesta correcta (índice 0-3): ${body.correctAnswer}
Referencia legal: ${body.concept || ''}

Redacta una explicación clara, indicando el porqué de la opción correcta y citando el precepto legal exacto.`;

        const explanation = await callGemini(apiKey, system, prompt);
        return res.status(200).json({ explanation });
      }

      case 'generate-questions': {
        const count = Math.min(Math.max(body.count || 5, 1), 30);
        const system = `Eres un redactor experto de la Comisión Permanente de Selección (CPS) del INAP para las oposiciones del Cuerpo de Gestión del Estado (A2).
Genera exactamente ${count} preguntas tipo test inéditas, oficiales y rigurosas.
Devuelve EXCLUSIVAMENTE un objeto JSON con la clave "questions" conteniendo un array de objetos:
{
  "questions": [
    {
      "question": "Texto de la pregunta...",
      "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
      "correctAnswer": 0,
      "lawReference": "Art. XX de la Ley YY/ZZZZ",
      "explanation": "Justificación jurídica detallada..."
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
        const system = `Eres un preparador de oposiciones A2. Genera tarjetas de memoria (flashcards) para repasar plazos, mayorías, órganos competentes y conceptos clave.
Devuelve EXCLUSIVAMENTE un JSON:
{
  "success": true,
  "cards": [
    {
      "id": "card-1",
      "question": "Pregunta corta o concepto...",
      "answer": "Respuesta clave...",
      "legalBasis": "Referencia normativa...",
      "category": "Plazos / Órganos / Definición"
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
Genera un supuesto práctico inédito de formato oficial INAP con un escenario complejo y 4-5 preguntas redactadas para dictamen.
Devuelve EXCLUSIVAMENTE un JSON:
{
  "success": true,
  "caseStudy": {
    "title": "Título del Caso Práctico",
    "block": "${body.blockName || 'Bloque IV'}",
    "category": "${body.blockName || 'Derecho Administrativo'}",
    "estimatedTimeMinutes": 90,
    "difficulty": "Oficial INAP",
    "scenario": "Descripción detallada de los hechos, fechas, importes, licitaciones o expedientes...",
    "questions": [
      {
        "id": "q1",
        "question": "Cuestión planteada...",
        "maxScore": 2.5,
        "criteria": "Criterios de valoración y artículos aplicables..."
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
Evalúa con rigor técnico el dictamen presentado por el opositor.
Devuelve EXCLUSIVAMENTE un JSON:
{
  "success": true,
  "evaluation": {
    "score": 7.5,
    "strengths": ["Puntos fuertes analizados..."],
    "weaknesses": ["Errores u omisiones detectadas..."],
    "suggestions": "Consejos para mejorar la nota ante el tribunal...",
    "modelAnswer": "Respuesta modelo ideal que habría obtenido un 10..."
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
        const system = `Eres analista normativo del Boletín Oficial del Estado (BOE) para oposiciones de Gestión A2 en España.
Analiza la vigencia y reformas de la norma consultada.
Devuelve EXCLUSIVAMENTE un JSON:
{
  "success": true,
  "analysis": {
    "lawName": "${body.lawName}",
    "hasUpdates": false,
    "summary": "Resumen claro del estado de vigencia de la norma y su aplicación al temario de Gestión A2...",
    "recentReforms": [
      {
        "normaModificadora": "Ej. Real Decreto-ley o Ley modificadora reciente",
        "articulosAfectados": "Artículos clave modificados",
        "impactoEnElTema": "Detalle sobre cómo afecta a las preguntas del examen oficial"
      }
    ],
    "claraAdvice": "Consejo práctico y truco de examen para el opositor sobre los plazos y artículos más preguntados."
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
        const system = `Eres analista normativo de oposiciones de Gestión del Estado A2 (INAP/BOE).
Revisa la vigencia de la lista de leyes y devuelve EXCLUSIVAMENTE un JSON:
{
  "success": true,
  "results": [
    {
      "lawName": "Nombre exacto de la norma",
      "status": "al_dia",
      "summary": "Resumen conciso de su vigencia y aplicación al examen A2"
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
            summary: r.summary || 'Norma plenamente vigente y consolidada en el BOE.'
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
