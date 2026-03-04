import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(request: Request) {
  try {
    // We now receive the full history array instead of just a message
    const { history } = await request.json();
    console.log("\n--- NEW REQUEST ---");
    console.log(`Vital Brain received a history of ${history.length} messages.`);

    const rawKey = process.env.GEMINI_API_KEY;
    if (!rawKey) {
      console.log("CRITICAL ERROR: The key is completely UNDEFINED.");
      return NextResponse.json({ error: 'API key missing' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: rawKey });

    // Format the history for Google's specific requirements
    const formattedHistory = history.map((msg: any) => ({
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
7. FORMATTING: Do NOT use markdown. Do not use asterisks (**) for bolding. Output clean text formatted with standard spacing.`,
      }
    });

    console.log("Vital Brain responded successfully!");
    return NextResponse.json({ text: response.text });
  } catch (error) {
    console.error("AI Error Details:", error);
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}