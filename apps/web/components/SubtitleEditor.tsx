"use client";

import { useEffect, useRef, useState } from "react";
import type { Segment } from "@vtt/types";

interface SubtitleEditorProps {
  segments: Segment[];
  videoRef: React.RefObject<HTMLVideoElement>;
  onSegmentsChange: (segments: Segment[]) => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function parseTime(str: string): number | null {
  const parts = str.trim().split(":").map(Number);
  if (parts.some((p) => isNaN(p) || p < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

type EditingField = "text" | "start" | "end";

export function SubtitleEditor({
  segments,
  videoRef,
  onSegmentsChange,
}: SubtitleEditorProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<EditingField>("text");
  const [editValue, setEditValue] = useState("");
  const activeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const editingIdxRef = useRef<number | null>(null);
  const editingFieldRef = useRef<EditingField>("text");
  const editValueRef = useRef("");

  const activeIdx = segments.findIndex(
    (seg) => currentTime >= seg.start && currentTime <= seg.end
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handler = () => setCurrentTime(video.currentTime);
    video.addEventListener("timeupdate", handler);
    return () => video.removeEventListener("timeupdate", handler);
  }, [videoRef]);

  useEffect(() => {
    editValueRef.current = editValue;
  }, [editValue]);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeIdx]);

  useEffect(() => {
    if (editingIdx === null) return;
    if (editingField === "text" && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = inputRef.current.scrollHeight + "px";
    } else if ((editingField === "start" || editingField === "end") && timeInputRef.current) {
      timeInputRef.current.focus();
      timeInputRef.current.select();
    }
  }, [editingIdx, editingField]);

  function startEdit(idx: number, field: EditingField) {
    editingIdxRef.current = idx;
    editingFieldRef.current = field;
    setEditingIdx(idx);
    setEditingField(field);
    const value =
      field === "text"
        ? segments[idx].text
        : field === "start"
          ? formatTime(segments[idx].start)
          : formatTime(segments[idx].end);
    setEditValue(value);
    editValueRef.current = value;
    videoRef.current?.pause();
  }

  function commitEdit() {
    const idx = editingIdxRef.current;
    const field = editingFieldRef.current;
    if (idx === null) return;
    editingIdxRef.current = null;

    if (field === "text") {
      const updated = segments.map((seg, i) =>
        i === idx ? { ...seg, text: editValueRef.current } : seg
      );
      onSegmentsChange(updated);
    } else {
      const parsed = parseTime(editValueRef.current);
      if (parsed !== null) {
        const updated = segments.map((seg, i) =>
          i === idx ? { ...seg, [field]: parsed } : seg
        );
        onSegmentsChange(updated);
      }
    }

    setEditingIdx(null);
    videoRef.current?.play().catch(() => {});
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    }
    if (e.key === "Escape") {
      editingIdxRef.current = null;
      setEditingIdx(null);
      videoRef.current?.play().catch(() => {});
    }
  }

  if (segments.length === 0) {
    return (
      <div className="segment-empty">자막이 없습니다. 추출이 끝난 뒤 다시 선택해보세요.</div>
    );
  }

  return (
    <div className="segment-list">
      {segments.map((seg, idx) => {
        const isActive = idx === activeIdx;
        const isEditingText = idx === editingIdx && editingField === "text";
        const isEditingStart = idx === editingIdx && editingField === "start";
        const isEditingEnd = idx === editingIdx && editingField === "end";

        return (
          <div
            key={idx}
            ref={isActive ? activeRef : null}
            className={`segment-item${isActive ? " active" : ""}`}
          >
            {/* Time column */}
            <div className="segment-time-col">
              {isEditingStart ? (
                <input
                  ref={timeInputRef}
                  className="time-edit-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleKeyDown}
                />
              ) : (
                <span
                  className="time-span"
                  onClick={() => !isEditingText && !isEditingEnd && startEdit(idx, "start")}
                >
                  {formatTime(seg.start)}
                </span>
              )}
              <span className="time-arrow">→</span>
              {isEditingEnd ? (
                <input
                  ref={timeInputRef}
                  className="time-edit-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleKeyDown}
                />
              ) : (
                <span
                  className="time-span"
                  onClick={() => !isEditingText && !isEditingStart && startEdit(idx, "end")}
                >
                  {formatTime(seg.end)}
                </span>
              )}
            </div>

            {/* Text column */}
            {isEditingText ? (
              <textarea
                ref={inputRef}
                className="text-edit-input"
                value={editValue}
                rows={1}
                onChange={(e) => {
                  setEditValue(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                }}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    commitEdit();
                  }
                  if (e.key === "Escape") {
                    editingIdxRef.current = null;
                    setEditingIdx(null);
                    videoRef.current?.play().catch(() => {});
                  }
                }}
              />
            ) : (
              <span
                className="text-span"
                onClick={() => !isEditingStart && !isEditingEnd && startEdit(idx, "text")}
              >
                {seg.text}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
