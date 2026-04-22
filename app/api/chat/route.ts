import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IndexedChunk {
  file: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
}

interface EmbeddingIndex {
  builtAt: string;
  model: string;
  totalChunks: number;
  chunks: IndexedChunk[];
}

// ─── Global index — loaded once per server instance ───────────────────────────

let embeddingIndex: EmbeddingIndex | null = null;

async function loadEmbeddingIndex(): Promise<void> {
  if (embeddingIndex) return;

  const indexPath = path.join(process.cwd(), 'knowledge', 'embeddings-index.json');
  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    embeddingIndex = JSON.parse(raw) as EmbeddingIndex;
    console.log(
      `Embedding index loaded: ${embeddingIndex.totalChunks} chunks from ${embeddingIndex.builtAt}`
    );
  } catch {
    console.warn(
      'embeddings-index.json not found. Run "npm run build-index" to generate it. Falling back to full knowledge injection.'
    );
  }
}

// ─── Math helpers (no external dependencies) ─────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Given a query embedding, returns the top-K most semantically similar chunks,
 * de-duplicated so the same source file doesn't flood the context.
 */
function retrieveTopChunks(
  queryEmbedding: number[],
  index: EmbeddingIndex,
  topK = 7
): IndexedChunk[] {
  const scored = index.chunks.map(chunk => ({
    chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Pick top K but allow at most 2 chunks from the same file
  // so we get breadth across sources
  const fileCounts: Record<string, number> = {};
  const MAX_PER_FILE = 2;
  const results: IndexedChunk[] = [];

  for (const { chunk } of scored) {
    if (results.length >= topK) break;
    const count = fileCounts[chunk.file] ?? 0;
    if (count < MAX_PER_FILE) {
      results.push(chunk);
      fileCounts[chunk.file] = count + 1;
    }
  }

  return results;
}

// ─── Fallback: load all raw knowledge files (if index not built yet) ──────────

async function loadAllKnowledge(): Promise<string> {
  let combined = '';
  const knowledgeDir = path.join(process.cwd(), 'knowledge');
  try {
    await fs.access(knowledgeDir);
    const files = await fs.readdir(knowledgeDir);
    for (const file of files) {
      if (file.endsWith('.txt') || file.endsWith('.md')) {
        const content = await fs.readFile(path.join(knowledgeDir, file), 'utf-8');
        combined += `\n\n--- SOURCE FILE: ${file} ---\n${content}`;
      }
    }
  } catch {
    // knowledge dir doesn't exist — no context
  }
  return combined;
}

// ─── Main route handler ───────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const history: { role: string; content: string }[] = body.history;
    const passcode: string = body.passcode;

    // Passcode gate
    if (process.env.APP_PASSCODE && passcode !== process.env.APP_PASSCODE) {
      return NextResponse.json({ error: 'Unauthorized: Invalid passcode' }, { status: 401 });
    }

    if (!history || !Array.isArray(history)) {
      return NextResponse.json({ error: 'Invalid history format' }, { status: 400 });
    }

    const rawKey = process.env.GEMINI_API_KEY;
    if (!rawKey) {
      return NextResponse.json({ error: 'API key missing' }, { status: 500 });
    }

    console.log('\n--- NEW REQUEST ---');
    console.log(`History length: ${history.length} messages`);

    const ai = new GoogleGenAI({ apiKey: rawKey });

    // Get the latest user message
    const latestUserMessage =
      history.slice().reverse().find(msg => msg.role === 'user')?.content ?? '';

    // ── Load the embedding index (cached after first request) ──────────────
    await loadEmbeddingIndex();

    // ── Build relevant context ─────────────────────────────────────────────
    let sourceKnowledge = '';

    if (embeddingIndex && latestUserMessage) {
      try {
        // Single embeddings API call — fast, cheap, almost never 503s
        console.log('Embedding query for semantic retrieval...');
        const embedResult = await ai.models.embedContent({
          model: 'gemini-embedding-001',
          contents: [latestUserMessage],
        });

        const queryEmbedding = embedResult.embeddings?.[0]?.values ?? [];

        if (queryEmbedding.length > 0) {
          const topChunks = retrieveTopChunks(queryEmbedding, embeddingIndex, 7);

          console.log(
            `Retrieved ${topChunks.length} chunks from: ${[...new Set(topChunks.map(c => c.file))].join(', ')}`
          );

          for (const chunk of topChunks) {
            sourceKnowledge += `\n\n--- FROM: ${chunk.file} ---\n${chunk.text}`;
          }
        }
      } catch (embedErr) {
        // Embedding call failed — fall back to injecting all knowledge
        console.error('Embedding call failed, falling back to full knowledge:', embedErr);
        sourceKnowledge = await loadAllKnowledge();
      }
    } else if (!embeddingIndex) {
      // Index not built yet — use the full knowledge files as a safety net
      console.warn('Index not built — injecting all knowledge (run npm run build-index)');
      sourceKnowledge = await loadAllKnowledge();
    }

    // ── Format conversation history for Gemini ────────────────────────────
    const formattedHistory = history.map(msg => ({
      role: msg.role === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    // ── Single generative call ────────────────────────────────────────────
    const MODEL_CASCADE = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    let lastError: unknown;

    for (const model of MODEL_CASCADE) {
      try {
        console.log(`Calling generative model: ${model}`);

        const response = await ai.models.generateContent({
          model,
          contents: formattedHistory,
          config: {
            systemInstruction: buildSystemInstruction(sourceKnowledge),
          },
        });

        console.log(`✓ Success with ${model}`);
        return NextResponse.json({ text: response?.text ?? '' });

      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        const msg = e.message ?? JSON.stringify(err);
        const isOverloaded =
          e.status === 503 || e.status === 429 ||
          msg.includes('503') || msg.includes('429') || msg.includes('UNAVAILABLE');

        if (isOverloaded) {
          console.warn(`Model ${model} overloaded, trying next...`);
          lastError = err;
          continue;
        }
        // Non-retryable — surface immediately
        throw err;
      }
    }

    // All models failed
    console.error('All models failed:', lastError);
    return NextResponse.json({ error: 'Service temporarily unavailable. Please try again.' }, { status: 503 });

  } catch (error) {
    console.error('Route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── System instruction ────────────────────────────────────────────────────────

function buildSystemInstruction(sourceKnowledge: string): string {
  return `You are Vital. You blend ancient wisdom, energetic healing, and new scientific paradigms (like German New Medicine, biophysics, and vibrational medicine) with practical biochemistry. 

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
${sourceKnowledge ? `\n\n=== VERIFIED SOURCE KNOWLEDGE ===\nThe following excerpts are the most semantically relevant passages from your knowledge library, retrieved specifically for this query. Use them as a core reference, but always synthesize with your broader foundational knowledge:\n${sourceKnowledge}` : ''}`;
}