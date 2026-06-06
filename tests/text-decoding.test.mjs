import assert from "node:assert/strict";
import { decodeTextBytes } from "../src/text-decoding.js";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("decodes GB18030 novel text instead of returning mojibake", () => {
  const gb18030Bytes = Uint8Array.from([
    0xca, 0xe9, 0xc3, 0xfb, 0xa3, 0xba, 0xa1, 0xb6, 0xd7, 0xee, 0xba,
    0xf3, 0xd2, 0xbb, 0xb8, 0xf6, 0xd0, 0xde, 0xd5, 0xe6, 0xd5, 0xdf,
    0xa1, 0xb7, 0x0d, 0x0a, 0xd7, 0xf7, 0xd5, 0xdf, 0xa3, 0xba, 0xd6,
    0xbd, 0xc9, 0xcf, 0xb7, 0xc9, 0xd1, 0xa9, 0x0d, 0x0a
  ]);

  const result = decodeTextBytes(gb18030Bytes);

  assert.equal(result.encoding, "gb18030");
  assert.ok(result.text.includes("书名：《最后一个修真者》"));
  assert.ok(result.text.includes("作者：纸上飞雪"));
  assert.equal(result.text.includes("���"), false);
});

runTest("keeps UTF-8 text as UTF-8", () => {
  const utf8Bytes = new TextEncoder().encode("第一章 雨夜\n林舟：“我回来了。”");

  const result = decodeTextBytes(utf8Bytes);

  assert.equal(result.encoding, "utf-8");
  assert.ok(result.text.includes("第一章 雨夜"));
});
