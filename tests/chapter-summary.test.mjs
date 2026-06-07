import assert from "node:assert/strict";
import {
  buildChapterSummaries,
  getVisibleChapterSummaries
} from "../src/chapter-summary.js";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const project = {
  chapters: [
    {
      id: "ch001",
      title: "雨夜",
      summary: "林舟回到旧邮局。",
      characters: ["林舟", "老陈"],
      scenes: [
        {
          title: "邮局",
          location: "旧邮局",
          emotional_tone: "悬疑",
          characters: ["林舟", "老陈"],
          beats: [{}, {}, {}]
        }
      ]
    },
    {
      id: "ch002",
      title: "黑伞",
      summary: "沈珂在雾中出现。",
      characters: ["林舟", "沈珂"],
      scenes: [
        {
          title: "街口",
          location: "街口",
          emotional_tone: "紧张",
          characters: ["林舟", "沈珂"],
          beats: [{}, {}]
        },
        {
          title: "巷子",
          location: "旧巷",
          emotional_tone: "压抑",
          characters: ["林舟"],
          beats: [{}]
        }
      ]
    }
  ]
};

runTest("builds readable chapter metrics and scene details", () => {
  const summaries = buildChapterSummaries(project);

  assert.equal(summaries.length, 2);
  assert.deepEqual(summaries[0], {
    id: "ch001",
    number: 1,
    title: "雨夜",
    summary: "林舟回到旧邮局。",
    sceneCount: 1,
    characterCount: 2,
    beatCount: 3,
    intensity: 100,
    scenes: [
      {
        title: "邮局",
        location: "旧邮局",
        emotionalTone: "悬疑",
        characters: ["林舟", "老陈"],
        beatCount: 3
      }
    ]
  });
  assert.equal(summaries[1].intensity, 100);
  assert.equal(summaries[1].sceneCount, 2);
});

runTest("compares chapter intensity by beat count", () => {
  const custom = structuredClone(project);
  custom.chapters[1].scenes[1].beats.push({}, {}, {});

  const summaries = buildChapterSummaries(custom);

  assert.equal(summaries[0].intensity, 50);
  assert.equal(summaries[1].intensity, 100);
});

runTest("limits long chapter summaries until expanded", () => {
  const summaries = Array.from({ length: 12 }, (_, index) => ({ id: `ch${index}` }));

  assert.equal(getVisibleChapterSummaries(summaries, false, 6).length, 6);
  assert.equal(getVisibleChapterSummaries(summaries, true, 6).length, 12);
});
