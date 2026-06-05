import assert from "node:assert/strict";
import {
  buildScriptProject,
  convertNovelToYaml,
  splitChapters
} from "../src/converter.js";

const sampleNovel = `《雾城来信》

第一章 雨夜
林舟推开旧邮局的门，雨水顺着伞骨滴在地板上。柜台后的灯忽明忽暗。
林舟：“我回来了。”
柜台后传来一个沙哑的声音，老陈说：“信在抽屉里，别问是谁寄来的。”

第二章 黑伞
清晨的雾压在街口，沈珂撑着黑伞站在路灯下。
沈珂：“你昨晚去了邮局？”
林舟点头，口袋里的信封像一块冰。

第三章 未寄出的名字
地下室的墙上贴满旧照片，每一张背后都有同一个日期。
老陈：“那不是信，是一份剧本。”
林舟望向照片中央空缺的位置，终于想起自己的名字。`;

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("splits a Chinese novel into three chapter objects", () => {
  const chapters = splitChapters(sampleNovel);

  assert.equal(chapters.length, 3);
  assert.deepEqual(
    chapters.map((chapter) => chapter.id),
    ["ch001", "ch002", "ch003"]
  );
  assert.equal(chapters[0].title, "第一章 雨夜");
});

runTest("builds an editable screenplay project from three chapters", () => {
  const project = buildScriptProject(sampleNovel, { title: "雾城来信" });

  assert.equal(project.schema_version, "1.0");
  assert.equal(project.title, "雾城来信");
  assert.equal(project.chapters.length, 3);
  assert.ok(project.characters.some((character) => character.name === "林舟"));
  assert.ok(project.characters.some((character) => character.name === "老陈"));
  assert.ok(project.chapters.every((chapter) => chapter.scenes.length >= 1));

  const dialogueBeats = project.chapters.flatMap((chapter) =>
    chapter.scenes.flatMap((scene) =>
      scene.beats.filter((beat) => beat.type === "dialogue")
    )
  );

  assert.ok(dialogueBeats.some((beat) => beat.speaker === "林舟"));
  assert.ok(dialogueBeats.some((beat) => beat.text === "那不是信，是一份剧本。"));
});

runTest("emits a validation warning below the three-chapter requirement", () => {
  const shortNovel = `第一章 开端
角色甲：“开始吧。”

第二章 转折
角色乙：“还不够。”`;

  const result = convertNovelToYaml(shortNovel);

  assert.ok(
    result.warnings.some((warning) => warning.includes("至少 3 个章节"))
  );
  assert.equal(result.project.chapters.length, 2);
});

runTest("serializes stable screenplay keys to YAML", () => {
  const result = convertNovelToYaml(sampleNovel, { title: "雾城来信" });

  assert.match(result.yaml, /schema_version: "1.0"/);
  assert.match(result.yaml, /source_chapter_count: 3/);
  assert.match(result.yaml, /chapters:/);
  assert.match(result.yaml, /emotional_tone:/);
  assert.match(result.yaml, /revision_notes:/);
});
