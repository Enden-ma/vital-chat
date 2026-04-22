/**
 * build-index.mjs
 * Run once with: npm run build-index
 * 
 * Reads all .txt/.md files from the /knowledge directory,
 * splits them into overlapping chunks, embeds each chunk using
 * Google's text-embedding-004 model, and writes the result to
 * knowledge/embeddings-index.json — ready to be committed to git.
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const KNOWLEDGE_DIR = path.join(ROOT, 'knowledge');
const OUTPUT_FILE = path.join(KNOWLEDGE_DIR, 'embeddings-index.json');

const CHUNK_SIZE = 1200;   // ~300 tokens per chunk
const CHUNK_OVERLAP = 200; // overlap to avoid cutting context at boundaries
const EMBEDDING_MODEL = 'gemini-embedding-001';

// Delay helper to respect rate limits
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function chunkText(text, fileName) {
  const chunks = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const chunk = text.slice(start, end).trim();

    // Skip tiny trailing fragments
    if (chunk.length > 80) {
      chunks.push({ file: fileName, chunkIndex, text: chunk });
      chunkIndex++;
    }

    if (end === text.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY is not set. Export it before running this script.');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  // 1. Read all knowledge files and chunk them
  console.log('📂 Reading knowledge directory...');
  const files = await fs.readdir(KNOWLEDGE_DIR);
  const knowledgeFiles = files.filter(f => f.endsWith('.txt') || f.endsWith('.md'));

  if (knowledgeFiles.length === 0) {
    console.error('❌ No .txt or .md files found in /knowledge');
    process.exit(1);
  }

  const allChunks = [];
  for (const file of knowledgeFiles) {
    const content = await fs.readFile(path.join(KNOWLEDGE_DIR, file), 'utf-8');
    const chunks = chunkText(content, file);
    allChunks.push(...chunks);
    console.log(`  ✓ ${file}: ${chunks.length} chunks`);
  }

  console.log(`\n🧠 Total chunks to embed: ${allChunks.length}`);
  console.log(`   Embedding model: ${EMBEDDING_MODEL}\n`);

  // 2. Embed each chunk (with rate-limit-friendly pacing)
  const index = [];
  let done = 0;

  for (const chunk of allChunks) {
    try {
      const result = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: [chunk.text],
      });

      const values = result.embeddings?.[0]?.values ?? [];
      if (values.length === 0) {
        console.warn(`  ⚠️  Empty embedding for chunk ${chunk.chunkIndex} of "${chunk.file}"`);
      }

      index.push({
        file: chunk.file,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        embedding: values,
      });

      done++;
      if (done % 10 === 0) {
        process.stdout.write(`  Embedded ${done}/${allChunks.length} chunks...\r`);
      }

      // Pace requests: ~5 per second to avoid rate limits
      await sleep(200);

    } catch (err) {
      console.error(`\n❌ Failed to embed chunk ${chunk.chunkIndex} of "${chunk.file}":`, err.message);
      // On rate limit, wait longer and retry once
      if (err.status === 429) {
        console.log('   Rate limited — waiting 10s before retry...');
        await sleep(10000);
        try {
          const retry = await ai.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: [chunk.text],
          });
          index.push({
            file: chunk.file,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            embedding: retry.embeddings?.[0]?.values ?? [],
          });
          done++;
        } catch (retryErr) {
          console.error('   Retry also failed, skipping this chunk:', retryErr.message);
        }
      }
    }
  }

  // 3. Write the index
  const output = {
    builtAt: new Date().toISOString(),
    model: EMBEDDING_MODEL,
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
    totalChunks: index.length,
    chunks: index,
  };

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output), 'utf-8');

  const fileSizeKB = Math.round(JSON.stringify(output).length / 1024);
  console.log(`\n✅ Done! Index written to knowledge/embeddings-index.json`);
  console.log(`   ${index.length} chunks indexed • ${fileSizeKB} KB`);
  console.log(`\n👉 Next steps:`);
  console.log(`   1. git add knowledge/embeddings-index.json`);
  console.log(`   2. git commit -m "feat: add semantic embedding index"`);
  console.log(`   3. git push\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
