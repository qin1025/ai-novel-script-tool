import { convertNovelToYaml } from "./converter.js";

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

const elements = {
  form: document.querySelector(".input-panel"),
  titleInput: document.querySelector("#titleInput"),
  novelInput: document.querySelector("#novelInput"),
  yamlOutput: document.querySelector("#yamlOutput"),
  statusText: document.querySelector("#statusText"),
  fileInput: document.querySelector("#fileInput"),
  loadSampleButton: document.querySelector("#loadSampleButton"),
  clearButton: document.querySelector("#clearButton"),
  copyButton: document.querySelector("#copyButton"),
  downloadButton: document.querySelector("#downloadButton"),
  chapterCount: document.querySelector("#chapterCount"),
  sceneCount: document.querySelector("#sceneCount"),
  characterCount: document.querySelector("#characterCount"),
  beatCount: document.querySelector("#beatCount"),
  warningList: document.querySelector("#warningList"),
  structureCanvas: document.querySelector("#structureCanvas")
};

let latestResult = null;

elements.novelInput.value = sampleNovel;
convertCurrentText();

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  convertCurrentText();
});

elements.loadSampleButton.addEventListener("click", () => {
  elements.titleInput.value = "雾城来信";
  elements.novelInput.value = sampleNovel;
  convertCurrentText();
});

elements.clearButton.addEventListener("click", () => {
  elements.novelInput.value = "";
  elements.yamlOutput.value = "";
  latestResult = null;
  renderEmptyState();
});

elements.fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;

  if (!file) {
    return;
  }

  elements.novelInput.value = await file.text();
  if (!elements.titleInput.value.trim()) {
    elements.titleInput.value = file.name.replace(/\.[^.]+$/, "");
  }
  convertCurrentText();
});

elements.copyButton.addEventListener("click", async () => {
  if (!elements.yamlOutput.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(elements.yamlOutput.value);
  } catch {
    elements.yamlOutput.focus();
    elements.yamlOutput.select();
    document.execCommand("copy");
  }

  setStatus("已复制 YAML", true);
});

elements.downloadButton.addEventListener("click", () => {
  if (!latestResult) {
    return;
  }

  const title = elements.titleInput.value.trim() || "script";
  downloadText(`${safeFileName(title)}.yaml`, latestResult.yaml);
});

function convertCurrentText() {
  const text = elements.novelInput.value.trim();

  if (!text) {
    renderEmptyState();
    return;
  }

  latestResult = convertNovelToYaml(text, {
    title: elements.titleInput.value
  });

  elements.yamlOutput.value = latestResult.yaml;
  renderStats(latestResult);
  renderWarnings(latestResult.warnings);
  drawStructure(latestResult.project);
  setStatus(
    latestResult.warnings.length > 0 ? "已生成，需校验" : "已生成，可提交",
    latestResult.warnings.length === 0
  );
}

function renderEmptyState() {
  latestResult = null;
  elements.statusText.textContent = "等待生成";
  elements.statusText.className = "";
  elements.chapterCount.textContent = "0";
  elements.sceneCount.textContent = "0";
  elements.characterCount.textContent = "0";
  elements.beatCount.textContent = "0";
  renderWarnings(["请输入三章以上小说文本。"]);
  drawStructure(null);
}

function renderStats(result) {
  const chapters = result.project.chapters;
  const scenes = chapters.flatMap((chapter) => chapter.scenes);
  const beats = scenes.flatMap((scene) => scene.beats);

  elements.chapterCount.textContent = String(chapters.length);
  elements.sceneCount.textContent = String(scenes.length);
  elements.characterCount.textContent = String(result.project.characters.length);
  elements.beatCount.textContent = String(beats.length);
}

function renderWarnings(warnings) {
  elements.warningList.innerHTML = "";

  if (warnings.length === 0) {
    const item = document.createElement("li");
    item.className = "ok";
    item.textContent = "通过三章以上与结构完整性校验";
    elements.warningList.append(item);
    return;
  }

  for (const warning of warnings) {
    const item = document.createElement("li");
    item.textContent = warning;
    elements.warningList.append(item);
  }
}

function setStatus(message, isOk) {
  elements.statusText.textContent = message;
  elements.statusText.className = isOk ? "is-ok" : "is-error";
}

function drawStructure(project) {
  const canvas = elements.structureCanvas;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#fbfcfa";
  context.fillRect(0, 0, width, height);

  if (!project || project.chapters.length === 0) {
    context.fillStyle = "#647067";
    context.font = "14px Segoe UI, sans-serif";
    context.fillText("等待生成结构图", 24, 78);
    return;
  }

  const padding = 24;
  const gap = 16;
  const usableWidth = width - padding * 2 - gap * (project.chapters.length - 1);
  const chapterWidth = usableWidth / project.chapters.length;
  const colors = ["#246b5b", "#b56b16", "#375d91", "#a33a34"];

  project.chapters.forEach((chapter, chapterIndex) => {
    const x = padding + chapterIndex * (chapterWidth + gap);
    const sceneHeight = 18;
    const sceneGap = 7;

    context.fillStyle = "#1d2521";
    context.font = "12px Segoe UI, sans-serif";
    context.fillText(chapter.id, x, 22);

    chapter.scenes.forEach((scene, sceneIndex) => {
      const y = 38 + sceneIndex * (sceneHeight + sceneGap);
      const beatCount = Math.max(1, scene.beats.length);
      const sceneWidth = Math.max(20, Math.min(chapterWidth, beatCount * 18));

      context.fillStyle = colors[(chapterIndex + sceneIndex) % colors.length];
      context.fillRect(x, y, sceneWidth, sceneHeight);
      context.fillStyle = "#ffffff";
      context.font = "11px Segoe UI, sans-serif";
      context.fillText(String(beatCount), x + 7, y + 13);
    });
  });
}

function downloadText(fileName, text) {
  const blob = new Blob([text], { type: "text/yaml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "script";
}
