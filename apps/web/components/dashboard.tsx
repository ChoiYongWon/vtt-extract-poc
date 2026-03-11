"use client";

import { useEffect, useRef, useState } from "react";
import type { Segment, VideoItem } from "@vtt/types";
import { formatBytes, formatDate, formatDuration } from "../lib/format";

type Props = {
  videos: VideoItem[];
  segments: Segment[];
  mode: "real" | "mock";
  missingRuntimeEnv: string[];
};

export function Dashboard({ videos, segments, mode, missingRuntimeEnv }: Props) {
  const [videoItems, setVideoItems] = useState(videos);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [selectedVideoKey, setSelectedVideoKey] = useState(videos[0]?.s3Key ?? "");
  const [segmentsByKey, setSegmentsByKey] = useState<Record<string, Segment[]>>(
    videos[0]?.s3Key ? { [videos[0].s3Key]: segments } : {}
  );
  const [editorSegments, setEditorSegments] = useState(segments);
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackUrlRef = useRef<string | null>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);

  const selectedVideo =
    videoItems.find((video) => video.s3Key === selectedVideoKey) ?? videoItems[0] ?? null;

  const activeSegmentIndex = editorSegments.findIndex(
    (segment) => currentTime >= segment.start && currentTime <= segment.end
  );

  useEffect(() => {
    if (!selectedVideo) {
      return;
    }

    setEditorSegments(segmentsByKey[selectedVideo.s3Key] ?? segments);
  }, [selectedVideo, segmentsByKey, segments]);

  useEffect(() => {
    if (activeSegmentRef.current) {
      activeSegmentRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeSegmentIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const updateTime = () => setCurrentTime(video.currentTime);
    video.addEventListener("timeupdate", updateTime);
    return () => video.removeEventListener("timeupdate", updateTime);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    Array.from(video.querySelectorAll("track")).forEach((track) => video.removeChild(track));
    Array.from(video.textTracks).forEach((track) => {
      track.mode = "disabled";
    });

    if (trackUrlRef.current) {
      URL.revokeObjectURL(trackUrlRef.current);
      trackUrlRef.current = null;
    }

    if (!editorSegments.length) {
      return;
    }

    const blob = new Blob([toVtt(editorSegments)], { type: "text/vtt" });
    const url = URL.createObjectURL(blob);
    trackUrlRef.current = url;

    const track = document.createElement("track");
    track.kind = "subtitles";
    track.srclang = "ko";
    track.label = "자막";
    track.src = url;
    track.default = true;
    video.appendChild(track);

    const enableTrack = () => {
      Array.from(video.textTracks).forEach((textTrack) => {
        textTrack.mode = "disabled";
      });
      if (video.textTracks.length > 0) {
        video.textTracks[video.textTracks.length - 1].mode = "showing";
      }
    };

    video.addEventListener("loadedmetadata", enableTrack, { once: true });
    enableTrack();

    return () => {
      video.removeEventListener("loadedmetadata", enableTrack);
      if (trackUrlRef.current) {
        URL.revokeObjectURL(trackUrlRef.current);
        trackUrlRef.current = null;
      }
    };
  }, [editorSegments]);

  async function refreshVideos() {
    const response = await fetch("/api/videos", { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { items: VideoItem[] };
    setVideoItems(data.items);
  }

  async function startSelectedJobs() {
    await Promise.all(selectedKeys.map((s3Key) => startJob(s3Key)));
  }

  async function startJob(s3Key: string) {
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ s3Key })
    });

    if (!response.ok) {
      setSaveMessage("작업 생성에 실패했습니다.");
      return;
    }

    await refreshVideos();
    setSaveMessage("ECS task를 시작했습니다. 완료 후 목록을 새로고침하세요.");
  }

  async function saveCurrentSubtitle() {
    if (!selectedVideo?.subtitleId || !selectedVideo.vttS3Url) {
      setSaveMessage("매핑 id 또는 VTT 경로가 아직 없습니다.");
      return;
    }

    setSaving(true);
    setSaveMessage("");

    const response = await fetch(`/api/subtitles/${selectedVideo.subtitleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        s3Key: selectedVideo.s3Key,
        vttS3Url: selectedVideo.vttS3Url,
        segments: editorSegments
      })
    });

    setSaving(false);

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string };
      setSaveMessage(error.message ?? "저장 실패");
      return;
    }

    setSegmentsByKey((current) =>
      selectedVideo ? { ...current, [selectedVideo.s3Key]: editorSegments } : current
    );
    setSaveMessage("저장 완료");
    await refreshVideos();
  }

  function updateSegmentText(index: number, text: string) {
    setEditorSegments((current) =>
      current.map((segment, currentIndex) =>
        currentIndex === index ? { ...segment, text } : segment
      )
    );
  }

  function updateSegmentTime(index: number, field: "start" | "end", value: string) {
    const parsed = parseTimeInput(value);
    if (parsed === null) {
      return;
    }

    setEditorSegments((current) =>
      current.map((segment, currentIndex) =>
        currentIndex === index ? { ...segment, [field]: parsed } : segment
      )
    );
  }

  function downloadCurrentVtt() {
    const blob = new Blob([toVtt(editorSegments)], { type: "text/vtt;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedVideo?.title.replace(/\.[^.]+$/, "") ?? "subtitles"}.vtt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedKeys(checked ? videoItems.map((video) => video.s3Key) : []);
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div className="brand">
          <div className="brand-mark">✦</div>
          <div>
            <div className="brand-eyebrow">Subtitle Console</div>
            <h1>영상 자막 추출기</h1>
          </div>
        </div>
        <div className="header-meta">
          <span className={`mode-pill ${mode}`}>{mode === "real" ? "Real Mode" : "Mock Mode"}</span>
          <span className="header-note">S3 direct · ECS Fargate · subtitle editor</span>
        </div>
      </header>

      {mode === "mock" ? (
        <section className="banner warning">
          <strong>현재 mock fallback으로 동작 중입니다.</strong>
          <p>웹 앱 프로세스에서 아래 환경변수가 보이지 않습니다: {missingRuntimeEnv.join(", ")}</p>
        </section>
      ) : (
        <section className="banner subtle">
          <strong>현재 실데이터 모드입니다.</strong>
          <p>S3 목록과 ECS task를 사용합니다. 완료 여부는 목록 새로고침으로 반영됩니다.</p>
        </section>
      )}

      <section className="split-layout" style={{ marginTop: 18 }}>
        <section className="table-panel">
          <div className="panel-header">
            <div>
              <div className="panel-eyebrow">Source Videos</div>
              <h2>영상 목록</h2>
            </div>
            <div className="row-actions">
              <button className="ghost-button" onClick={() => void refreshVideos()} type="button">
                새로고침
              </button>
              <button
                className="primary-button"
                disabled={selectedKeys.length === 0}
                onClick={startSelectedJobs}
                type="button"
              >
                선택된 {selectedKeys.length}개 자막 추출
              </button>
            </div>
          </div>

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <input
                      checked={videoItems.length > 0 && selectedKeys.length === videoItems.length}
                      onChange={(event) => toggleSelectAll(event.target.checked)}
                      type="checkbox"
                    />
                  </th>
                  <th>제목</th>
                  <th>용량</th>
                  <th>업로드일</th>
                  <th>재생시간</th>
                </tr>
              </thead>
              <tbody>
                {videoItems.map((video) => {
                  const active = selectedVideoKey === video.s3Key;
                  const checked = selectedKeys.includes(video.s3Key);

                  return (
                    <tr className={active ? "active" : ""} key={video.s3Key} onClick={() => setSelectedVideoKey(video.s3Key)}>
                      <td>
                        <input
                          checked={checked}
                          onChange={() =>
                            setSelectedKeys((current) =>
                              checked ? current.filter((item) => item !== video.s3Key) : [...current, video.s3Key]
                            )
                          }
                          onClick={(event) => event.stopPropagation()}
                          type="checkbox"
                        />
                      </td>
                      <td>
                        <div className="cell-title">{video.title}</div>
                        <div className="cell-sub">{video.s3Key}</div>
                      </td>
                      <td>{formatBytes(video.size)}</td>
                      <td>{formatDate(video.uploadedAt)}</td>
                      <td>{formatDuration(video.duration)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="viewer-panel">
          <div className="viewer-card">
            <div className="video-frame">
              {selectedVideo?.presignedUrl ? (
                <video className="video-element" controls playsInline ref={videoRef} src={selectedVideo.presignedUrl} />
              ) : (
                <div className="video-empty">재생할 영상을 선택하세요</div>
              )}
            </div>
          </div>

          <div className="editor-card">
            <div className="panel-header compact">
              <div>
                <div className="panel-eyebrow">Subtitle Preview</div>
                <h2>자막 미리보기</h2>
                <div className="panel-path">{selectedVideo?.vttS3Url ?? "추출 후 VTT 경로가 표시됩니다."}</div>
              </div>
              <div className="editor-actions">
                <button className="primary-button" disabled={saving} onClick={() => void saveCurrentSubtitle()} type="button">
                  {saving ? "저장 중..." : "저장"}
                </button>
                <button className="ghost-button" onClick={downloadCurrentVtt} type="button">
                  VTT 다운로드
                </button>
              </div>
            </div>

            {saveMessage ? <div className="save-message">{saveMessage}</div> : null}

            <div className="segment-list">
              {editorSegments.length === 0 ? (
                <div className="empty-state">자막이 없습니다. 추출이 끝난 뒤 다시 선택해보세요.</div>
              ) : (
                editorSegments.map((segment, index) => (
                  <div
                    className={`segment-row ${index === activeSegmentIndex ? "active" : ""}`}
                    key={`${segment.start}-${segment.end}-${index}`}
                    ref={index === activeSegmentIndex ? activeSegmentRef : null}
                  >
                    <div className="segment-times">
                      <input
                        className="time-input"
                        defaultValue={formatEditorTime(segment.start)}
                        onBlur={(event) => updateSegmentTime(index, "start", event.target.value)}
                        type="text"
                      />
                      <span>→</span>
                      <input
                        className="time-input"
                        defaultValue={formatEditorTime(segment.end)}
                        onBlur={(event) => updateSegmentTime(index, "end", event.target.value)}
                        type="text"
                      />
                    </div>
                    <textarea
                      className="segment-text"
                      defaultValue={segment.text}
                      onBlur={(event) => updateSegmentText(index, event.target.value)}
                      rows={2}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function parseTimeInput(value: string) {
  const parts = value.split(":").map((part) => part.trim());
  if (parts.some((part) => part === "" || Number.isNaN(Number(part)))) {
    return null;
  }

  if (parts.length === 2) {
    return Number(parts[0]) * 60 + Number(parts[1]);
  }

  if (parts.length === 3) {
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  }

  return null;
}

function formatEditorTime(value: number) {
  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function toVtt(segments: Segment[]) {
  return `WEBVTT\n\n${segments
    .map((segment, index) => {
      const start = toTimestamp(segment.start);
      const end = toTimestamp(segment.end);
      return `${index + 1}\n${start} --> ${end}\n${segment.text}\n`;
    })
    .join("\n")}\n`;
}

function toTimestamp(value: number) {
  const totalMilliseconds = Math.max(0, Math.floor(value * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}
