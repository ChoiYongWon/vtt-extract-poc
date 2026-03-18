"use client";

import { useEffect, useRef, useState } from "react";
import { Toast } from "./Toast";
import type { Segment, VideoFolderData, VideoItem } from "@vtt/types";
import { VideoTable } from "./VideoTable";
import { VideoPlayer } from "./VideoPlayer";
import { SubtitleEditor } from "./SubtitleEditor";

type Props = {
  rootData: VideoFolderData;
  mode: "real" | "mock";
  missingRuntimeEnv: string[];
};

export function Dashboard({
  rootData: initialRootData,
  mode,
  missingRuntimeEnv,
}: Props) {
  const [rootData, setRootData] = useState(initialRootData);
  const [folderDataByPrefix, setFolderDataByPrefix] = useState<
    Map<string, VideoFolderData & { loading?: boolean }>
  >(() => new Map());
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set());
  const [playerSrc, setPlayerSrc] = useState<string | null>(
    initialRootData.items[0]?.presignedUrl ?? null,
  );
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [selectedVideoKey, setSelectedVideoKey] = useState(
    initialRootData.items[0]?.s3Key ?? "",
  );
  const [segmentsByKey, setSegmentsByKey] = useState<Record<string, Segment[]>>(
    {},
  );
  const [editorSegments, setEditorSegments] = useState<Segment[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [startingJobs, setStartingJobs] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const openFoldersRef = useRef(openFolders);
  const folderDataByPrefixRef = useRef(folderDataByPrefix);
  useEffect(() => { openFoldersRef.current = openFolders; }, [openFolders]);
  useEffect(() => { folderDataByPrefixRef.current = folderDataByPrefix; }, [folderDataByPrefix]);

  useEffect(() => {
    const id = setInterval(() => void refreshVideos(), 10_000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(message: string) {
    setToast(message);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4500);
  }

  function findVideoInFolderData(key: string): VideoItem | undefined {
    const search = (data: VideoFolderData): VideoItem | undefined => {
      const found = data.items.find((v) => v.s3Key === key);
      if (found) return found;
      for (const folder of data.folders) {
        const child = folderDataByPrefix.get(folder.prefix);
        if (child) {
          const nested = search(child);
          if (nested) return nested;
        }
      }
      return undefined;
    };
    return search(rootData);
  }

  const selectedVideo =
    findVideoInFolderData(selectedVideoKey) ?? rootData.items[0] ?? null;

  useEffect(() => {
    const key = selectedVideo?.s3Key;
    const vttUrl = selectedVideo?.vttS3Url;
    if (!key || !vttUrl) {
      setEditorSegments([]);
      return;
    }

    if (segmentsByKey[key]) {
      setEditorSegments(segmentsByKey[key]);
      return;
    }

    setSegmentsLoading(true);
    fetch(`/api/subtitles/vtt?url=${encodeURIComponent(vttUrl)}`)
      .then(async (res) => {
        const data = (await res.json()) as {
          segments?: Segment[];
          message?: string;
        };
        if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
        if (Array.isArray(data.segments)) {
          setSegmentsByKey((current) => ({
            ...current,
            [key]: data.segments!,
          }));
          setEditorSegments(data.segments!);
        }
      })
      .catch((err: unknown) => {
        setSaveMessage(
          `자막 로드 실패: ${err instanceof Error ? err.message : String(err)}`,
        );
      })
      .finally(() => setSegmentsLoading(false));
  }, [selectedVideo?.s3Key, selectedVideo?.vttS3Url]); // eslint-disable-line react-hooks/exhaustive-deps


  async function refreshVideos() {
    const response = await fetch("/api/videos", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as VideoFolderData;
    setRootData(data);

    // Only refresh open folders (use refs to avoid stale closure in setInterval)
    const prefixesToRefresh = Array.from(openFoldersRef.current).filter(
      (prefix) => !folderDataByPrefixRef.current.get(prefix)?.loading,
    );
    await Promise.all(prefixesToRefresh.map((prefix) => loadFolder(prefix, true)));
  }

  function toggleFolder(prefix: string) {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) {
        next.delete(prefix);
      } else {
        next.add(prefix);
      }
      return next;
    });
    void loadFolder(prefix);
  }

  function handleSelectKey(key: string) {
    setSelectedVideoKey(key);
    const video = findVideoInFolderData(key);
    if (video?.presignedUrl) setPlayerSrc(video.presignedUrl);
  }

  async function loadFolder(prefix: string, forceReload = false) {
    if (!forceReload && folderDataByPrefix.has(prefix)) return;

    // Only show loading spinner on first load — background refreshes update silently
    if (!forceReload) {
      setFolderDataByPrefix((prev) => {
        const next = new Map(prev);
        next.set(prefix, { items: [], folders: [], loading: true });
        return next;
      });
    }

    try {
      const response = await fetch(
        `/api/videos?prefix=${encodeURIComponent(prefix)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as VideoFolderData;
      setFolderDataByPrefix((prev) => {
        const next = new Map(prev);
        next.set(prefix, { ...data, loading: false });
        return next;
      });
    } catch {
      if (!forceReload) {
        setFolderDataByPrefix((prev) => {
          const next = new Map(prev);
          next.set(prefix, { items: [], folders: [], loading: false });
          return next;
        });
      }
    }
  }

  async function startSelectedJobs() {
    setStartingJobs(true);
    try {
      const results = await Promise.allSettled(
        selectedKeys.map((s3Key) => startJob(s3Key)),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed === 0) {
        showToast("추출 요청이 완료되었습니다. 평균 2~3분 소요됩니다.");
        setSelectedKeys([]);
      } else {
        setSaveMessage(`${failed}개 작업 생성에 실패했습니다.`);
      }
      await refreshVideos();
    } finally {
      setStartingJobs(false);
    }
  }

  async function startJob(s3Key: string) {
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ s3Key }),
    });
    if (!response.ok) throw new Error("작업 생성 실패");
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
        segments: editorSegments,
      }),
    });

    setSaving(false);

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      setSaveMessage(error.message ?? "저장 실패");
      return;
    }

    setSegmentsByKey((current) =>
      selectedVideo
        ? { ...current, [selectedVideo.s3Key]: editorSegments }
        : current,
    );
    setSaveMessage("저장 완료");
    await refreshVideos();
  }

  function downloadCurrentVtt() {
    const toTimestamp = (value: number) => {
      const totalMilliseconds = Math.max(0, Math.floor(value * 1000));
      const hours = Math.floor(totalMilliseconds / 3_600_000);
      const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
      const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
      const milliseconds = totalMilliseconds % 1000;
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
    };

    const vtt = `WEBVTT\n\n${editorSegments
      .map((segment, index) => {
        return `${index + 1}\n${toTimestamp(segment.start)} --> ${toTimestamp(segment.end)}\n${segment.text}\n`;
      })
      .join("\n")}\n`;

    const blob = new Blob([vtt], { type: "text/vtt;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedVideo?.title.replace(/\.[^.]+$/, "") ?? "subtitles"}.vtt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="workspace-shell">
      <Toast message={toast} onDismiss={() => setToast(null)} />

      <header className="workspace-header">
        <div className="brand">
          <div className="brand-mark">✦</div>
          <div>
            <h1>영상 자막 추출기</h1>
          </div>
        </div>
        <div className="header-meta"></div>
      </header>

      {mode === "mock" && (
        <section className="banner warning">
          <strong>현재 mock fallback으로 동작 중입니다.</strong>
          <p>
            웹 앱 프로세스에서 아래 환경변수가 보이지 않습니다:{" "}
            {missingRuntimeEnv.join(", ")}
          </p>
        </section>
      )}

      <section className="split-layout" style={{ marginTop: 18 }}>
        <VideoTable
          rootData={rootData}
          folderDataByPrefix={folderDataByPrefix}
          expandedFolders={openFolders}
          onToggleFolder={toggleFolder}
          selectedKeys={selectedKeys}
          selectedVideoKey={selectedVideoKey}
          onSelectKey={handleSelectKey}
          onToggleCheck={(key, checked) =>
            setSelectedKeys((current) =>
              checked
                ? current.filter((item) => item !== key)
                : [...current, key],
            )
          }
          onToggleAll={(checked) => {
            if (checked) {
              const allKeys: string[] = [];
              const collect = (data: VideoFolderData) => {
                allKeys.push(...data.items.map((v) => v.s3Key));
                for (const folder of data.folders) {
                  const child = folderDataByPrefix.get(folder.prefix);
                  if (child && !child.loading) collect(child);
                }
              };
              collect(rootData);
              setSelectedKeys(allKeys);
            } else {
              setSelectedKeys([]);
            }
          }}
          onRefresh={() => void refreshVideos()}
          onStartJobs={() => void startSelectedJobs()}
          isStartingJobs={startingJobs}
        />

        <section className="viewer-panel">
          <div className="viewer-card">
            <VideoPlayer
              src={playerSrc}
              segments={editorSegments}
              videoRef={videoRef}
              onDownload={downloadCurrentVtt}
            />
          </div>

          <div className="editor-card">
            <div className="panel-header compact">
              <div>
                <h2>자막 미리보기</h2>
                <div className="panel-path">
                  {selectedVideo?.vttS3Url ?? "추출 후 VTT 경로가 표시됩니다."}
                </div>
              </div>
              <div className="editor-actions">
                <button
                  className="primary-button"
                  disabled={saving}
                  onClick={() => void saveCurrentSubtitle()}
                  type="button"
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>

            {saveMessage ? (
              <div className="save-message">{saveMessage}</div>
            ) : null}
            {segmentsLoading ? (
              <div className="save-message">자막 불러오는 중...</div>
            ) : null}

            <SubtitleEditor
              segments={editorSegments}
              videoRef={videoRef}
              onSegmentsChange={setEditorSegments}
            />
          </div>
        </section>
      </section>
    </main>
  );
}
