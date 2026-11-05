// API handler for Google Gemini AI in Vercel Serverless Function
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

  if (action === 'list-models') {
    try {
      const resModels = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      const data = await resModels.json();
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (action === 'test-models') {
    const models = [
      'gemini-flash-lite-latest',
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-pro-latest'
    ];
    const results = {};
    for (const m of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
        const resTest = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Hola' }] }] })
        });
        const d = await resTest.json();
        results[m] = resTest.status === 200
          ? 'OK: ' + (d.candidates?.[0]?.content?.parts?.[0]?.text || '').slice(0, 60)
          : 'ERR: ' + JSON.stringify(d.error?.message || d);
      } catch (e) {
        results[m] = 'EXC: ' + e.message;
      }
    }
    return res.status(200).json(results);
  }

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

        try {
          const reply = await callGemini(apiKey, system, body.userMessage || 'Hola');
          return res.status(200).json({ reply });
        } catch (callErr) {
          console.warn('Fallback tutor response due to:', callErr.message);
          return res.status(200).json({
            reply: `¡Hola! Como tu preparadora de Gestión A2 GACE, te respondo directamente: respecto a tu consulta sobre "${body.userMessage || 'la normativa'}", en el marco de la normativa aplicable (LPAC 39/2015, LRJSP 40/2015, TREBEP y LCSP 9/2017), recuerda verificar siempre la literalidad de los artículos en el BOE, prestando especial atención a si los plazos computan en días hábiles (excluyendo sábados, domingos y festivos) o naturales, los órganos con competencia resolutoria y la vía de recurso procedente (alzada en 1 mes o reposición en 1 mes). ¡Continúa con el estudio!`
          });
        }
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
        const lawKey = (body.lawName || '').toLowerCase();
        let fallbackAnalysis = getA2LawFallback(lawKey, body.lawName);

        try {
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
          if (parsed && parsed.analysis) {
            parsed.analysis.recentReforms = parsed.analysis.recentReforms || [];
            parsed.analysis.claraAdvice = parsed.analysis.claraAdvice || 'Asegura la literalidad de los plazos y las excepciones normativas en este tema.';
            return res.status(200).json(parsed);
          }
        } catch (e) {
          console.warn('Using expert fallback for law update:', e.message);
        }

        return res.status(200).json({ success: true, analysis: fallbackAnalysis });
      }

      case 'check-all-law-updates': {
        const laws = body.laws || [];
        try {
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
          if (parsed && parsed.results && Array.isArray(parsed.results) && parsed.results.length > 0) {
            parsed.results = parsed.results.map(r => ({
              lawName: r.lawName,
              status: r.status === 'revisar' ? 'revisar' : 'al_dia',
              summary: r.summary || 'Norma plenamente vigente en el BOE y consolidada en el temario A2.'
            }));
            return res.status(200).json(parsed);
          }
        } catch (scanErr) {
          console.warn('Gemini law scan failed, using expert A2 legal database:', scanErr.message);
        }

        // Return expert pre-compiled analysis for all A2 laws
        const results = laws.map(lawName => {
          const lk = lawName.toLowerCase();
          const fb = getA2LawFallback(lk, lawName);
          return {
            lawName,
            status: fb.hasUpdates ? 'revisar' : 'al_dia',
            summary: fb.summary
          };
        });

        return res.status(200).json({ success: true, results });
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

function getA2LawFallback(lk, originalName) {
  if (lk.includes('constituci') || lk.includes('1978')) {
    return {
      lawName: originalName || 'Constitución Española de 1978',
      hasUpdates: true,
      summary: 'Reforma constitucional del art. 49 (publicada en BOE 17/02/2024): sustitución del término "disminuidos físicos, sensoriales y psíquicos" por "personas con discapacidad", reforzando la protección integral de sus derechos y la especial atención a mujeres y menores. Pregunta segura de examen en Bloque I.',
      recentReforms: [
        {
          normaModificadora: 'Reforma del art. 49 de la Constitución (BOE 17 de febrero de 2024)',
          articulosAfectados: 'Artículo 49 CE',
          impactoEnElTema: 'Literalidad completa del nuevo artículo 49 y comparación con el texto previo. Máxima prioridad en preguntas de test.'
        }
      ],
      claraAdvice: 'Memoriza los 4 apartados del nuevo artículo 49 de la CE. No olvides que es la tercera reforma de la Constitución Española tras las de 1992 (art. 13.2) y 2011 (art. 135).'
    };
  }
  if (lk.includes('39/2015') || lk.includes('lpac')) {
    return {
      lawName: originalName || 'Ley 39/2015 (LPAC)',
      hasUpdates: true,
      summary: 'Modificada por el Real Decreto-ley 6/2023: medidas de agilización y digitalización de la tramitación de expedientes, puntos de acceso general electrónico y notificaciones. Arts. clave: 21 (plazos y silencio), 30 (cómputo de plazos en días hábiles/naturales), 68 (subsanación 10 días), 121-126 (recursos de alzada, reposición y extraordinario de revisión).',
      recentReforms: [
        {
          normaModificadora: 'Real Decreto-ley 6/2023, de 19 de diciembre',
          articulosAfectados: 'Arts. sobre administración electrónica, registro electrónico y expedientes judiciales/administrativos',
          impactoEnElTema: 'Comprobación de la eficacia de los actos administrativos y cómputo de plazos en sede electrónica.'
        }
      ],
      claraAdvice: 'Asegura los plazos de interposición y resolución de recursos: alzada (1 mes interposición, 3 meses resolución; silencio desestimatorio salvo el supuesto de doble silencio del art. 24.1 párrafo 3º).'
    };
  }
  if (lk.includes('40/2015') || lk.includes('lrjsp')) {
    return {
      lawName: originalName || 'Ley 40/2015 (LRJSP)',
      hasUpdates: true,
      summary: 'Modificada por el Real Decreto-ley 6/2023 en materia de funcionamiento electrónico de los órganos colegiados (art. 17) y conferencias sectoriales. Arts. prioritarios para Gestión A2: 3 (principios), 8-14 (transferencia vs delegación, encomiendas, avocación y suplencia), 19-24 (abstención y recusación), 32-35 (responsabilidad patrimonial del Estado).',
      recentReforms: [
        {
          normaModificadora: 'Real Decreto-ley 6/2023, de 19 de diciembre',
          articulosAfectados: 'Arts. 17, 18 y régimen del sector público institucional',
          impactoEnElTema: 'Validez de sesiones a distancia en órganos colegiados y actas electrónicas firmadas con certificado.'
        }
      ],
      claraAdvice: 'Diferencia nítidamente la delegación (art. 9: no altera la titularidad, sólo el ejercicio; no cabe en relaciones con Cortes, aprobación de reglamentos, ni resolución de recursos cuando se delegó el acto) de la avocación (art. 10: órgano superior asume conocimiento por motivos técnicos/jurídicos).'
    };
  }
  if (lk.includes('trebep') || lk.includes('5/2015') || lk.includes('empleado')) {
    return {
      lawName: originalName || 'TREBEP (RDL 5/2015)',
      hasUpdates: true,
      summary: 'Reformas trascendentales por RDL 6/2023: regulación marco de la evaluación del desempeño profesional (criterio vinculante para la carrera horizontal y complementos retributivos) y teletrabajo (art. 47 bis). Arts. esenciales: 8-13 (clases de personal), 48-49 (permisos y conciliación), 85-100 (situaciones administrativas y régimen disciplinario).',
      recentReforms: [
        {
          normaModificadora: 'Real Decreto-ley 6/2023, de 19 de diciembre',
          articulosAfectados: 'Modelo de carrera profesional, evaluación del desempeño, teletrabajo y directivas de estabilización temporal',
          impactoEnElTema: 'Preguntas tipo test sobre la obligatoriedad de la evaluación del desempeño y sus efectos en la continuidad del puesto.'
        }
      ],
      claraAdvice: 'Memoriza los supuestos de excedencia (por cuidado de familiares hasta 3 años computando trienios; por interés particular exige 5 años previos en cualquier administración) y las faltas muy graves (art. 95).'
    };
  }
  if (lk.includes('9/2017') || lk.includes('lcsp') || lk.includes('contratos')) {
    return {
      lawName: originalName || 'Ley 9/2017 (LCSP)',
      hasUpdates: true,
      summary: 'Actualización periódica de los umbrales de contratos sujetos a regulación armonizada (SARA) fijados por la Comisión Europea. Modificaciones en criterios sociales y medioambientales de solvencia. Arts. críticos para examen: 118 (contratos menores: 40.000€ obras, 15.000€ suministros/servicios), 131-159 (procedimientos abierto, abierto simplificado y supersimplificado), 44-60 (Recurso Especial en Materia de Contratación: actos recurribles y órganos competentes: TACRC).',
      recentReforms: [
        {
          normaModificadora: 'Órdenes Ministeriales de actualización de umbrales comunitarios SARA vigentes',
          articulosAfectados: 'Arts. 20-23, umbrales de publicidad en DOUE y régimen de recursos',
          impactoEnElTema: 'Preguntas trampa sobre importes máximos en contratos menores y plazos del recurso especial (15 días hábiles).'
        }
      ],
      claraAdvice: 'El Recurso Especial en Contratación: acto recurrible (pliegos, adjudicación en obras > 3.000.000€, suministros/servicios > 100.000€), plazo 15 días hábiles, efecto suspensivo automático en el acto de adjudicación.'
    };
  }
  if (lk.includes('47/2003') || lk.includes('lgp') || lk.includes('presupuestaria')) {
    return {
      lawName: originalName || 'Ley 47/2003 (General Presupuestaria)',
      hasUpdates: false,
      summary: 'Estructura presupuestaria consolidada (clasificación orgánica, por programas y económica). Fases de ejecución del gasto del art. 73: Aprobación (A), Compromiso (D), Reconocimiento de la obligación (O) y Propuesta de pago (P). Modificaciones presupuestarias (créditos extraordinarios y suplementos por ley o Consejo de Ministros; transferencias e incorporaciones de remanentes) y control interno de la IGAE (fiscalización previa y control financiero permanente).',
      recentReforms: [
        {
          normaModificadora: 'Leyes anuales de Presupuestos Generales del Estado y modificaciones de control interno',
          articulosAfectados: 'Arts. 48-60 (modificaciones de crédito) y arts. 140-160 (control IGAE)',
          impactoEnElTema: 'Competencias para autorizar modificaciones de créditos: Ministro del ramo vs Ministro de Hacienda vs Consejo de Ministros.'
        }
      ],
      claraAdvice: 'Pregunta fija de examen: ¿quién autoriza un crédito extraordinario en créditos para operaciones no financieras? Cortes Generales mediante Ley. ¿Y para operaciones financieras o fondos de contingencia? Consejo de Ministros.'
    };
  }
  if (lk.includes('19/2013') || lk.includes('transparencia')) {
    return {
      lawName: originalName || 'Ley 19/2013 (Transparencia y Buen Gobierno)',
      hasUpdates: false,
      summary: 'Publicidad activa en el Portal de Transparencia (arts. 5-8), derecho de acceso a la información pública (arts. 12-22: plazo de resolución 1 mes ampliable por otro mes; silencio negativo), reclamación potestativa previa ante el Consejo de Transparencia y Buen Gobierno (CTBG) en plazo de 1 mes (plazo de resolución 3 meses; silencio desestimatorio).',
      recentReforms: [],
      claraAdvice: 'Recuerda que la reclamación ante el CTBG sustituye a los recursos administrativos ordinarios de la Ley 39/2015 conforme a su disposición adicional 4ª.'
    };
  }
  if (lk.includes('50/1997') || lk.includes('gobierno')) {
    return {
      lawName: originalName || 'Ley 50/1997 (del Gobierno)',
      hasUpdates: false,
      summary: 'Consolidada. Arts. 1-11 (composición del Gobierno: Presidente, Vicepresidentes, Ministros; cese del Gobierno y funciones del Gobierno en funciones), arts. 26-28 (procedimiento de tramitación de iniciativas normativas: consulta pública previa en la web, memoria de análisis de impacto normativo MAIN, dictamen del Consejo de Estado y Comisión General de Secretarios de Estado y Subsecretarios).',
      recentReforms: [],
      claraAdvice: 'El Gobierno en funciones limita su gestión al despacho ordinario de los asuntos públicos, salvo casos de urgencia o interés general justificados.'
    };
  }
  if (lk.includes('igualdad') || lk.includes('3/2007') || lk.includes('paridad')) {
    return {
      lawName: originalName || 'Ley Orgánica 3/2007 de Igualdad',
      hasUpdates: true,
      summary: 'Impacto directo de la Ley Orgánica 2/2024 de representación paritaria y presencia equilibrada de mujeres y hombres en órganos constitucionales, Consejo de Ministros, tribunales de selección de personal de la AGE (mínimo 40% de cada sexo) y comisiones de valoración.',
      recentReforms: [
        {
          normaModificadora: 'Ley Orgánica 2/2024, de 1 de agosto, de representación paritaria',
          articulosAfectados: 'Órganos colegiados, tribunales calificadores y puestos directivos de la AGE',
          impactoEnElTema: 'Exigencia vinculante de principio de presencia equilibrada (40%-60%) en comisiones examinadoras del INAP.'
        }
      ],
      claraAdvice: 'Comprueba el requisito del 40% en los tribunales de oposiciones: ninguna persona de un sexo puede representar más del 60% ni menos del 40%.'
    };
  }
  return {
    lawName: originalName || 'Normativa de examen A2',
    hasUpdates: false,
    summary: `Norma plenamente vigente y consolidada en el ordenamiento jurídico. Prioritaria para el temario de Gestión de la Administración Civil del Estado (A2 GACE).`,
    recentReforms: [],
    claraAdvice: 'Centra el estudio en los artículos de competencias, los plazos preceptivos y los recursos aplicables ante la jurisdicción contencioso-administrativa.'
  };
}

let cachedModel = null;

async function getWorkingModel(apiKey) {
  if (cachedModel) return cachedModel;
  // High-quota, ultra-fast free tier models prioritized
  const preferred = [
    'gemini-flash-lite-latest',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-pro-latest'
  ];
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (res.ok) {
      const data = await res.json();
      const available = (data.models || [])
        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => m.name.replace('models/', ''));

      for (const p of preferred) {
        if (available.includes(p)) {
          cachedModel = p;
          return p;
        }
      }
      if (available.length > 0) {
        cachedModel = available[0];
        return available[0];
      }
    }
  } catch (e) {
    console.warn('Could not query models list:', e);
  }
  return 'gemini-flash-lite-latest';
}

async function callGemini(apiKey, systemInstruction, userPrompt, isJson = false) {
  const chosenModel = await getWorkingModel(apiKey);
  const modelsToTry = [
    chosenModel,
    'gemini-flash-lite-latest',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-pro-latest'
  ];
  const uniqueModels = [...new Set(modelsToTry)];
  const allErrors = [];

  for (const model of uniqueModels) {
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
        allErrors.push(`[${model}] HTTP ${response.status}: ${errorText.slice(0, 120)}`);
        continue;
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        cachedModel = model;
        return text;
      }
    } catch (err) {
      allErrors.push(`[${model}] Exception: ${err.message}`);
    }
  }

  throw new Error('Fallaron los modelos disponibles: ' + allErrors.join(' | '));
}
