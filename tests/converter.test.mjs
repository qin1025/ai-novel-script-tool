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

runTest("does not treat action phrases before speech verbs as character names", () => {
  const novel = `第一章 起声
破旧的大门突然被踹开，一名青年男子走了出来，脸上带着愤怒之色，猛然对着身后吼道：“别碰我的东西！”
白冷叶猛然对着身后吼道：“别碰我的东西！”
“喂！你是谁，那是我的东西……”白冷叶摇摇晃晃的走过去，拍了拍那老头肩膀说道。
老陈说：“我只是路过。”
妇女哽咽：“我不知道。”
语气冰冷：“别过来。”
男的道：“跟我走。”
高强满意：“这还差不多。”
方晓语哭：“我不想走。”
无香淡声：“坐下。”
男的冷笑：“你跑不掉。”
身后传来：“站住。”
白冷叶冷：“别说了。”
无香轻轻：“我知道。”
方晓语嬉：“你猜。”
医生拒绝：“不能进去。”
白冷叶又：“回来。”
半响之后：“没人回答。”

第二章 回声
白冷叶：“你到底是谁？”
白冷叶问道：“你认识我？”
那韩夫人继续问道：“你叫什么？”

第三章 收束
老陈：“以后你会知道。”`;

  const project = buildScriptProject(novel, { title: "角色名测试" });
  const names = project.characters.map((character) => character.name);
  const dialogueBeats = project.chapters.flatMap((chapter) =>
    chapter.scenes.flatMap((scene) =>
      scene.beats.filter((beat) => beat.type === "dialogue")
    )
  );

  assert.ok(names.includes("白冷叶"));
  assert.ok(names.includes("老陈"));
  assert.ok(names.includes("韩夫人"));
  assert.ok(names.includes("高强"));
  assert.ok(names.includes("方晓语"));
  assert.ok(names.includes("无香"));
  assert.equal(names.includes("猛然对着身后吼"), false);
  assert.equal(names.includes("妇女哽咽"), false);
  assert.equal(names.includes("语气冰冷"), false);
  assert.equal(names.includes("男的道"), false);
  assert.equal(names.includes("白冷叶问道"), false);
  assert.equal(names.includes("那韩夫人继续问道"), false);
  assert.equal(names.includes("高强满意"), false);
  assert.equal(names.includes("方晓语哭"), false);
  assert.equal(names.includes("无香淡声"), false);
  assert.equal(names.includes("男的冷笑"), false);
  assert.equal(names.includes("身后传来"), false);
  assert.equal(names.includes("白冷叶冷"), false);
  assert.equal(names.includes("无香轻轻"), false);
  assert.equal(names.includes("方晓语嬉"), false);
  assert.equal(names.includes("医生拒绝"), false);
  assert.equal(names.includes("白冷叶又"), false);
  assert.equal(names.includes("半响之后"), false);
  assert.equal(
    dialogueBeats.some((beat) => beat.speaker === "猛然对着身后吼"),
    false
  );
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

runTest("does not emit empty character alias fields", () => {
  const result = convertNovelToYaml(sampleNovel, { title: "雾城来信" });

  assert.equal(
    result.project.characters.every(
      (character) => !Object.hasOwn(character, "aliases")
    ),
    true
  );
  assert.doesNotMatch(result.yaml, /\baliases:/);
});
