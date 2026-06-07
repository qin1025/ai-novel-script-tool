import {
  serializeYaml,
  splitChapters,
  validateProject
} from "./converter.js";

const GENERATOR_NAME = "AI Novel Script Tool API Mode";
const UNKNOWN = "待确认";
const ALLOWED_BEAT_TYPES = new Set(["action", "dialogue", "transition", "note"]);

export class ConversionCancelledError extends Error {
  constructor(partialResult = null) {
    super("转换任务已取消");
    this.name = "ConversionCancelledError";
    this.partialResult = partialResult;
  }
}

export function buildChatCompletionsUrl(baseUrl) {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");

  if (!trimmed) {
    throw new Error("请填写 API Base URL。");
  }

  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}/chat/completions`;
}

export function extractJsonObject(text) {
  const raw = String(text || "").trim();
  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("API 没有返回 JSON 对象。");
  }

  return JSON.parse(unfenced.slice(start, end + 1));
}

export function buildChatRequestOptions({
  apiKey,
  model,
  messages,
  authMode = "bearer",
  requestBody = {},
  signal
}) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (authMode === "api-key") {
    headers["api-key"] = apiKey.trim();
  } else {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  const body = {
    model: model.trim(),
    temperature: 0.2,
    messages,
    ...requestBody
  };

  const options = {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  };

  if (signal) {
    options.signal = signal;
  }

  return options;
}

export async function requestChapterScript({
  apiKey,
  baseUrl,
  model,
  authMode = "bearer",
  requestBody = {},
  useProxy = false,
  useConfiguredProxy = false,
  chapter,
  schemaVersion = "1.0",
  signal,
  fetchImpl = globalThis.fetch
}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("当前浏览器不支持 fetch，无法直接调用 API。");
  }

  const messages = buildChapterMessages(chapter, schemaVersion);

  if (useConfiguredProxy) {
    const response = await fetchImpl(
      "/api/chat/completions",
      buildConfiguredProxyRequestOptions(messages, signal)
    );
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        payload?.error?.message ||
        payload?.message ||
        `API 请求失败：HTTP ${response.status || ""}`.trim();
      throw new Error(message);
    }

    const content = payload?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("API 返回中没有 choices[0].message.content。");
    }

    return extractJsonObject(content);
  }

  if (!apiKey?.trim()) {
    throw new Error("请填写 API Key。");
  }

  if (!model?.trim()) {
    throw new Error("请填写模型名称。");
  }

  const targetUrl = buildChatCompletionsUrl(baseUrl);
  const requestOptions = buildChatRequestOptions({
    apiKey,
    model,
    authMode,
    requestBody,
    messages,
    signal
  });
  const response = await fetchImpl(
    useProxy ? "/api/chat/completions" : targetUrl,
    useProxy
      ? buildProxyRequestOptions(targetUrl, requestOptions)
      : requestOptions
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      `API 请求失败：HTTP ${response.status || ""}`.trim();
    throw new Error(message);
  }

  const content = payload?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("API 返回中没有 choices[0].message.content。");
  }

  return extractJsonObject(content);
}

export async function convertNovelWithApi(text, options = {}) {
  const chapters = splitChapters(text);
  const apiChapters = limitChapters(chapters, options.maxChapters);
  const normalizedEntries = [];
  let sceneCounter = 0;
  let beatCounter = 0;

  for (let index = 0; index < apiChapters.length; index += 1) {
    const chapter = apiChapters[index];

    options.onProgress?.({
      phase: "start",
      current: index,
      total: apiChapters.length,
      chapterNumber: index + 1,
      title: chapter.title
    });

    try {
      throwIfAborted(options.signal);
      const apiChapter = await requestChapterScript({
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
        model: options.model,
        authMode: options.authMode,
        requestBody: options.requestBody,
        useProxy: options.useProxy,
        useConfiguredProxy: options.useConfiguredProxy,
        chapter,
        signal: options.signal,
        fetchImpl: options.fetchImpl
      });

      const normalized = normalizeApiChapter(apiChapter, chapter, index + 1, {
        sceneCounter,
        beatCounter
      });

      sceneCounter = normalized.nextSceneCounter;
      beatCounter = normalized.nextBeatCounter;
      normalizedEntries.push(normalized);
      options.onProgress?.({
        phase: "complete",
        current: index + 1,
        total: apiChapters.length,
        chapterNumber: index + 1,
        title: chapter.title
      });
    } catch (error) {
      if (!isCancellation(error, options.signal)) {
        throw error;
      }

      const partialResult =
        normalizedEntries.length > 0
          ? buildApiResult(chapters, apiChapters, normalizedEntries, options, "cancelled")
          : null;
      throw new ConversionCancelledError(partialResult);
    }
  }

  return buildApiResult(chapters, apiChapters, normalizedEntries, options, "completed");
}

function buildApiResult(chapters, apiChapters, normalizedEntries, options, status) {
  const normalizedChapters = normalizedEntries.map((entry) => entry.chapter);
  const characters = collectCharacters(normalizedEntries);
  const project = {
    schema_version: "1.0",
    title: options.title?.trim() || inferTitleFromChapters(chapters),
    source: {
      type: "novel_text",
      chapter_count: chapters.length,
      language: "zh-CN"
    },
    metadata: {
      generated_at: new Date().toISOString(),
      generator: GENERATOR_NAME,
      source_chapter_count: chapters.length,
      api_model: options.model?.trim() || UNKNOWN,
      api_processed_chapter_count: normalizedChapters.length,
      api_planned_chapter_count: apiChapters.length,
      conversion_status: status
    },
    characters,
    chapters: normalizedChapters
  };
  const warnings = validateProject(project);

  return {
    project,
    warnings,
    yaml: serializeYaml(project)
  };
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

function isCancellation(error, signal) {
  return Boolean(signal?.aborted || error?.name === "AbortError");
}

function limitChapters(chapters, maxChapters) {
  const limit = normalizePositiveInteger(maxChapters);

  return limit > 0 ? chapters.slice(0, limit) : chapters;
}

function normalizePositiveInteger(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }

  return Math.floor(number);
}

function buildProxyRequestOptions(targetUrl, requestOptions) {
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      targetUrl,
      request: {
        headers: requestOptions.headers,
        body: JSON.parse(requestOptions.body)
      }
    })
  };

  if (requestOptions.signal) {
    options.signal = requestOptions.signal;
  }

  return options;
}

function buildConfiguredProxyRequestOptions(messages, signal) {
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ messages })
  };

  if (signal) {
    options.signal = signal;
  }

  return options;
}

function buildChapterMessages(chapter, schemaVersion) {
  return [
    {
      role: "system",
      content: [
        "你是中文小说改编剧本助手。",
        "请把用户给出的单章小说改写为结构化剧本 JSON。",
        "只输出 JSON 对象，不要输出 Markdown、解释、注释或 YAML。",
        "人物 name 必须是真实人物名，不要把动作、语气、称谓短语当作人名。",
        "如果说话人不确定，speaker 写“待确认”。",
        "role 可写主角、配角、反派、家人、师父、旁白、待确认等。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `schema_version: ${schemaVersion}`,
        "请返回这个 JSON 结构：",
        "{",
        '  "title": "章节标题",',
        '  "summary": "章节摘要",',
        '  "characters": [{"name": "角色名", "role": "角色作用"}],',
        '  "scenes": [{',
        '    "title": "场景标题",',
        '    "location": "地点或待确认",',
        '    "time": "时间或待确认",',
        '    "pov": "视角人物或待确认",',
        '    "emotional_tone": "情绪基调或待确认",',
        '    "characters": ["角色名"],',
        '    "beats": [{"type": "action|dialogue|transition|note", "speaker": "说话人或待确认", "text": "内容"}],',
        '    "props": ["道具"],',
        '    "revision_notes": ["需要作者确认的点"]',
        "  }]",
        "}",
        "",
        `章节标题：${chapter.title}`,
        "章节正文：",
        chapter.content
      ].join("\n")
    }
  ];
}

function normalizeApiChapter(apiChapter, sourceChapter, chapterIndex, counters) {
  let sceneCounter = counters.sceneCounter;
  let beatCounter = counters.beatCounter;
  const scenes = asArray(apiChapter.scenes).map((scene, sceneIndex) => {
    sceneCounter += 1;
    const beats = asArray(scene.beats).map((beat) => {
      beatCounter += 1;
      const type = ALLOWED_BEAT_TYPES.has(beat.type) ? beat.type : "note";
      const normalizedBeat = {
        id: makeId("bt", beatCounter),
        type,
        text: cleanText(beat.text) || "待补充"
      };

      if (type === "dialogue") {
        normalizedBeat.speaker = cleanName(beat.speaker) || UNKNOWN;
      }

      return normalizedBeat;
    });

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
      title: cleanText(scene.title) || `第${sceneIndex + 1}场`,
      location: cleanText(scene.location) || UNKNOWN,
      time: cleanText(scene.time) || UNKNOWN,
      pov: cleanText(scene.pov) || UNKNOWN,
      emotional_tone: cleanText(scene.emotional_tone) || UNKNOWN,
      characters: asArray(scene.characters).map(cleanName).filter(Boolean),
      beats,
      props: asArray(scene.props).map(cleanText).filter(Boolean),
      revision_notes: asArray(scene.revision_notes).map(cleanText).filter(Boolean)
    };
  });

  return {
    chapter: {
      id: sourceChapter.id || makeId("ch", chapterIndex),
      title: cleanText(apiChapter.title) || sourceChapter.title || `第${chapterIndex}章`,
      summary: cleanText(apiChapter.summary) || "本章需要补充摘要。",
      characters: collectChapterCharacterNames(apiChapter, scenes),
      scenes
    },
    apiCharacters: asArray(apiChapter.characters)
      .map((character) => ({
        name: cleanName(character.name),
        role: cleanText(character.role) || UNKNOWN
      }))
      .filter((character) => character.name),
    nextSceneCounter: sceneCounter,
    nextBeatCounter: beatCounter
  };
}

function collectCharacters(entries) {
  const map = new Map();

  for (const entry of entries) {
    const chapter = entry.chapter;

    for (const character of entry.apiCharacters) {
      rememberCharacter(map, character.name, character.role, chapter.id);
    }

    for (const name of chapter.characters) {
      rememberCharacter(map, name, UNKNOWN, chapter.id);
    }

    for (const scene of chapter.scenes) {
      for (const name of scene.characters) {
        rememberCharacter(map, name, UNKNOWN, chapter.id);
      }

      for (const beat of scene.beats) {
        if (beat.type === "dialogue") {
          rememberCharacter(map, beat.speaker, UNKNOWN, chapter.id);
        }
      }
    }
  }

  return [...map.values()].map((character, index) => ({
    id: makeId("char", index + 1),
    name: character.name,
    role: character.role || UNKNOWN,
    first_appearance: character.firstChapter
  }));
}

function collectChapterCharacterNames(apiChapter, scenes) {
  const names = [
    ...asArray(apiChapter.characters).map((character) => cleanName(character.name)),
    ...scenes.flatMap((scene) => scene.characters),
    ...scenes.flatMap((scene) =>
      scene.beats
        .filter((beat) => beat.type === "dialogue")
        .map((beat) => cleanName(beat.speaker))
    )
  ];

  return [...new Set(names.filter(Boolean).filter((name) => name !== UNKNOWN))];
}

function rememberCharacter(map, name, role, firstChapter) {
  const clean = cleanName(name);

  if (!clean || clean === UNKNOWN || map.has(clean)) {
    return;
  }

  map.set(clean, {
    name: clean,
    role: cleanText(role) || UNKNOWN,
    firstChapter
  });
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function cleanName(value) {
  const text = cleanText(value)
    .replace(/[“”"'：:，,。！？!?、]/g, "")
    .trim();

  if (!text || text === UNKNOWN || text.length > 12) {
    return "";
  }

  return text;
}

function inferTitleFromChapters(chapters) {
  return chapters[0]?.title || "未命名剧本";
}

function makeId(prefix, index) {
  return `${prefix}${String(index).padStart(3, "0")}`;
}
