const BASE_XP = 100;
const LEVEL_STEP_XP = 50;

export function xpRequiredForLevel(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const completedLevels = safeLevel - 1;
  return BASE_XP * completedLevels + (LEVEL_STEP_XP * completedLevels * (completedLevels + 1)) / 2;
}

export function getLevelProgress(totalXp) {
  const xp = Math.max(0, Math.floor(Number(totalXp) || 0));
  let level = 1;

  while (xp >= xpRequiredForLevel(level + 1)) level += 1;

  const currentLevelXp = xpRequiredForLevel(level);
  const nextLevelXp = xpRequiredForLevel(level + 1);
  const progressXp = xp - currentLevelXp;
  const requiredXp = nextLevelXp - currentLevelXp;
  const progressPercent = Math.min(100, Math.floor((progressXp / requiredXp) * 100));

  return {
    level,
    currentLevelXp,
    nextLevelXp,
    progressXp,
    requiredXp,
    progressPercent,
    xpToNextLevel: Math.max(0, nextLevelXp - xp),
  };
}
