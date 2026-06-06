import { convertNovelWithApi } from "./api-converter.js?v=2026-06-06-mimo";
import { convertNovelToYaml } from "./converter.js?v=2026-06-06-mimo";
import { decodeTextBytes } from "./text-decoding.js?v=2026-06-06-mimo";
import {
  buildImportedTextPreview,
  buildYamlPreview,
  formatNumber
} from "./output-preview.js?v=2026-06-06-mimo";

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
  convertButton: document.querySelector("#convertButton"),
  apiEnabled: document.querySelector("#apiEnabled"),
  apiProvider: document.querySelector("#apiProvider"),
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  apiKey: document.querySelector("#apiKey"),
  apiModel: document.querySelector("#apiModel"),
  apiAuthMode: document.querySelector("#apiAuthMode"),
  apiChapterLimit: document.querySelector("#apiChapterLimit"),
  mimoPresetButton: document.querySelector("#mimoPresetButton"),
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
let latestImportEncoding = "";
let latestImportedText = "";
let latestYamlPreview = null;

loadApiSettings();
renderEmptyState();

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await convertCurrentText();
});

elements.loadSampleButton.addEventListener("click", async () => {
  latestImportEncoding = "";
  latestImportedText = "";
  elements.titleInput.value = "雾城来信";
  elements.novelInput.value = sampleNovel;
  elements.yamlOutput.value = "";
  latestResult = null;
  latestYamlPreview = null;
  renderEmptyStats();
  renderWarnings(["示例文本已载入，请点击“生成 YAML”。"]);
  drawStructure(null);
  setStatus("示例文本已载入，等待生成", true);
});

elements.novelInput.addEventListener("input", () => {
  latestImportedText = "";
  latestImportEncoding = "";
});

for (const element of [
  elements.apiEnabled,
  elements.apiProvider,
  elements.apiBaseUrl,
  elements.apiModel,
  elements.apiAuthMode,
  elements.apiChapterLimit
]) {
  element.addEventListener("change", saveApiSettings);
}

elements.mimoPresetButton.addEventListener("click", () => {
  elements.apiEnabled.checked = true;
  elements.apiProvider.value = "mimo";
  elements.apiBaseUrl.value = "https://api.xiaomimimo.com/v1";
  elements.apiModel.value = "mimo-v2.5-pro";
  elements.apiAuthMode.value = "api-key";
  elements.apiChapterLimit.value = elements.apiChapterLimit.value || "3";
  saveApiSettings();
  setStatus("已应用 MiMo 2.5 预设，请填写 API Key 后生成", true);
});

elements.clearButton.addEventListener("click", () => {
  elements.titleInput.value = "";
  elements.novelInput.value = "";
  elements.yamlOutput.value = "";
  latestResult = null;
  latestImportedText = "";
  latestYamlPreview = null;
  renderEmptyState();
});

elements.fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;

  if (!file) {
    return;
  }

  try {
    setBusy(true);
    setStatus("正在读取并识别编码...", false);
    await nextFrame();

    const decoded = decodeTextBytes(await file.arrayBuffer());
    latestImportEncoding = decoded.encoding;
    latestImportedText = decoded.text;
    const inputPreview = buildImportedTextPreview(
      decoded.text,
      file.name,
      decoded.encoding
    );

    elements.novelInput.value = inputPreview.text;
    if (!elements.titleInput.value.trim()) {
      elements.titleInput.value = file.name.replace(/\.[^.]+$/, "");
    }

    elements.yamlOutput.value = "";
    latestResult = null;
    latestYamlPreview = null;
    renderEmptyStats();
    renderWarnings(["文本已导入，请点击“生成 YAML”。"]);
    drawStructure(null);
    setStatus(
      `已导入 ${file.name} · ${decoded.encoding}，等待生成 YAML`,
      true
    );
  } catch (error) {
    setStatus(`导入失败：${error.message || "无法读取文件"}`, false);
  } finally {
    setBusy(false);
  }
});

elements.copyButton.addEventListener("click", async () => {
  if (!elements.yamlOutput.value) {
    return;
  }

  if (latestYamlPreview?.truncated) {
    setStatus("YAML 很大，请用下载按钮保存完整文件", false);
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

async function convertCurrentText() {
  const text = getCurrentSourceText().trim();

  if (!text) {
    renderEmptyState();
    return;
  }

  try {
    setBusy(true);
    setStatus(formatStatus(getApiSettings().enabled ? "正在调用 API..." : "正在生成 YAML..."), true);
    await nextFrame();

    const apiSettings = getApiSettings();
    latestResult = apiSettings.enabled
      ? await convertNovelWithApi(text, {
          title: elements.titleInput.value,
          apiKey: apiSettings.apiKey,
          baseUrl: apiSettings.baseUrl,
          model: apiSettings.model,
          provider: apiSettings.provider,
          authMode: apiSettings.authMode,
          useProxy: true,
          maxChapters: apiSettings.maxChapters,
          onProgress: ({ current, total, title }) => {
            setStatus(
              formatStatus(`API 生成中 ${current}/${total}：${title}`),
              true
            );
          }
        })
      : convertNovelToYaml(text, {
          title: elements.titleInput.value
        });
    latestYamlPreview = buildYamlPreview(latestResult.yaml);

    elements.yamlOutput.value = latestYamlPreview.text;
    renderStats(latestResult);
    renderWarnings(latestResult.warnings);
    drawStructure(latestResult.project);
    const suffix = latestYamlPreview.truncated
      ? `，预览 ${formatNumber(latestYamlPreview.text.length)} / 完整 ${formatNumber(latestYamlPreview.originalLength)} 字符`
      : "";
    setStatus(
      formatStatus(
        `${latestResult.warnings.length > 0 ? "已生成，需校验" : "已生成，可提交"}${suffix}`
      ),
      latestResult.warnings.length === 0
    );
  } catch (error) {
    setStatus(`生成失败：${error.message || "无法转换文本"}`, false);
  } finally {
    setBusy(false);
  }
}

function renderEmptyState() {
  latestResult = null;
  latestImportEncoding = "";
  latestImportedText = "";
  latestYamlPreview = null;
  elements.statusText.textContent = "等待导入或输入";
  elements.statusText.className = "";
  renderEmptyStats();
  renderWarnings(["请输入三章以上小说文本。"]);
  drawStructure(null);
}

function renderEmptyStats() {
  elements.chapterCount.textContent = "0";
  elements.sceneCount.textContent = "0";
  elements.characterCount.textContent = "0";
  elements.beatCount.textContent = "0";
}

function renderStats(result) {
  const chapters = result.project.chapters;
  let sceneCount = 0;
  let beatCount = 0;

  for (const chapter of chapters) {
    sceneCount += chapter.scenes.length;
    for (const scene of chapter.scenes) {
      beatCount += scene.beats.length;
    }
  }

  elements.chapterCount.textContent = String(chapters.length);
  elements.sceneCount.textContent = String(sceneCount);
  elements.characterCount.textContent = String(result.project.characters.length);
  elements.beatCount.textContent = String(beatCount);
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

function formatStatus(message) {
  return latestImportEncoding ? `${message} · ${latestImportEncoding}` : message;
}

function getCurrentSourceText() {
  return latestImportedText || elements.novelInput.value;
}

function getApiSettings() {
  return {
    enabled: elements.apiEnabled.checked,
    provider: elements.apiProvider.value,
    baseUrl: elements.apiBaseUrl.value.trim(),
    apiKey: elements.apiKey.value.trim(),
    model: elements.apiModel.value.trim(),
    authMode: elements.apiAuthMode.value,
    maxChapters: Number.parseInt(elements.apiChapterLimit.value, 10) || 3
  };
}

function loadApiSettings() {
  const saved = JSON.parse(localStorage.getItem("scriptToolApiSettings") || "{}");

  elements.apiEnabled.checked = Boolean(saved.enabled);
  elements.apiProvider.value = saved.provider || "generic";
  elements.apiBaseUrl.value = saved.baseUrl || "";
  elements.apiModel.value = saved.model || "";
  elements.apiAuthMode.value = saved.authMode || "bearer";
  elements.apiChapterLimit.value = saved.maxChapters || "3";
}

function saveApiSettings() {
  localStorage.setItem(
    "scriptToolApiSettings",
    JSON.stringify({
      enabled: elements.apiEnabled.checked,
      provider: elements.apiProvider.value,
      baseUrl: elements.apiBaseUrl.value.trim(),
      model: elements.apiModel.value.trim(),
      authMode: elements.apiAuthMode.value,
      maxChapters: elements.apiChapterLimit.value || "3"
    })
  );
}

function setBusy(isBusy) {
  elements.convertButton.disabled = isBusy;
  elements.fileInput.disabled = isBusy;
  elements.clearButton.disabled = isBusy;
  elements.loadSampleButton.disabled = isBusy;
  elements.apiEnabled.disabled = isBusy;
  elements.apiProvider.disabled = isBusy;
  elements.apiBaseUrl.disabled = isBusy;
  elements.apiKey.disabled = isBusy;
  elements.apiModel.disabled = isBusy;
  elements.apiAuthMode.disabled = isBusy;
  elements.apiChapterLimit.disabled = isBusy;
  elements.mimoPresetButton.disabled = isBusy;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
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
  const chapters = project.chapters;

  if (chapters.length > 40) {
    drawCompactStructure(context, chapters, width, height, padding);
    return;
  }

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

function drawCompactStructure(context, chapters, width, height, padding) {
  const maxScenes = Math.max(
    1,
    ...chapters.map((chapter) => chapter.scenes.length)
  );
  const chartWidth = width - padding * 2;
  const chartHeight = height - 50;
  const barWidth = Math.max(1, chartWidth / chapters.length);

  context.fillStyle = "#1d2521";
  context.font = "12px Segoe UI, sans-serif";
  context.fillText(`${chapters.length} 章结构概览`, padding, 22);

  chapters.forEach((chapter, index) => {
    const x = padding + index * barWidth;
    const barHeight = Math.max(
      2,
      Math.round((chapter.scenes.length / maxScenes) * chartHeight)
    );
    const y = height - padding - barHeight;

    context.fillStyle = index % 2 === 0 ? "#246b5b" : "#375d91";
    context.fillRect(x, y, Math.max(1, barWidth - 0.5), barHeight);
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
