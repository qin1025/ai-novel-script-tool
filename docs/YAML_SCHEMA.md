# AI 小说转剧本 YAML Schema

## 设计目标

这个 Schema 用来把三章以上小说文本转换为可编辑的结构化剧本初稿。它优先保证作者能快速修改章节、场景、角色、对白和动作，而不是追求一次性生成最终定稿。

## 顶层结构

```yaml
schema_version: "1.0"
title: "作品标题"
source:
  type: "novel_text"
  chapter_count: 3
  language: "zh-CN"
metadata:
  generated_at: "2026-06-05T00:00:00.000Z"
  generator: "AI Novel Script Tool"
  source_chapter_count: 3
characters:
  - id: "char001"
    name: "林舟"
    aliases: []
    role: "待确认"
    first_appearance: "ch001"
chapters:
  - id: "ch001"
    title: "第一章 雨夜"
    summary: "章节摘要"
    characters: ["林舟"]
    scenes:
      - id: "sc001"
        title: "第一场"
        location: "待确认"
        time: "待确认"
        pov: "待确认"
        emotional_tone: "待确认"
        beats:
          - id: "bt001"
            type: "dialogue"
            speaker: "林舟"
            text: "我回来了。"
        props: []
        revision_notes:
          - "请确认场景地点、时间和情绪基调。"
```

## 字段说明

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `schema_version` | string | 是 | Schema 版本，当前为 `1.0`。 |
| `title` | string | 是 | 项目标题，可由用户输入或从文本首行推断。 |
| `source` | object | 是 | 原始文本来源信息。 |
| `metadata` | object | 是 | 生成器、时间、章节数量等追溯信息。 |
| `characters` | array | 是 | 全局角色表，来源于对白说话人和叙述提示。 |
| `chapters` | array | 是 | 剧本主体，按小说章节保留结构。 |
| `chapters[].scenes` | array | 是 | 章节内的场景列表。 |
| `scenes[].beats` | array | 是 | 场景内的动作、对白、转场和备注。 |
| `beats[].type` | enum | 是 | `action`、`dialogue`、`transition`、`note` 之一。 |

## 设计原则

1. 保留小说章节层级：作者通常按章节组织素材，保留章节能降低二次整理成本。
2. 引入场景层级：剧本编辑需要按地点、时间和戏剧任务拆分内容。
3. 用 beat 表达最小可编辑单元：对白和动作都能单独修改、移动或删除。
4. 稳定 ID：`ch001`、`sc001`、`bt001` 便于后续接入批注、版本对比和导出工具。
5. 明确不确定性：地点、时间、视角和情绪如果无法可靠推断，就写 `待确认`，避免伪精确。
6. 保留元数据：`metadata` 让提交者说明生成来源，也便于验证是否满足三章以上要求。

## 校验规则

- `chapters.length` 应大于等于 3。
- 每个章节至少包含一个场景。
- 每个场景至少包含一个 beat。
- `dialogue` 类型 beat 应包含 `speaker`。
- `action` 类型 beat 不要求 `speaker`。
- 所有 ID 在同一层级内应保持唯一。
