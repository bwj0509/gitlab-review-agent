const { REVIEW_CHUNK_MAX_CHARS, REVIEW_MAX_DIFF_CHARS } = require("../config/env");

function buildReviewDiff(changes) {
  if (changes.length === 0) {
    return {
      chunkCount: 0,
      fullDiffChars: 0,
      isTruncated: false,
      mode: "single",
      promptDiffText: "변경된 파일이 없습니다."
    };
  }

  const entries = changes.flatMap((change) => splitChangeIntoPieces(change, REVIEW_CHUNK_MAX_CHARS));
  const fullDiff = entries.map((entry) => entry.text).join("\n\n");

  if (fullDiff.length <= REVIEW_MAX_DIFF_CHARS) {
    return {
      chunkCount: 1,
      fullDiffChars: fullDiff.length,
      isTruncated: false,
      mode: "single",
      promptDiffText: fullDiff
    };
  }

  const chunks = buildChunks(entries, REVIEW_CHUNK_MAX_CHARS);
  return {
    chunkCount: chunks.length,
    fullDiffChars: fullDiff.length,
    isTruncated: false,
    mode: "chunked",
    chunks
  };
}

function buildChunks(entries, maxChars) {
  const chunks = [];
  let currentChunk = createEmptyChunk();

  for (const entry of entries) {
    const separatorLength = currentChunk.text ? 2 : 0;
    const nextLength = currentChunk.text.length + separatorLength + entry.text.length;

    if (currentChunk.text && nextLength > maxChars) {
      chunks.push(finalizeChunk(currentChunk, chunks.length + 1));
      currentChunk = createEmptyChunk();
    }

    currentChunk.text = currentChunk.text ? `${currentChunk.text}\n\n${entry.text}` : entry.text;
    currentChunk.filePaths.add(entry.filePath);
  }

  if (currentChunk.text) {
    chunks.push(finalizeChunk(currentChunk, chunks.length + 1));
  }

  return chunks;
}

function splitChangeIntoPieces(change, maxChars) {
  const prefix = [
    `FILE: ${change.old_path} -> ${change.new_path}`,
    `NEW FILE: ${Boolean(change.new_file)}`,
    `RENAMED: ${Boolean(change.renamed_file)}`,
    `DELETED: ${Boolean(change.deleted_file)}`,
    "DIFF:"
  ].join("\n");
  const diffBody = change.diff || "(diff not available)";
  const fullText = `${prefix}\n${diffBody}`;
  const filePath = change.new_path || change.old_path || "(unknown file)";

  if (fullText.length <= maxChars) {
    return [{ filePath, text: fullText }];
  }

  const availableDiffChars = Math.max(1000, maxChars - prefix.length - 64);
  const diffLines = diffBody.split("\n");
  const segments = [];
  let currentLines = [];
  let currentLength = 0;

  for (const line of diffLines) {
    const lineLength = line.length + 1;
    if (currentLines.length > 0 && currentLength + lineLength > availableDiffChars) {
      segments.push(currentLines.join("\n"));
      currentLines = [];
      currentLength = 0;
    }

    currentLines.push(line);
    currentLength += lineLength;
  }

  if (currentLines.length > 0) {
    segments.push(currentLines.join("\n"));
  }

  return segments.map((segment, index) => ({
    filePath,
    text: `${prefix}\n[diff part ${index + 1}/${segments.length}]\n${segment}`
  }));
}

function createEmptyChunk() {
  return {
    filePaths: new Set(),
    text: ""
  };
}

function finalizeChunk(chunk, index) {
  return {
    chars: chunk.text.length,
    filePaths: [...chunk.filePaths],
    index,
    text: chunk.text
  };
}

module.exports = {
  buildReviewDiff
};
