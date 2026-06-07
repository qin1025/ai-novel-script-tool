import {
  ConversionCancelledError,
  convertNovelWithApi
} from "./api-converter.js?v=2026-06-07-softui";
import {
  buildChapterSummaries,
  getVisibleChapterSummaries
} from "./chapter-summary.js?v=2026-06-07-summary";
import { decodeTextBytes } from "./text-decoding.js?v=2026-06-07-softui";
import {
  buildImportedTextPreview,
  buildYamlPreview,
  formatNumber
} from "./output-preview.js?v=2026-06-07-softui";

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
  cancelButton: document.querySelector("#cancelButton"),
  progressCard: document.querySelector("#progressCard"),
  progressBar: document.querySelector("#progressBar"),
  progressPercent: document.querySelector("#progressPercent"),
  progressDetail: document.querySelector("#progressDetail"),
  progressChapter: document.querySelector("#progressChapter"),
  progressTrack: document.querySelector(".progress-track"),
  apiStatusLabel: document.querySelector("#apiStatusLabel"),
  apiStatusDetail: document.querySelector("#apiStatusDetail"),
  loadSampleButton: document.querySelector("#loadSampleButton"),
  clearButton: document.querySelector("#clearButton"),
  copyButton: document.querySelector("#copyButton"),
  downloadButton: document.querySelector("#downloadButton"),
  chapterCount: document.querySelector("#chapterCount"),
  sceneCount: document.querySelector("#sceneCount"),
  characterCount: document.querySelector("#characterCount"),
  beatCount: document.querySelector("#beatCount"),
  warningList: document.querySelector("#warningList"),
  chapterSummaryList: document.querySelector("#chapterSummaryList"),
  toggleChaptersButton: document.querySelector("#toggleChaptersButton"),
  pointerGlow: document.querySelector("#pointerGlow")
};

let latestResult = null;
let latestImportEncoding = "";
let latestImportedText = "";
let latestYamlPreview = null;
let activeController = null;
let latestChapterSummaries = [];
let showAllChapters = false;
let apiConfigStatus = {
  configured: false,
  loading: true,
  keySource: "missing",
  maxChapters: 0,
  message: "正在读取 api-config.json..."
};

renderApiConfigStatus();
let apiConfigLoadPromise = loadApiConfigStatus();
renderEmptyState();
setupPointerTracking();

elements.toggleChaptersButton.addEventListener("click", () => {
  showAllChapters = !showAllChapters;
  renderChapterSummaries();
});

elements.cancelButton.addEventListener("click", () => {
  if (!activeController || activeController.signal.aborted) {
    return;
  }

  renderProgress({
    state: "cancelling",
    detail: "正在取消任务",
    chapter: "保留已经完成的章节，请稍候..."
  });
  elements.cancelButton.disabled = true;
  activeController.abort();
});

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
  clearChapterSummaries();
  setStatus("示例文本已载入，等待生成", true);
  renderProgress();
});

elements.novelInput.addEventListener("input", () => {
  latestImportedText = "";
  latestImportEncoding = "";
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
    clearChapterSummaries();
    setStatus(
      `已导入 ${file.name} · ${decoded.encoding}，等待生成 YAML`,
      true
    );
    renderProgress();
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
    await apiConfigLoadPromise;
    if (!apiConfigStatus.configured) {
      throw new Error(apiConfigStatus.message || "API 配置不完整，无法生成剧本。");
    }

    setBusy(true);
    activeController = new AbortController();
    setStatus(formatStatus("正在调用配置文件 API..."), true);
    renderProgress({
      state: "running",
      percent: 0,
      detail: "正在分析章节",
      chapter: "准备发送第一个章节"
    });
    setBusy(true, true);
    await nextFrame();

    latestResult = await convertNovelWithApi(text, {
      title: elements.titleInput.value,
      model: apiConfigStatus.model,
      maxChapters: apiConfigStatus.maxChapters,
      useConfiguredProxy: true,
      signal: activeController.signal,
      onProgress: ({ phase, current, total, chapterNumber, title }) => {
        const percent = Math.round((current / Math.max(1, total)) * 100);
        setStatus(
          formatStatus(
            phase === "complete"
              ? `已完成 ${current}/${total} 章`
              : `正在生成第 ${chapterNumber}/${total} 章：${title}`
          ),
          true
        );
        renderProgress({
          state: "running",
          percent,
          detail:
            phase === "complete"
              ? `已完成 ${current} / ${total} 章`
              : `正在生成第 ${chapterNumber} / ${total} 章`,
          chapter: title
        });
      }
    });
    renderResult(latestResult);
    const suffix = previewSuffix();
    setStatus(
      formatStatus(
        `${latestResult.warnings.length > 0 ? "已生成，需校验" : "已生成，可提交"}${suffix}`
      ),
      latestResult.warnings.length === 0
    );
    renderProgress({
      state: "complete",
      percent: 100,
      detail: "剧本生成完成",
      chapter: "结果已整理，可继续校验、复制或下载"
    });
  } catch (error) {
    if (error instanceof ConversionCancelledError) {
      if (error.partialResult) {
        latestResult = error.partialResult;
        renderResult(latestResult);
        const completed = latestResult.project.metadata.api_processed_chapter_count;
        const total = latestResult.project.metadata.api_planned_chapter_count;
        const percent = Math.round((completed / Math.max(1, total)) * 100);
        setStatus(
          formatStatus(`任务已取消，已保留 ${completed}/${total} 章部分结果${previewSuffix()}`),
          false
        );
        renderProgress({
          state: "cancelled",
          percent,
          detail: "任务已取消，部分结果已保留",
          chapter: `已完成 ${completed} / ${total} 章，可下载当前 YAML`
        });
      } else {
        setStatus("任务已取消，尚无已完成章节", false);
        renderProgress({
          state: "cancelled",
          percent: 0,
          detail: "任务已取消",
          chapter: "尚无已完成章节，小说正文已保留"
        });
      }
    } else {
      setStatus(`生成失败：${error.message || "无法转换文本"}`, false);
      renderProgress({
        state: "error",
        detail: "生成过程遇到问题",
        chapter: error.message || "请检查配置后重试"
      });
    }
  } finally {
    activeController = null;
    setBusy(false);
  }
}

function renderResult(result) {
  latestYamlPreview = buildYamlPreview(result.yaml);
  elements.yamlOutput.value = latestYamlPreview.text;
  renderStats(result);
  renderWarnings(result.warnings);
  latestChapterSummaries = buildChapterSummaries(result.project);
  showAllChapters = false;
  renderChapterSummaries();
}

function previewSuffix() {
  return latestYamlPreview?.truncated
    ? `，预览 ${formatNumber(latestYamlPreview.text.length)} / 完整 ${formatNumber(latestYamlPreview.originalLength)} 字符`
    : "";
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
  clearChapterSummaries();
  renderProgress();
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

async function loadApiConfigStatus() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload?.error?.message || "无法读取 api-config.json。");
    }

    apiConfigStatus = {
      configured: Boolean(payload.configured),
      baseUrl: payload.baseUrl || "",
      model: payload.model || "",
      authHeader: payload.authHeader || "bearer",
      maxChapters: normalizeMaxChapters(payload.maxChapters),
      hasApiKey: Boolean(payload.hasApiKey),
      keySource: payload.keySource || "missing",
      loading: false,
      message: payload.message || ""
    };
  } catch (error) {
    apiConfigStatus = {
      configured: false,
      loading: false,
      keySource: "missing",
      maxChapters: 0,
      message: "未连接本地服务，无法使用 API 转换。"
    };
  }

  renderApiConfigStatus();
}

function renderApiConfigStatus() {
  elements.apiStatusLabel.className = "";
  elements.apiStatusDetail.className = "";

  if (apiConfigStatus.loading) {
    elements.apiStatusLabel.textContent = "正在读取 API 配置";
    elements.apiStatusDetail.textContent = "配置文件：api-config.json";
    return;
  }

  if (apiConfigStatus.configured) {
    const limitText =
      apiConfigStatus.maxChapters > 0
        ? ` · 最多 ${apiConfigStatus.maxChapters} 章`
        : "";
    elements.apiStatusLabel.textContent =
      apiConfigStatus.keySource === "user-config" ? "用户 API 已启用" : "内置默认 API 已启用";
    elements.apiStatusLabel.className = "is-ok";
    elements.apiStatusDetail.textContent =
      `${apiConfigStatus.model || "未命名模型"} · ${apiConfigStatus.authHeader || "bearer"} · 密钥已加载${limitText}`;
    return;
  }

  elements.apiStatusLabel.textContent = "API 配置不可用";
  elements.apiStatusLabel.className = "is-error";
  elements.apiStatusDetail.textContent =
    apiConfigStatus.message || "请配置用户 API Key 或提供 api-secret.enc。";
}

function normalizeMaxChapters(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }

  return Math.floor(number);
}

function setBusy(isBusy, canCancel = false) {
  elements.convertButton.disabled = isBusy;
  elements.fileInput.disabled = isBusy;
  elements.clearButton.disabled = isBusy;
  elements.loadSampleButton.disabled = isBusy;
  elements.titleInput.disabled = isBusy;
  elements.novelInput.disabled = isBusy;
  elements.cancelButton.hidden = !canCancel;
  elements.cancelButton.disabled = !canCancel;
}

function renderProgress({
  state = "idle",
  percent = 0,
  detail = "准备开始创作",
  chapter = "导入小说文本后，即可生成结构化剧本"
} = {}) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  elements.progressCard.dataset.state = state;
  elements.progressBar.style.width = `${safePercent}%`;
  elements.progressPercent.textContent = `${safePercent}%`;
  elements.progressDetail.textContent = detail;
  elements.progressChapter.textContent = chapter;
  elements.progressTrack.setAttribute("aria-valuenow", String(safePercent));
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function clearChapterSummaries() {
  latestChapterSummaries = [];
  showAllChapters = false;
  renderChapterSummaries();
}

function renderChapterSummaries() {
  elements.chapterSummaryList.innerHTML = "";
  const visible = getVisibleChapterSummaries(latestChapterSummaries, showAllChapters);

  if (visible.length === 0) {
    const empty = document.createElement("p");
    empty.className = "chapter-summary-empty";
    empty.textContent = "生成剧本后，这里会汇总每章的摘要、场景、角色和 Beat。";
    elements.chapterSummaryList.append(empty);
    elements.toggleChaptersButton.hidden = true;
    return;
  }

  for (const chapter of visible) {
    const card = document.createElement("details");
    card.className = "chapter-card tilt-card";
    const summary = document.createElement("summary");
    summary.className = "chapter-card-summary";
    summary.append(
      buildChapterNumber(chapter.number),
      buildChapterMain(chapter),
      buildChapterMetrics(chapter)
    );
    card.append(summary, buildSceneList(chapter.scenes));
    elements.chapterSummaryList.append(card);
  }

  elements.toggleChaptersButton.hidden = latestChapterSummaries.length <= 6;
  elements.toggleChaptersButton.textContent = showAllChapters ? "收起章节" : "展开全部";
}

function buildChapterNumber(number) {
  const badge = document.createElement("span");
  badge.className = "chapter-number";
  badge.textContent = String(number).padStart(2, "0");
  return badge;
}

function buildChapterMain(chapter) {
  const main = document.createElement("span");
  main.className = "chapter-main";
  const title = document.createElement("strong");
  title.textContent = chapter.title;
  const summary = document.createElement("span");
  summary.textContent = chapter.summary;
  const meter = document.createElement("span");
  meter.className = "chapter-intensity";
  const fill = document.createElement("span");
  fill.style.width = `${chapter.intensity}%`;
  meter.append(fill);
  main.append(title, summary, meter);
  return main;
}

function buildChapterMetrics(chapter) {
  const metrics = document.createElement("span");
  metrics.className = "chapter-metrics";
  metrics.append(
    buildMetric("场景", chapter.sceneCount),
    buildMetric("角色", chapter.characterCount),
    buildMetric("Beat", chapter.beatCount)
  );
  return metrics;
}

function buildMetric(label, value) {
  const metric = document.createElement("span");
  metric.innerHTML = `<strong>${value}</strong><small>${label}</small>`;
  return metric;
}

function buildSceneList(scenes) {
  const list = document.createElement("div");
  list.className = "scene-list";

  for (const scene of scenes) {
    const item = document.createElement("article");
    item.className = "scene-item";
    const characters = scene.characters.length > 0 ? scene.characters.join("、") : "待确认";
    item.innerHTML = `
      <div><strong>${escapeHtml(scene.title)}</strong><span>${escapeHtml(scene.location)} · ${escapeHtml(scene.emotionalTone)}</span></div>
      <p>${escapeHtml(characters)}</p>
      <span>${scene.beatCount} Beat</span>
    `;
    list.append(item);
  }

  return list;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setupPointerTracking() {
  const supportsPointerEffects =
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!supportsPointerEffects) {
    return;
  }

  document.documentElement.classList.add("has-pointer-effects");
  let pointerX = window.innerWidth / 2;
  let pointerY = window.innerHeight / 2;
  let glowX = pointerX;
  let glowY = pointerY;
  let activeCard = null;

  document.addEventListener("pointermove", (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    const overControl = event.target.closest("button, input, textarea, a, label");
    const nextCard = overControl ? null : event.target.closest(".tilt-card");

    if (activeCard && activeCard !== nextCard) {
      resetTilt(activeCard);
    }

    activeCard = nextCard;
    if (activeCard) {
      updateTilt(activeCard, event.clientX, event.clientY);
    }
  });

  document.addEventListener("pointerleave", () => {
    if (activeCard) {
      resetTilt(activeCard);
      activeCard = null;
    }
  });

  const animateGlow = () => {
    glowX += (pointerX - glowX) * 0.14;
    glowY += (pointerY - glowY) * 0.14;
    elements.pointerGlow.style.transform = `translate3d(${glowX}px, ${glowY}px, 0)`;
    requestAnimationFrame(animateGlow);
  };
  requestAnimationFrame(animateGlow);
}

function updateTilt(card, pointerX, pointerY) {
  const rect = card.getBoundingClientRect();
  const relativeX = (pointerX - rect.left) / rect.width;
  const relativeY = (pointerY - rect.top) / rect.height;
  card.style.setProperty("--tilt-x", `${(0.5 - relativeY) * 2.2}deg`);
  card.style.setProperty("--tilt-y", `${(relativeX - 0.5) * 2.2}deg`);
  card.style.setProperty("--glow-x", `${relativeX * 100}%`);
  card.style.setProperty("--glow-y", `${relativeY * 100}%`);
}

function resetTilt(card) {
  card.style.setProperty("--tilt-x", "0deg");
  card.style.setProperty("--tilt-y", "0deg");
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
