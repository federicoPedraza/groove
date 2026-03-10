type HelpEmbeddingChunk = {
  id: string;
  index: number;
  heading: string;
  text: string;
  tokens?: string[];
  embedding?: number[];
};

type HelpEmbeddingFile = {
  version: number;
  feature: string;
  source: string;
  model: string;
  chunks: HelpEmbeddingChunk[];
};

export type HelpChunkMatch = {
  feature: string;
  source: string;
  heading: string;
  text: string;
  score: number;
};

const HELP_EMBEDDING_MODULES = import.meta.glob<HelpEmbeddingFile>("@/help/*/*.embedding.json", {
  eager: true,
  import: "default",
});

const HELP_CHUNKS = Object.values(HELP_EMBEDDING_MODULES)
  .flatMap((file) => {
    if (!file || typeof file !== "object" || !Array.isArray(file.chunks)) {
      return [];
    }

    return file.chunks.map((chunk) => ({
      feature: file.feature,
      source: file.source,
      heading: chunk.heading,
      text: chunk.text,
      tokens: Array.isArray(chunk.tokens) ? chunk.tokens : tokenize(chunk.text),
      embedding: Array.isArray(chunk.embedding) ? chunk.embedding : [],
    }));
  })
  .filter((chunk) => chunk.text.trim().length > 0);

const OPENAI_EMBEDDINGS_ENDPOINT = "https://api.openai.com/v1/embeddings";
const HELP_EMBEDDING_MODEL = "text-embedding-3-small";

function tokenize(text: string): string[] {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]+/g, " ");
  const tokenSet = new Set(
    normalized
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  );
  return Array.from(tokenSet);
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i += 1) {
    const leftValue = left[i] ?? 0;
    const rightValue = right[i] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function lexicalSimilarity(queryTokens: string[], chunkTokens: string[]): number {
  if (queryTokens.length === 0 || chunkTokens.length === 0) {
    return 0;
  }

  let intersections = 0;
  const chunkSet = new Set(chunkTokens);
  for (const token of queryTokens) {
    if (chunkSet.has(token)) {
      intersections += 1;
    }
  }

  return intersections / Math.max(queryTokens.length, chunkTokens.length);
}

export function hasHelpKnowledgeBase(): boolean {
  return HELP_CHUNKS.length > 0;
}

export async function createHelpQueryEmbedding(apiKey: string, input: string): Promise<number[] | null> {
  const trimmedInput = input.trim();
  if (trimmedInput.length === 0) {
    return null;
  }

  try {
    const response = await fetch(OPENAI_EMBEDDINGS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: HELP_EMBEDDING_MODEL,
        input: trimmedInput,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    const embedding = payload.data?.[0]?.embedding;
    return Array.isArray(embedding) ? embedding : null;
  } catch {
    return null;
  }
}

export function retrieveHelpChunks({
  query,
  queryEmbedding,
  limit = 5,
}: {
  query: string;
  queryEmbedding: number[] | null;
  limit?: number;
}): HelpChunkMatch[] {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0 || HELP_CHUNKS.length === 0) {
    return [];
  }

  const queryTokens = tokenize(trimmedQuery);

  return HELP_CHUNKS.map((chunk) => {
    const lexicalScore = lexicalSimilarity(queryTokens, chunk.tokens);
    const semanticScore = queryEmbedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : 0;
    const hasSemanticSignal = semanticScore > 0;
    const score = hasSemanticSignal ? semanticScore * 0.85 + lexicalScore * 0.15 : lexicalScore;

    return {
      feature: chunk.feature,
      source: chunk.source,
      heading: chunk.heading,
      text: chunk.text,
      score,
    };
  })
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit));
}

export function buildHelpGroundingContext(matches: HelpChunkMatch[]): string {
  if (matches.length === 0) {
    return "No feature docs were retrieved for this question.";
  }

  return matches
    .map((match, index) => {
      return `[Doc ${String(index + 1)} | feature=${match.feature} | heading=${match.heading}]\n${match.text}`;
    })
    .join("\n\n");
}
