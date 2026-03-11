import type { Segment } from "@vtt/types";

function toTimestamp(value: number) {
  const totalMilliseconds = Math.max(0, Math.floor(value * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

export function toVtt(segments: Segment[]) {
  const lines = ["WEBVTT", ""];

  segments.forEach((segment, index) => {
    lines.push(String(index + 1));
    lines.push(`${toTimestamp(segment.start)} --> ${toTimestamp(segment.end)}`);
    lines.push(segment.text.trim());
    lines.push("");
  });

  return `${lines.join("\n")}\n`;
}

