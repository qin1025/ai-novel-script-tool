const DEFAULT_TITLE = "未命名剧本";
const GENERATOR_NAME = "AI Novel Script Tool";
const UNKNOWN = "待确认";
const CHAPTER_HEADING_RE =
  /^\s*(第[一二三四五六七八九十百千万零〇两\d]+[章节回幕卷][^\n]*|Chapter\s+\d+[^\n]*|CHAPTER\s+\d+[^\n]*|#{1,3}\s+第?[一二三四五六七八九十百千万零〇两\d]+[章节回幕卷]?[^\n]*)\s*$/i;
const SCENE_HEADING_RE =
  /^\s*(?:场景|镜头|Scene)\s*[一二三四五六七八九十百千万零〇两\d]*\s*[：:.\-、]?\s*(.*)$/i;
const SPEAKER_LINE_RE = /^([^：:，,。、“”"'\s]{1,16})[：:]\s*(.+)$/;
const QUOTE_RE = /“([^”]+)”|"([^"]+)"/g;
const SPEAKER_CONTEXT_RE =
  /([\u4e00-\u9fa5A-Za-z0-9_·]{1,16})(?:低声|轻声|大声|平静地|忽然|缓缓|急切地|冷冷地)?(?:说|问|喊|道|回答|说道|笑道|低语|喃喃)/g;

export function normalizeText(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u3000/g, " ")
    .trim();
}

export function splitChapters(text) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n");
  const chapters = [];
  let current = null;
  const prefaceLines = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (current) {
        current.lines.push("");
      }
      continue;
    }

    if (isChapterHeading(trimmed)) {
      if (current) {
        chapters.push(finalizeChapter(current, chapters.length + 1));
      }

      current = {
        title: cleanHeading(trimmed),
        lines: []
      };
      continue;
    }

    if (current) {
      current.lines.push(trimmed);
    } else {
      prefaceLines.push(trimmed);
    }
  }

  if (current) {
    chapters.push(finalizeChapter(current, chapters.length + 1));
  }

  if (chapters.length > 0) {
    return chapters;
  }

  return splitFallbackChapters(prefaceLines);
}

export function buildScriptProject(text, options = {}) {
  const chapters = splitChapters(text);
  const characterMap = new Map();
  let sceneCounter = 0;
  let beatCounter = 0;

  const scriptChapters = chapters.map((chapter, chapterIndex) => {
    const scenes = splitScenes(chapter).map((sceneSeed, sceneIndex) => {
      sceneCounter += 1;
      const sceneCharacters = new Set();
      const beats = [];

      for (const paragraph of sceneSeed.paragraphs) {
        const paragraphBeats = paragraphToBeats(paragraph);

        for (const beat of paragraphBeats) {
          beatCounter += 1;
          const scriptBeat = {
            id: makeId("bt", beatCounter),
            ...beat
          };

          if (scriptBeat.speaker && scriptBeat.speaker !== UNKNOWN) {
            sceneCharacters.add(scriptBeat.speaker);
            rememberCharacter(characterMap, scriptBeat.speaker, chapter.id);
          }

          beats.push(scriptBeat);
        }
      }

      if (beats.length === 0) {
        beatCounter += 1;
        beats.push({
          id: makeId("bt", beatCounter),
          type: "note",
          text: "该场景需要补充动作或对白。"
        });
      }

      return {
        id: makeId("sc", sceneCounter),
        title: sceneSeed.title || `第${sceneIndex + 1}场`,
        location: inferLocation(sceneSeed.title, sceneSeed.paragraphs),
        time: inferTime(sceneSeed.paragraphs),
        pov: UNKNOWN,
        emotional_tone: inferTone(sceneSeed.paragraphs),
        characters: [...sceneCharacters],
        beats,
        props: inferProps(sceneSeed.paragraphs),
        revision_notes: ["请确认场景地点、时间、视角和情绪基调。"]
      };
    });

    return {
      id: chapter.id || makeId("ch", chapterIndex + 1),
      title: chapter.title || `第${chapterIndex + 1}章`,
      summary: summarizeText(chapter.content),
      characters: unique(scenes.flatMap((scene) => scene.characters)),
      scenes
    };
  });

  return {
    schema_version: "1.0",
    title: options.title?.trim() || inferTitle(text) || DEFAULT_TITLE,
    source: {
      type: "novel_text",
      chapter_count: chapters.length,
      language: "zh-CN"
    },
    metadata: {
      generated_at: new Date().toISOString(),
      generator: GENERATOR_NAME,
      source_chapter_count: chapters.length
    },
    characters: [...characterMap.entries()].map(([name, firstChapter], index) => ({
      id: makeId("char", index + 1),
      name,
      aliases: [],
      role: UNKNOWN,
      first_appearance: firstChapter
    })),
    chapters: scriptChapters
  };
}

export function convertNovelToYaml(text, options = {}) {
  const project = buildScriptProject(text, options);
  const warnings = validateProject(project);

  return {
    project,
    warnings,
    yaml: serializeYaml(project)
  };
}

export function validateProject(project) {
  const warnings = [];

  if (project.chapters.length < 3) {
    warnings.push("检测到的章节数少于题目要求：至少 3 个章节。");
  }

  for (const chapter of project.chapters) {
    if (chapter.scenes.length === 0) {
      warnings.push(`${chapter.id} 没有生成场景。`);
    }

    for (const scene of chapter.scenes) {
      if (scene.beats.length === 0) {
        warnings.push(`${scene.id} 没有生成动作或对白。`);
      }
    }
  }

  return warnings;
}

export function serializeYaml(value) {
  return `${serializeNode(value, 0).trimEnd()}\n`;
}

function isChapterHeading(line) {
  return CHAPTER_HEADING_RE.test(line);
}

function cleanHeading(line) {
  return line.replace(/^#{1,3}\s*/, "").trim();
}

function finalizeChapter(chapter, index) {
  const paragraphs = compactParagraphs(chapter.lines);

  return {
    id: makeId("ch", index),
    title: chapter.title,
    paragraphs,
    content: paragraphs.join("\n")
  };
}

function splitFallbackChapters(lines) {
  const paragraphs = compactParagraphs(lines);

  if (paragraphs.length === 0) {
    return [];
  }

  const chunkSize = Math.max(1, Math.ceil(paragraphs.length / 3));
  const chunks = [];

  for (let index = 0; index < paragraphs.length; index += chunkSize) {
    chunks.push(paragraphs.slice(index, index + chunkSize));
  }

  return chunks.map((paragraphChunk, index) => ({
    id: makeId("ch", index + 1),
    title: `第${index + 1}章`,
    paragraphs: paragraphChunk,
    content: paragraphChunk.join("\n")
  }));
}

function splitScenes(chapter) {
  const scenes = [];
  let current = null;
  let sawExplicitScene = false;

  for (const paragraph of chapter.paragraphs) {
    const sceneMatch = paragraph.match(SCENE_HEADING_RE);

    if (sceneMatch) {
      sawExplicitScene = true;
      if (current) {
        scenes.push(current);
      }

      current = {
        title: sceneMatch[1]?.trim() || `第${scenes.length + 1}场`,
        paragraphs: []
      };
      continue;
    }

    if (!current) {
      current = {
        title: "第一场",
        paragraphs: []
      };
    }

    current.paragraphs.push(paragraph);
  }

  if (current) {
    scenes.push(current);
  }

  if (sawExplicitScene || scenes.length !== 1 || chapter.paragraphs.length <= 5) {
    return scenes;
  }

  return chunkImplicitScenes(chapter.paragraphs);
}

function chunkImplicitScenes(paragraphs) {
  const chunkSize = 4;
  const scenes = [];

  for (let index = 0; index < paragraphs.length; index += chunkSize) {
    scenes.push({
      title: `第${scenes.length + 1}场`,
      paragraphs: paragraphs.slice(index, index + chunkSize)
    });
  }

  return scenes;
}

function paragraphToBeats(paragraph) {
  const speakerLine = paragraph.match(SPEAKER_LINE_RE);

  if (speakerLine) {
    return [
      {
        type: "dialogue",
        speaker: normalizeSpeaker(speakerLine[1]),
        text: cleanDialogueText(speakerLine[2])
      }
    ];
  }

  const beats = [];
  let lastIndex = 0;
  let match;

  QUOTE_RE.lastIndex = 0;
  while ((match = QUOTE_RE.exec(paragraph)) !== null) {
    const before = paragraph.slice(lastIndex, match.index).trim();

    if (before) {
      beats.push({
        type: "action",
        text: cleanupAction(before)
      });
    }

    beats.push({
      type: "dialogue",
      speaker: inferSpeakerFromContext(paragraph.slice(0, match.index)),
      text: cleanDialogueText(match[1] || match[2])
    });

    lastIndex = match.index + match[0].length;
  }

  const after = paragraph.slice(lastIndex).trim();

  if (after) {
    beats.push({
      type: "action",
      text: cleanupAction(after)
    });
  }

  if (beats.length > 0) {
    return beats.filter((beat) => beat.text);
  }

  return [
    {
      type: "action",
      text: cleanupAction(paragraph)
    }
  ];
}

function inferSpeakerFromContext(context) {
  const compact = context.replace(/\s+/g, "");
  const matches = [...compact.matchAll(SPEAKER_CONTEXT_RE)];

  if (matches.length === 0) {
    return UNKNOWN;
  }

  return normalizeSpeaker(matches[matches.length - 1][1]);
}

function normalizeSpeaker(name) {
  return name
    .replace(/[“”"'：:，,。！？!?、]/g, "")
    .replace(/^(?:柜台后|门外|她|他|我|你|那人)/, "")
    .trim()
    .slice(0, 16) || UNKNOWN;
}

function cleanDialogueText(text) {
  return String(text ?? "")
    .replace(/^[“"'「『]+|[”"'」』]+$/g, "")
    .trim();
}

function cleanupAction(text) {
  return String(text ?? "").replace(/[：:]\s*$/g, "").trim();
}

function rememberCharacter(characterMap, speaker, chapterId) {
  if (!speaker || speaker === UNKNOWN || characterMap.has(speaker)) {
    return;
  }

  characterMap.set(speaker, chapterId);
}

function inferTitle(text) {
  const lines = normalizeText(text).split("\n");
  const firstLine = lines.find((line) => {
    const trimmed = line.trim();
    return trimmed && !isChapterHeading(trimmed) && trimmed.length <= 40;
  });

  return firstLine?.replace(/^《|》$/g, "").trim() || "";
}

function summarizeText(text) {
  const compact = String(text ?? "").replace(/\s+/g, " ").trim();

  if (!compact) {
    return "本章需要补充摘要。";
  }

  const sentence = compact.match(/^(.+?[。！？!?])/)?.[1] || compact;
  return truncate(sentence, 120);
}

function inferLocation(title, paragraphs) {
  const haystack = `${title || ""}\n${paragraphs.join("\n")}`;
  const locationPatterns = [
    /在([^，。；;]{1,12}(?:里|中|上|下|前|后|外|内))/,
    /走进([^，。；;]{1,12})/,
    /推开([^，。；;]{1,12})/
  ];

  for (const pattern of locationPatterns) {
    const match = haystack.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return UNKNOWN;
}

function inferTime(paragraphs) {
  const haystack = paragraphs.join("\n");
  const timeWords = ["清晨", "早晨", "上午", "中午", "下午", "傍晚", "黄昏", "夜", "深夜", "黎明"];
  return timeWords.find((word) => haystack.includes(word)) || UNKNOWN;
}

function inferTone(paragraphs) {
  const haystack = paragraphs.join("\n");

  if (/[雨雾旧黑暗冰冷地下室]/.test(haystack)) {
    return "悬疑";
  }

  if (/[笑暖光明]/.test(haystack)) {
    return "温暖";
  }

  if (/[喊急追逃]/.test(haystack)) {
    return "紧张";
  }

  return UNKNOWN;
}

function inferProps(paragraphs) {
  const haystack = paragraphs.join("\n");
  const candidates = ["信", "伞", "照片", "钥匙", "手机", "灯", "门", "剧本"];
  return candidates.filter((item) => haystack.includes(item));
}

function compactParagraphs(lines) {
  return lines.map((line) => line.trim()).filter(Boolean);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function makeId(prefix, index) {
  return `${prefix}${String(index).padStart(3, "0")}`;
}

function truncate(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function serializeNode(value, indent) {
  if (Array.isArray(value)) {
    return serializeArray(value, indent);
  }

  if (value && typeof value === "object") {
    return serializeObject(value, indent);
  }

  return `${" ".repeat(indent)}${formatScalar(value, indent)}`;
}

function serializeObject(object, indent) {
  const pad = " ".repeat(indent);
  const lines = [];

  for (const [key, value] of Object.entries(object)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${pad}${key}: []`);
      } else {
        lines.push(`${pad}${key}:`);
        lines.push(serializeArray(value, indent + 2));
      }
      continue;
    }

    if (value && typeof value === "object") {
      lines.push(`${pad}${key}:`);
      lines.push(serializeObject(value, indent + 2));
      continue;
    }

    lines.push(`${pad}${key}: ${formatScalar(value, indent)}`);
  }

  return lines.join("\n");
}

function serializeArray(array, indent) {
  const pad = " ".repeat(indent);

  if (array.length === 0) {
    return `${pad}[]`;
  }

  return array
    .map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return serializeArrayObjectItem(item, indent);
      }

      if (Array.isArray(item)) {
        return `${pad}-\n${serializeArray(item, indent + 2)}`;
      }

      return `${pad}- ${formatScalar(item, indent)}`;
    })
    .join("\n");
}

function serializeArrayObjectItem(item, indent) {
  const pad = " ".repeat(indent);
  const childPad = " ".repeat(indent + 2);
  const entries = Object.entries(item);

  if (entries.length === 0) {
    return `${pad}- {}`;
  }

  const lines = [];
  const [firstKey, firstValue] = entries[0];

  if (Array.isArray(firstValue)) {
    lines.push(`${pad}- ${firstKey}:`);
    lines.push(
      firstValue.length === 0
        ? `${childPad}[]`
        : serializeArray(firstValue, indent + 2)
    );
  } else if (firstValue && typeof firstValue === "object") {
    lines.push(`${pad}- ${firstKey}:`);
    lines.push(serializeObject(firstValue, indent + 2));
  } else {
    lines.push(`${pad}- ${firstKey}: ${formatScalar(firstValue, indent)}`);
  }

  for (const [key, value] of entries.slice(1)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${childPad}${key}: []`);
      } else {
        lines.push(`${childPad}${key}:`);
        lines.push(serializeArray(value, indent + 4));
      }
      continue;
    }

    if (value && typeof value === "object") {
      lines.push(`${childPad}${key}:`);
      lines.push(serializeObject(value, indent + 4));
      continue;
    }

    lines.push(`${childPad}${key}: ${formatScalar(value, indent + 2)}`);
  }

  return lines.join("\n");
}

function formatScalar(value, indent) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  const text = String(value);

  if (text.includes("\n")) {
    const pad = " ".repeat(indent + 2);
    return `|-\n${text
      .split("\n")
      .map((line) => `${pad}${line}`)
      .join("\n")}`;
  }

  return JSON.stringify(text);
}
