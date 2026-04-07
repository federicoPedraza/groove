#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_WORD_TARGET = 180;
const CHUNK_WORD_OVERLAP = 40;
const HELP_EMBEDDINGS_ENDPOINT = "https://api.openai.com/v1/embeddings";
const REQUIRED_FEATURES = [
  "worktree-lifecycle",
  "worktree-detail",
  "diagnostics-recovery",
  "settings-workspace-commands",
  "integrations-jira-opencode",
  "navigation-shortcuts",
];

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const helpRoot = path.join(repoRoot, "help");

function log(message) {
  process.stdout.write(`[help-embeddings] ${message}\n`);
}

function warn(message) {
  process.stderr.write(`[help-embeddings] warning: ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[help-embeddings] error: ${message}\n`);
  process.exit(1);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeMarkdown(markdown) {
  return markdown.replace(/\r\n/g, "\n").trim();
}

function tokenize(text) {
  const tokenSet = new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  );
  return [...tokenSet];
}

function splitByHeadings(markdown) {
  const sections = [];
  const lines = markdown.split("\n");
  let currentHeading = "Overview";
  let currentLines = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      if (currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          text: currentLines.join("\n").trim(),
        });
      }
      currentHeading = headingMatch[2].trim();
      currentLines = [];
      continue;
    }
    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      text: currentLines.join("\n").trim(),
    });
  }

  return sections.filter((section) => section.text.length > 0);
}

function chunkSectionText(text) {
  const words = text.split(/\s+/).filter((word) => word.trim().length > 0);
  if (words.length <= CHUNK_WORD_TARGET) {
    return [text.trim()];
  }

  const chunks = [];
  const step = Math.max(1, CHUNK_WORD_TARGET - CHUNK_WORD_OVERLAP);
  for (let start = 0; start < words.length; start += step) {
    const chunkWords = words.slice(start, start + CHUNK_WORD_TARGET);
    if (chunkWords.length === 0) {
      continue;
    }
    chunks.push(chunkWords.join(" ").trim());
    if (start + CHUNK_WORD_TARGET >= words.length) {
      break;
    }
  }

  return chunks;
}

function chunkMarkdown(markdown, featureName, sourcePath) {
  const sections = splitByHeadings(markdown);
  const chunks = [];
  let index = 0;

  for (const section of sections) {
    const sectionChunks = chunkSectionText(section.text);
    for (const chunkText of sectionChunks) {
      const id = `${featureName}-${String(index + 1).padStart(3, "0")}`;
      chunks.push({
        id,
        index,
        heading: section.heading,
        text: chunkText,
        tokens: tokenize(chunkText),
        embedding: [],
        source: sourcePath,
      });
      index += 1;
    }
  }

  return chunks;
}

function readWorkspaceApiKey() {
  const workspaceMetaPath = path.join(repoRoot, ".groove", "workspace.json");
  if (!existsSync(workspaceMetaPath)) {
    return null;
  }

  try {
    const raw = readFileSync(workspaceMetaPath, "utf8");
    const parsed = JSON.parse(raw);
    const value = parsed?.consellourSettings?.openaiApiKey;
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  } catch {
    return null;
  }
}

function resolveApiKey() {
  const envApiKey = process.env.OPENAI_API_KEY?.trim();
  if (envApiKey) {
    return envApiKey;
  }

  const workspaceApiKey = readWorkspaceApiKey();
  if (workspaceApiKey) {
    return workspaceApiKey;
  }

  return null;
}

function listFeatureMarkdownFiles() {
  if (!existsSync(helpRoot)) {
    return [];
  }

  const featureDirs = readdirSync(helpRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return featureDirs
    .map((featureName) => {
      const fileName = `${featureName}.md`;
      const markdownPath = path.join(helpRoot, featureName, fileName);
      return existsSync(markdownPath) ? { featureName, markdownPath } : null;
    })
    .filter((entry) => entry !== null);
}

async function createEmbeddings(apiKey, inputs) {
  const response = await fetch(HELP_EMBEDDINGS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI embeddings request failed (${String(response.status)}): ${errorBody}`);
  }

  const payload = await response.json();
  const vectors = Array.isArray(payload?.data) ? payload.data.map((item) => item.embedding) : [];
  if (vectors.length !== inputs.length) {
    throw new Error(`OpenAI embeddings count mismatch (expected ${String(inputs.length)}, received ${String(vectors.length)}).`);
  }

  return vectors;
}

function embeddingFilePath(featureName) {
  return path.join(helpRoot, featureName, `${featureName}.embedding.json`);
}

function hasUsableEmbedding(featureName) {
  const filePath = embeddingFilePath(featureName);
  if (!existsSync(filePath)) {
    return false;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return Array.isArray(parsed?.chunks) && parsed.chunks.length > 0;
  } catch {
    return false;
  }
}

function writeJsonIfChanged(filePath, data) {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  if (existsSync(filePath)) {
    const current = readFileSync(filePath, "utf8");
    if (current === body) {
      return false;
    }
  }

  writeFileSync(filePath, body, "utf8");
  return true;
}

function verifyRequiredDocs() {
  for (const featureName of REQUIRED_FEATURES) {
    const markdownPath = path.join(helpRoot, featureName, `${featureName}.md`);
    if (!existsSync(markdownPath)) {
      fail(`Missing required help document: ${path.relative(repoRoot, markdownPath)}`);
    }
  }
}

function fallbackToExistingEmbeddings(reason) {
  warn(reason);

  const missingFeatures = REQUIRED_FEATURES.filter((featureName) => !hasUsableEmbedding(featureName));
  if (missingFeatures.length > 0) {
    fail(
      `Embedding generation is unavailable and existing embedding files are missing for: ${missingFeatures.join(
        ", ",
      )}. Add OPENAI_API_KEY or commit help/<feature>/<feature>.embedding.json files first.`,
    );
  }

  warn("Using committed embedding files in fallback mode.");
}

async function main() {
  verifyRequiredDocs();
  const files = listFeatureMarkdownFiles();
  if (files.length === 0) {
    fail("No markdown docs found under help/*/*.md");
  }

  const apiKey = resolveApiKey();
  if (!apiKey) {
    fallbackToExistingEmbeddings("No OpenAI API key found (OPENAI_API_KEY or .groove/workspace.json). Skipping generation.");
    return;
  }

  let changedFiles = 0;

  try {
    for (const file of files) {
      const markdown = normalizeMarkdown(readFileSync(file.markdownPath, "utf8"));
      const relativeSource = path.relative(repoRoot, file.markdownPath).replaceAll(path.sep, "/");
      const chunks = chunkMarkdown(markdown, file.featureName, relativeSource);
      if (chunks.length === 0) {
        throw new Error(`No chunks generated for ${relativeSource}`);
      }

      const vectors = await createEmbeddings(
        apiKey,
        chunks.map((chunk) => chunk.text),
      );

      const data = {
        version: 1,
        feature: file.featureName,
        source: relativeSource,
        model: EMBEDDING_MODEL,
        chunkWordTarget: CHUNK_WORD_TARGET,
        chunkWordOverlap: CHUNK_WORD_OVERLAP,
        contentSha256: sha256(markdown),
        chunks: chunks.map((chunk, index) => ({
          ...chunk,
          embedding: vectors[index],
        })),
      };

      if (writeJsonIfChanged(embeddingFilePath(file.featureName), data)) {
        changedFiles += 1;
      }
    }
  } catch (error) {
    fallbackToExistingEmbeddings(
      error instanceof Error
        ? `Could not generate fresh embeddings (${error.message}).`
        : "Could not generate fresh embeddings due to an unknown error.",
    );
    return;
  }

  log(`Generated embeddings for ${String(files.length)} docs (${String(changedFiles)} files updated).`);
}

void main();
