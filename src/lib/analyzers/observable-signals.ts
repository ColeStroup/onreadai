export function extractOperatingHoursSignals(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return [];

  const patterns = [
    /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|daily|every day|seven days a week|7 days a week)?\s*[:,-]?\s*(?:open\s+)?(?:from\s+)?(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)\s*(?:-|\u2013|\u2014|to|until|till|through)\s*(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi,
    /\bopen(?:ed)?\s+(?:daily|every day|seven days a week|7 days a week)?[^.]{0,90}\b(?:lunch|dinner|late night|open late|after midnight|wee(?:,?\s+wee)? hours of the night)\b/gi,
    /\b(?:late night|open late|after midnight|wee(?:,?\s+wee)? hours of the night)\b/gi,
  ];
  const matches = patterns.flatMap((pattern) => text.match(pattern) ?? []);

  return [...new Set(matches.map(cleanSignal).filter(Boolean))].slice(0, 12);
}

export function describesLateHours(value: string) {
  return /\b(late[- ]night|open late|after midnight|wee(?:,?\s+wee)? hours of the night)\b/i.test(
    value,
  );
}

export function latestClosingHour(value: string) {
  const matches = [
    ...value.matchAll(
      /(?:-|\u2013|\u2014|to|until|till|through)\s*(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)/gi,
    ),
  ];
  const hours = matches.map((match) => {
    let hour = Number(match[1]);
    const minute = Number(match[2] ?? 0);
    const period = match[3].toLowerCase().replaceAll(".", "");
    if (period === "pm" && hour !== 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
    return hour + minute / 60;
  });

  return hours.length > 0 ? Math.max(...hours) : null;
}

function cleanSignal(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[,;:\s-]+|[,;:\s-]+$/g, "")
    .trim();
}
