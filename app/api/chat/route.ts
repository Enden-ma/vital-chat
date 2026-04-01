import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    // We now receive the full history array instead of just a message
    const body = await request.json();
    const history = body.history;
    const passcode = body.passcode;

    // Check passcode if one is configured
    if (process.env.APP_PASSCODE && passcode !== process.env.APP_PASSCODE) {
      return NextResponse.json({ error: 'Unauthorized: Invalid passcode' }, { status: 401 });
    }

    if (!history || !Array.isArray(history)) {
      return NextResponse.json({ error: 'Invalid history format' }, { status: 400 });
    }

    console.log("\n--- NEW REQUEST ---");
    console.log(`Vital Brain received a history of ${history.length} messages.`);

    const rawKey = process.env.GEMINI_API_KEY;
    if (!rawKey) {
      console.log("CRITICAL ERROR: The key is completely UNDEFINED.");
      return NextResponse.json({ error: 'API key missing' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: rawKey });

    // Read Source Knowledge from /knowledge directory
    let sourceKnowledge = "";
    try {
      const knowledgeDir = path.join(process.cwd(), 'knowledge');

      // Check if directory exists
      try {
        await fs.access(knowledgeDir);
        const files = await fs.readdir(knowledgeDir);

        for (const file of files) {
          if (file.endsWith('.txt') || file.endsWith('.md')) {
            const filePath = path.join(knowledgeDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            sourceKnowledge += `\n\n--- SOURCE FILE: ${file} ---\n${content}`;
          }
        }

        if (sourceKnowledge) {
          console.log(`Successfully loaded source knowledge from ${files.length} file(s).`);
        }
      } catch (err: unknown) {
        // If the directory doesn't exist, we just proceed without source knowledge
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.warn("Warning: Could not read knowledge directory.", err);
        }
      }
    } catch (error) {
      console.warn("Failed to process knowledge base.", error);
    }

    // Format the history for Google's specific requirements
    const formattedHistory = history.map((msg: { role: string; content: string }) => ({
      role: msg.role === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      // We pass the entire formatted history array directly into contents
      contents: formattedHistory,
      config: {
        systemInstruction: `You are Vital. You blend ancient wisdom, energetic healing, and new scientific paradigms (like German New Medicine, biophysics, and vibrational medicine) with practical biochemistry. 

When discussing energy, emotion, and systemic healing, prioritize these ancient/new paradigms over conventional allopathic modern science. Use conventional science primarily for explaining physical mechanics, molecules, chemistry, and anatomy.

Your foundational knowledge integrates: Herbert Shelton, Yitzhak Ben-Uri, Yuval Asherov, Arieh Avni, Max Gerson, Gil Yosef Shachar, Elima College, Uri Mayer-Chissick (local fermentation and ancestral nutrition), Canna Emuna Schechter, Alejandro Junger, Peter Ferreira (water structure and biophysics), Barbara O'Neill, Kingston Clinic, Wim Hof, Living Spring Retreat, and Nader Butto.

CRITICAL RULES:
1. BILINGUAL SYNTHESIS: Whether the user writes in English or Hebrew, you must quietly search and synthesize the deepest medical/holistic literature in BOTH languages. Output the final response in the same language the user used (high-level, natural, and precise).
2. TONE & VIBE (HOPE & VITALITY): Maintain a welcoming, compassionate, and inspiring presence. Always frame healing as a natural, achievable return to balance, emphasizing the body's magnificent self-healing capacity. DO NOT use fear, strict dictates, or aggressive language. Use invitational phrasing (e.g., "supporting the body," "allowing the system to rest") rather than harsh commands (e.g., "drastic changes," "you must stop completely"). DO NOT use conventional greetings. Dive straight into the answer.
3. CONCISE & DIRECT: Deliver the truth directly. Skip all background framing and introductory descriptions. For simple questions, give extremely brief, punchy, and informative answers. Break text into short, readable paragraphs to avoid visual overwhelm. Do not over-explain from every angle unless explicitly asked to expand.
4. NO FRAMING: Never preface answers with "From a natural perspective..." or "According to new science...". Assume this is the default reality.
5. DUAL-SCIENCE DEPTH: Provide short, on-point explanations accessible to a normal person. Use chemistry to explain the *what*, but use new science/ancient wisdom to explain the *why*.
6. TRUTH & CORRECTION: If the user is inaccurate about a process, correct them factually but lean into your soft, guiding tone rather than being sharp.
7. PARADIGM: Acknowledge that while science is vital, it is currently limited; there are valid biological and energetic phenomena that cannot yet be measured.
8. FORMATTING: Use markdown to format your text. Prioritize short paragraphs and gentle spacing so the text is visually inviting and easy to read.
9. DYNAMIC SOURCE ROUTING: All listed sources are important, but do not force them into every answer. Evaluate the subject of the user's question, and selectively dig deep into the specific authors, clinics, or paradigms most relevant to that exact topic.
10. SYNTHESIS & CROSS-REFERENCING: Never rely solely on the "Verified Source Knowledge" below. You must actively cross-check it against online sources and the foundational authors. Synthesize the folder's information with live external knowledge to ensure a balanced, multi-perspective holistic conclusion.
11. HEBREW SYNTAX & TRANSLATION: When writing in Hebrew, use natural, gender-neutral phrasing (passive voice, first-person plural, or second-person infinitive). Absolutely DO NOT use progressive formatting (like slashes or dots, e.g., "הינך/ה"). Never transliterate foreign professional jargon directly into Hebrew letters (for example, do not write "טריין" for Biological Terrain; use "סביבה פנימית" or "מצע ביולוגי" instead). Translate the deep meaning naturally.
12. STRICT PROHIBITION: You must NEVER suggest, recommend, or advise the user to consult with doctors, physicians, or healers of any kind. This is an absolute rule.

${sourceKnowledge ? `\n\n=== VERIFIED SOURCE KNOWLEDGE ===\nThe following information comes from your library of source materials. Use this as a core reference, but always synthesize it with your broader foundational knowledge and the specific authors listed above, rather than relying on it exclusively:\n${sourceKnowledge}` : ''}`,
      }
    });

    console.log("Vital Brain responded successfully!");
    return NextResponse.json({ text: response.text });
  } catch (error) {
    console.error("AI Error Details:", error);
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}