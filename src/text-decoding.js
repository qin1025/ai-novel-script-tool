const CANDIDATE_ENCODINGS = ["utf-8", "gb18030"];

export function decodeTextBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const candidates = CANDIDATE_ENCODINGS.map((encoding) =>
    decodeCandidate(bytes, encoding)
  ).filter(Boolean);

  candidates.sort((left, right) => right.score - left.score);

  const best = candidates[0] || {
    encoding: "utf-8",
    text: "",
    score: 0
  };

  return {
    encoding: best.encoding,
    text: best.text,
    score: best.score
  };
}

function decodeCandidate(bytes, encoding) {
  try {
    const text = new TextDecoder(encoding).decode(bytes);
    return {
      encoding,
      text,
      score: scoreDecodedText(text)
    };
  } catch {
    return null;
  }
}

function scoreDecodedText(text) {
  const replacementCount = countMatches(text, /�/g);
  const cjkCount = countMatches(text, /[\u4e00-\u9fff]/g);
  const chapterCount = countMatches(
    text,
    /^\s*第[一二三四五六七八九十百千万零〇两\d]+[章节回幕卷]/gim
  );
  const mojibakeCount = countMatches(text, /[锟斤拷烫屯]/g);
  const controlCount = countMatches(text, /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g);

  return (
    cjkCount * 2 +
    chapterCount * 120 -
    replacementCount * 80 -
    mojibakeCount * 20 -
    controlCount * 40
  );
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}
