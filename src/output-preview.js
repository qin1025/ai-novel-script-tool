export const DEFAULT_YAML_PREVIEW_CHARS = 240000;
export const DEFAULT_TEXT_PREVIEW_CHARS = 60000;

export function buildYamlPreview(yaml, maxChars = DEFAULT_YAML_PREVIEW_CHARS) {
  if (yaml.length <= maxChars) {
    return {
      text: yaml,
      truncated: false,
      originalLength: yaml.length
    };
  }

  const visibleYaml = yaml.slice(0, maxChars);
  const notice = [
    "# 完整 YAML 已生成。",
    `# 完整长度：${formatNumber(yaml.length)} 字符。`,
    "# 为避免浏览器卡顿，这里只显示前半部分预览。",
    "# 请使用下载按钮保存完整文件。",
    ""
  ].join("\n");

  return {
    text: `${notice}${visibleYaml}\n\n# ... 预览已截断，完整 YAML 请点击下载。\n`,
    truncated: true,
    originalLength: yaml.length
  };
}

export function buildImportedTextPreview(
  text,
  fileName,
  encoding,
  maxChars = DEFAULT_TEXT_PREVIEW_CHARS
) {
  if (text.length <= maxChars) {
    return {
      text,
      truncated: false,
      originalLength: text.length
    };
  }

  const notice = [
    `【已导入】${fileName}`,
    `【编码】${encoding}`,
    `【全文长度】${formatNumber(text.length)} 字符`,
    "【提示】为避免大文件编辑框卡顿，这里只显示正文预览；生成和下载仍使用完整全文。",
    "",
    text.slice(0, maxChars),
    "",
    "……正文预览已截断，完整内容已在后台用于生成 YAML。"
  ].join("\n");

  return {
    text: notice,
    truncated: true,
    originalLength: text.length
  };
}

export function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value);
}
