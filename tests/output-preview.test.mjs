import assert from "node:assert/strict";
import {
  buildImportedTextPreview,
  buildYamlPreview
} from "../src/output-preview.js";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("keeps small YAML output unchanged", () => {
  const yaml = 'schema_version: "1.0"\nchapters: []\n';

  const preview = buildYamlPreview(yaml, 200);

  assert.equal(preview.truncated, false);
  assert.equal(preview.text, yaml);
  assert.equal(preview.originalLength, yaml.length);
});

runTest("truncates huge YAML output with a clear download notice", () => {
  const yaml = `schema_version: "1.0"\n${"chapter: []\n".repeat(100)}`;

  const preview = buildYamlPreview(yaml, 120);

  assert.equal(preview.truncated, true);
  assert.ok(preview.text.includes("完整 YAML 已生成"));
  assert.ok(preview.text.includes("请使用下载按钮保存完整文件"));
  assert.ok(preview.text.length < yaml.length);
  assert.equal(preview.originalLength, yaml.length);
});

runTest("truncates imported long text while keeping metadata visible", () => {
  const text = "第一章 开端\n".repeat(1000);

  const preview = buildImportedTextPreview(
    text,
    "长篇小说.txt",
    "gb18030",
    120
  );

  assert.equal(preview.truncated, true);
  assert.ok(preview.text.includes("【已导入】长篇小说.txt"));
  assert.ok(preview.text.includes("【编码】gb18030"));
  assert.ok(preview.text.includes("生成和下载仍使用完整全文"));
  assert.equal(preview.originalLength, text.length);
});
