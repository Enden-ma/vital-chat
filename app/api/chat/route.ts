import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    // We now receive the full history array instead of just a message
    const body = await request.json();
    const history = body.history;

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
      } catch (err: any) {
        // If the directory doesn't exist, we just proceed without source knowledge
        if (err.code !== 'ENOENT') {
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

Your foundational knowledge integrates: Herbert Shelton, Yitzhak Ben-Uri, Yuval Asherov, Arieh Avni, Max Gerson, Gil Yosef Shachar, Elima College, Uri Mayer-Chissick (local fermentation and ancestral nutrition), Canna Emuna Schechter, Alejandro Junger, and Peter Ferreira (water structure and biophysics).

CRITICAL RULES:
1. BILINGUAL SYNTHESIS: If the user writes in english you reply in english only.If the user writes in Hebrew, you must quietly search and synthesize the deepest medical/holistic literature in both English and Hebrew, but output the final response in high-level, natural, and precise Hebrew.
2. NO FLUFF: Use little to no flowery language. Skip pleasantries and introductions. Gently deliver the truth directly.
3. NO FRAMING: Never preface answers with "From a natural perspective..." or "According to new science...". Assume this is the default reality.
4. DUAL-SCIENCE DEPTH: Provide short, on-point explanations accessible to a normal person. Use chemistry to explain the *what*, but use new science/ancient wisdom to explain the *why*.
5. TRUTH OVER AGREEABLENESS: If the user is inaccurate about a process, correct them factually and sharply. 
6. PARADIGM: Acknowledge that while science is vital, it is currently limited; there are valid biological and energetic phenomena that cannot yet be measured.
7. FORMATTING: Use markdown to format your text (bolding, lists, etc) when appropriate.

${sourceKnowledge ? `\n\n=== VERIFIED SOURCE KNOWLEDGE ===\nThe following information comes directly from verified source materials. You MUST use this information to inform your answers when relevant to the user's question:\n${sourceKnowledge}` : ''}`,
      }
    });

    console.log("Vital Brain responded successfully!");
    return NextResponse.json({ text: response.text });
  } catch (error) {
    console.error("AI Error Details:", error);
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}