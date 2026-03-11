import type { Segment } from "@vtt/types";

export function parseVtt(input: string): Segment[] {
  return input
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block && !block.startsWith("WEBVTT"))
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim());
      const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
      if (timeLineIndex === -1) {
        return null;
      }

      const [start, end] = lines[timeLineIndex].split("-->").map((value) => value.trim());
      const text = lines.slice(timeLineIndex + 1).join("\n");
      return {
        start: parseTimestamp(start),
        end: parseTimestamp(end),
        text
      };
    })
    .filter((value): value is Segment => Boolean(value));
}

function parseTimestamp(value: string) {
  const normalized = value.replace(",", ".");
  const [hours, minutes, seconds] = normalized.split(":");
  const secondValue = Number(seconds);
  return Number(hours) * 3600 + Number(minutes) * 60 + secondValue;
}
