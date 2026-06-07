const UNKNOWN = "待确认";

export function buildChapterSummaries(project) {
  const chapters = Array.isArray(project?.chapters) ? project.chapters : [];
  const raw = chapters.map((chapter, index) => {
    const scenes = Array.isArray(chapter?.scenes) ? chapter.scenes : [];
    const chapterCharacters = new Set(
      Array.isArray(chapter?.characters) ? chapter.characters.filter(Boolean) : []
    );
    let beatCount = 0;

    const sceneDetails = scenes.map((scene, sceneIndex) => {
      const beats = Array.isArray(scene?.beats) ? scene.beats : [];
      const characters = Array.isArray(scene?.characters)
        ? scene.characters.filter(Boolean)
        : [];

      beatCount += beats.length;
      characters.forEach((name) => chapterCharacters.add(name));

      return {
        title: cleanText(scene?.title) || `第 ${sceneIndex + 1} 场`,
        location: cleanText(scene?.location) || UNKNOWN,
        emotionalTone: cleanText(scene?.emotional_tone) || UNKNOWN,
        characters,
        beatCount: beats.length
      };
    });

    return {
      id: cleanText(chapter?.id) || `ch${String(index + 1).padStart(3, "0")}`,
      number: index + 1,
      title: cleanText(chapter?.title) || `第 ${index + 1} 章`,
      summary: cleanText(chapter?.summary) || "本章暂无摘要。",
      sceneCount: scenes.length,
      characterCount: chapterCharacters.size,
      beatCount,
      intensity: 0,
      scenes: sceneDetails
    };
  });
  const maxBeatCount = Math.max(1, ...raw.map((chapter) => chapter.beatCount));

  return raw.map((chapter) => ({
    ...chapter,
    intensity: Math.round((chapter.beatCount / maxBeatCount) * 100)
  }));
}

export function getVisibleChapterSummaries(summaries, expanded, limit = 6) {
  const entries = Array.isArray(summaries) ? summaries : [];
  return expanded ? entries : entries.slice(0, Math.max(1, limit));
}

function cleanText(value) {
  return String(value ?? "").trim();
}
