const testFiles = [
  "text-decoding.test.mjs",
  "api-converter.test.mjs",
  "chapter-summary.test.mjs",
  "output-preview.test.mjs",
  "converter.test.mjs"
];

for (const testFile of testFiles) {
  await import(new URL(testFile, import.meta.url));
}
