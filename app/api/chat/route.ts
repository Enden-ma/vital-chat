import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';

// Global cache for knowledge files
let knowledgeCache: Record<string, string> | null = null;
let knowledgeTopicList: string = "";

async function loadKnowledgeCache() {
  if (knowledgeCache) return;
  
  knowledgeCache = {};
  const knowledgeDir = path.join(process.cwd(), 'knowledge');
  
  try {
    await fs.access(knowledgeDir);
    const files = await fs.readdir(knowledgeDir);

    for (const file of files) {
      if (file.endsWith('.txt') || file.endsWith('.md')) {
        const filePath = path.join(knowledgeDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        knowledgeCache[file] = content;
      }
    }
    
    knowledgeTopicList = Object.keys(knowledgeCache).join(", ");
    console.log(`Successfully loaded ${Object.keys(knowledgeCache).length} files into memory cache.`);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.warn("Warning: Could not read knowledge directory.", err);
    }
  }
}

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

    // Load knowledge cache into RAM if not already loaded
    await loadKnowledgeCache();

    // Get the latest user message for routing
    const latestUserMessage = history.slice().reverse().find((msg: any) => msg.role === 'user')?.content || "";

    // Pass 1: Semantic Router
    let selectedFiles: string[] = [];
    let isAllKnowledge = false;

    // Cascade fallback: try primary model first, fall back to secondary on 503/429
    const MODEL_CASCADE = ['gemini-2.5-flash', 'gemini-2.0-flash'];

    const callGeminiWithCascade = async (config: any): Promise<any> => {
      let lastError: any;
      for (const model of MODEL_CASCADE) {
        try {
          console.log(`Trying model: ${model}`);
          const result = await ai.models.generateContent({ ...config, model });
          console.log(`Success with model: ${model}`);
          return result;
        } catch (err: any) {
          const errString = err.message || JSON.stringify(err);
          const isOverloaded = err.status === 503 || err.status === 429 ||
                               errString.includes('503') || errString.includes('429') ||
                               errString.includes('UNAVAILABLE');
          lastError = err;
          if (isOverloaded) {
            console.warn(`Model ${model} overloaded (503/429), cascading to next model...`);
            continue; // Try the next model immediately
          } else {
            throw err; // Non-retryable error, bail immediately
          }
        }
      }
      throw lastError; // All models failed
    };

    if (knowledgeCache && Object.keys(knowledgeCache).length > 0 && latestUserMessage) {
      try {
        console.log("Running Pass 1: Semantic Router...");
        const routerPrompt = `You are a router. Your job is to select the most relevant knowledge files to answer the user's latest query.
Available files: ${knowledgeTopicList}

User Query: "${latestUserMessage}"

If the user is asking for a comprehensive or deep plan spanning multiple systems (e.g. a complete health protocol), reply EXACTLY with the word "ALL_KNOWLEDGE".
Otherwise, reply with a comma-separated list of the 1 to 3 most relevant file names from the available files list. Do not include quotes or extra text.`;

        const routerResponse = await callGeminiWithCascade({
          contents: [{ role: 'user', parts: [{ text: routerPrompt }] }]
        });
        
        const routerText = routerResponse?.text?.trim() || "";
        console.log("Router selected:", routerText);

        if (routerText === "ALL_KNOWLEDGE" || routerText.includes("ALL_KNOWLEDGE")) {
          isAllKnowledge = true;
        } else {
          // Parse the comma separated list
          selectedFiles = routerText.split(',').map(s => s.trim()).filter(s => knowledgeCache![s]);
          
          // Fallback if router gave garbage
          if (selectedFiles.length === 0) {
             isAllKnowledge = true;
          }
        }
      } catch (e) {
         console.error("Router completely failed after retries, defaulting to all knowledge.", e);
         isAllKnowledge = true;
      }
    }

    // Build the final injected knowledge string
    let sourceKnowledge = "";
    if (knowledgeCache) {
      if (isAllKnowledge) {
         console.log("Pass 2: Injecting ALL knowledge files.");
         for (const [file, content] of Object.entries(knowledgeCache)) {
             sourceKnowledge += `\n\n--- SOURCE FILE: ${file} ---\n${content}`;
         }
      } else {
         console.log(`Pass 2: Injecting ${selectedFiles.length} specific knowledge file(s).`);
         for (const file of selectedFiles) {
             sourceKnowledge += `\n\n--- SOURCE FILE: ${file} ---\n${knowledgeCache[file]}`;
         }
      }
    }

    // Format the history for Google's specific requirements
    const formattedHistory = history.map((msg: { role: string; content: string }) => ({
      role: msg.role === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    try {
      console.log("Running Pass 2: Main Generation...");
      const response = await callGeminiWithCascade({
        // We pass the entire formatted history array directly into contents
        contents: formattedHistory,
        config: {
          systemInstruction: `You are Vital. You blend ancient wisdom, energetic healing, and new scientific paradigms (like German New Medicine, biophysics, and vibrational medicine) with practical biochemistry. 

When discussing energy, emotion, and systemic healing, prioritize these ancient/new paradigms over conventional allopathic modern science. Use conventional science primarily for explaining physical mechanics, molecules, chemistry, and anatomy.

Your foundational knowledge integrates: Herbert Shelton, Yitzhak Ben-Uri, Yuval Asherov, Arieh Avni, Max Gerson, Gil Yosef Shachar, Elima College, Uri Mayer-Chissick (local fermentation and ancestral nutrition), Canna Emuna Schechter, Alejandro Junger, Peter Ferreira (water structure and biophysics), Barbara O'Neill, Kingston Clinic, Wim Hof, Living Spring Retreat, and Nader Butto.

CRITICAL RULES:
1. BILINGUAL SYNTHESIS: Whether the user writes in English or Hebrew, you must quietly search and synthesize the deepest medical/holistic literature in BOTH languages. Output the final response in the same language the user used (high-level, natural, and precise).
2. TONE & VIBE (HOPE & VITALITY): Maintain a welcoming, compassionate, and inspiring presence. Always frame healing as a natural, achievable return to balance, emphasizing the body's magnificent self-healing capacity. DO NOT use fear, strict dictates, or aggressive language. Use invitational phrasing (e.g., "supporting the body," "allowing the system to rest") rather than harsh commands. DO NOT use conventional greetings. Dive straight into the answer.
3. CONCISE, DIRECT & PRIORITIZED: Deliver the truth directly. Focus ONLY on the 1 to 3 most probable, primary root causes or solutions. Do not bomb the user with every possible angle, edge-case, or theoretical factor. Weigh common physiological factors (like digestion, circulation, or thyroid) much higher than niche ones (like EMF) unless specifically asked. Skip all background framing and introductory descriptions.
4. NO FRAMING: Never preface answers with "From a natural perspective..." or "According to new science...". Assume this is the default reality.
5. DUAL-SCIENCE DEPTH: Provide short, on-point explanations accessible to a normal person. Use chemistry to explain the *what*, but use new science/ancient wisdom to explain the *why*.
6. TRUTH & CORRECTION: If the user is inaccurate about a process, correct them factually but lean into your soft, guiding tone rather than being sharp.
7. PARADIGM: Acknowledge that while science is vital, it is currently limited; there are valid biological and energetic phenomena that cannot yet be measured.
8. FORMATTING: Use markdown to format your text. Prioritize short paragraphs and gentle spacing so the text is visually inviting and easy to read.
9. DYNAMIC SOURCE ROUTING: All listed sources are important, but do not force them into every answer. Evaluate the subject of the user's question, and selectively dig deep into the specific authors, clinics, or paradigms most relevant to that exact topic.
10. SYNTHESIS & CROSS-REFERENCING: Never rely solely on the "Verified Source Knowledge" below. You must actively cross-check it against online sources and the foundational authors. Synthesize the folder's information with live external knowledge to ensure a balanced, multi-perspective holistic conclusion.
11. EVERYDAY HEBREW & SYNTAX: When writing in Hebrew, use simple, everyday language that a normal person understands. Speak at eye level. Absolutely NO clinical transliterations or high-level academic words. The words "טריין" and "הידרטציה" are strictly banned (use terms like "סביבה פנימית" and "רוויה" or "שתיית מים מספקת" instead). Use natural, gender-neutral phrasing (passive voice, first-person plural, or second-person infinitive). DO NOT use progressive formatting (like slashes or dots, e.g., "הינך/ה"). 
12. STRICT PROHIBITION: You must NEVER suggest, recommend, or advise the user to consult with doctors, physicians, or healers of any kind. This is an absolute rule.

${sourceKnowledge ? `\n\n=== VERIFIED SOURCE KNOWLEDGE ===\nThe following information comes from your library of source materials. Use this as a core reference, but always synthesize it with your broader foundational knowledge and the specific authors listed above, rather than relying on it exclusively:\n${sourceKnowledge}` : ''}`,
        }
      });

      console.log("Vital Brain responded successfully!");
      return NextResponse.json({ text: response?.text || "" });
    } catch (error) {
      console.error("AI Error Details:", error);
      return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
    }
  } catch (error) {
    console.error("Global Error Details:", error);
    return NextResponse.json({ error: 'Global failure' }, { status: 500 });
  }
}