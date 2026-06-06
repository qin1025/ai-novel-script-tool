import assert from "node:assert/strict";
import {
  buildChatRequestOptions,
  buildChatCompletionsUrl,
  convertNovelWithApi,
  extractJsonObject,
  requestChapterScript
} from "../src/api-converter.js";

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await runTest("normalizes OpenAI-compatible chat completions URLs", () => {
  assert.equal(
    buildChatCompletionsUrl("https://api.example.com/v1"),
    "https://api.example.com/v1/chat/completions"
  );
  assert.equal(
    buildChatCompletionsUrl("https://api.example.com/v1/chat/completions"),
    "https://api.example.com/v1/chat/completions"
  );
});

await runTest("extracts JSON object from fenced model output", () => {
  const parsed = extractJsonObject('```json\n{"title":"第一章","scenes":[]}\n```');

  assert.equal(parsed.title, "第一章");
  assert.deepEqual(parsed.scenes, []);
});

await runTest("sends chapter text to an OpenAI-compatible API", async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "第一章 背井离乡",
                  summary: "白冷叶离家。",
                  characters: [{ name: "白冷叶", role: "主角" }],
                  scenes: [
                    {
                      title: "第一场",
                      location: "家门口",
                      time: "夜晚",
                      pov: "白冷叶",
                      emotional_tone: "愤怒",
                      characters: ["白冷叶"],
                      beats: [
                        {
                          type: "dialogue",
                          speaker: "白冷叶",
                          text: "你给我站住！"
                        }
                      ],
                      props: [],
                      revision_notes: []
                    }
                  ]
                })
              }
            }
          ]
        };
      }
    };
  };

  const result = await requestChapterScript({
    apiKey: "test-key",
    baseUrl: "https://api.example.com/v1",
    model: "test-model",
    chapter: {
      id: "ch001",
      title: "第一章 背井离乡",
      content: "白冷叶冷哼一声：“你给我站住！”"
    },
    fetchImpl: fakeFetch
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.example.com/v1/chat/completions");
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-key");
  assert.equal(JSON.parse(calls[0].options.body).model, "test-model");
  assert.equal(result.characters[0].name, "白冷叶");
  assert.equal(result.characters[0].role, "主角");
});

await runTest("builds request options with configurable extra body fields", () => {
  const options = buildChatRequestOptions({
    apiKey: "mimo-key",
    model: "mimo-v2.5-pro",
    messages: [{ role: "user", content: "hello" }],
    authMode: "api-key",
    requestBody: {
      stream: false,
      max_completion_tokens: 8192,
      thinking: { type: "disabled" },
      response_format: { type: "json_object" }
    }
  });
  const body = JSON.parse(options.body);

  assert.equal(options.headers["api-key"], "mimo-key");
  assert.equal(options.headers.Authorization, undefined);
  assert.equal(body.model, "mimo-v2.5-pro");
  assert.equal(body.stream, false);
  assert.equal(body.max_completion_tokens, 8192);
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.deepEqual(body.response_format, { type: "json_object" });
});

await runTest("uses configured local proxy without exposing API credentials", async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "第一章",
                  summary: "测试。",
                  characters: [],
                  scenes: []
                })
              }
            }
          ]
        };
      }
    };
  };

  await requestChapterScript({
    useConfiguredProxy: true,
    chapter: {
      id: "ch001",
      title: "第一章",
      content: "测试"
    },
    fetchImpl: fakeFetch
  });

  const proxyBody = JSON.parse(calls[0].options.body);

  assert.equal(calls[0].url, "/api/chat/completions");
  assert.ok(Array.isArray(proxyBody.messages));
  assert.equal(Object.hasOwn(proxyBody, "targetUrl"), false);
  assert.equal(JSON.stringify(proxyBody).includes("mimo-key"), false);
});

await runTest("uses local proxy when requested", async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "第一章",
                  summary: "测试。",
                  characters: [],
                  scenes: []
                })
              }
            }
          ]
        };
      }
    };
  };

  await requestChapterScript({
    apiKey: "mimo-key",
    baseUrl: "https://api.xiaomimimo.com/v1",
    model: "mimo-v2.5-pro",
    authMode: "api-key",
    useProxy: true,
    chapter: {
      id: "ch001",
      title: "第一章",
      content: "测试"
    },
    fetchImpl: fakeFetch
  });

  const proxyBody = JSON.parse(calls[0].options.body);

  assert.equal(calls[0].url, "/api/chat/completions");
  assert.equal(proxyBody.targetUrl, "https://api.xiaomimimo.com/v1/chat/completions");
  assert.equal(proxyBody.request.headers["api-key"], "mimo-key");
  assert.equal(proxyBody.request.body.model, "mimo-v2.5-pro");
});

await runTest("builds YAML project with API character roles", async () => {
  const fakeFetch = async () => ({
    ok: true,
    async json() {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "第一章 起声",
                summary: "白冷叶说话。",
                characters: [{ name: "白冷叶", role: "主角" }],
                scenes: [
                  {
                    title: "第一场",
                    location: "家门口",
                    time: "夜晚",
                    pov: "白冷叶",
                    emotional_tone: "愤怒",
                    characters: ["白冷叶"],
                    beats: [
                      {
                        type: "dialogue",
                        speaker: "白冷叶",
                        text: "你给我站住！"
                      }
                    ],
                    props: [],
                    revision_notes: []
                  }
                ]
              })
            }
          }
        ]
      };
    }
  });

  const result = await convertNovelWithApi(
    `第一章 起声
白冷叶：“你给我站住！”

第二章 余波
白冷叶：“我会回来。”

第三章 终章
白冷叶：“结束了。”`,
    {
      apiKey: "test-key",
      baseUrl: "https://api.example.com/v1",
      model: "test-model",
      fetchImpl: fakeFetch
    }
  );

  assert.equal(result.project.characters[0].name, "白冷叶");
  assert.equal(result.project.characters[0].role, "主角");
  assert.match(result.yaml, /api_processed_chapter_count: 3/);
});

await runTest("processes every detected chapter in API mode", async () => {
  let callCount = 0;
  const fakeFetch = async () => {
    callCount += 1;
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: `第${callCount}章`,
                  summary: "测试。",
                  characters: [{ name: "白冷叶", role: "主角" }],
                  scenes: [
                    {
                      title: "第一场",
                      location: "家门口",
                      time: "夜晚",
                      pov: "白冷叶",
                      emotional_tone: "愤怒",
                      characters: ["白冷叶"],
                      beats: [
                        {
                          type: "dialogue",
                          speaker: "白冷叶",
                          text: "我还在。"
                        }
                      ],
                      props: [],
                      revision_notes: []
                    }
                  ]
                })
              }
            }
          ]
        };
      }
    };
  };

  const result = await convertNovelWithApi(
    `第一章 起声
白冷叶：“你给我站住！”

第二章 余波
白冷叶：“我会回来。”

第三章 收束
白冷叶：“结束了。”

第四章 新局
白冷叶：“继续。”`,
    {
      apiKey: "test-key",
      baseUrl: "https://api.example.com/v1",
      model: "test-model",
      fetchImpl: fakeFetch
    }
  );

  assert.equal(callCount, 4);
  assert.equal(result.project.chapters.length, 4);
  assert.equal(result.project.metadata.api_processed_chapter_count, 4);
  assert.equal(
    result.warnings.some((warning) => warning.includes("API 模式当前生成前")),
    false
  );
  assert.doesNotMatch(result.yaml, /\baliases:/);
});
