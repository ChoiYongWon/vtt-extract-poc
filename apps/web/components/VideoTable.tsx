"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { VideoFolderData, VideoItem } from "@vtt/types";
import { formatBytes, formatDate, formatDuration } from "../lib/format";

function IconLink() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function StatusBadge({ video }: { video: VideoItem }) {
  if (video.vttS3Url) {
    return (
      <span className="status-badge done">
        <IconCheck />
        완료
      </span>
    );
  }
  if (video.jobStatus === "processing") {
    return <span className="status-badge processing">추출 중</span>;
  }
  if (video.jobStatus === "error") {
    return <span className="status-badge error">오류</span>;
  }
  return <span className="status-badge pending">미추출</span>;
}

type FolderRow = {
  type: "folder";
  prefix: string;
  name: string;
  depth: number;
  isExpanded: boolean;
  isLoading: boolean;
};

type FileRow = {
  type: "file";
  id: string;
  name: string;
  depth: number;
  video: VideoItem;
};

type FlatRow = FolderRow | FileRow;

function flattenFolderData(
  data: VideoFolderData,
  depth: number,
  expanded: Set<string>,
  folderDataByPrefix: Map<string, VideoFolderData & { loading?: boolean }>,
): FlatRow[] {
  const rows: FlatRow[] = [];

  for (const folder of data.folders) {
    const isExpanded = expanded.has(folder.prefix);
    const childData = folderDataByPrefix.get(folder.prefix);
    const isLoading = childData?.loading ?? false;

    rows.push({
      type: "folder",
      prefix: folder.prefix,
      name: folder.name,
      depth,
      isExpanded,
      isLoading,
    });

    if (isExpanded) {
      if (childData && !childData.loading) {
        rows.push(
          ...flattenFolderData(
            childData,
            depth + 1,
            expanded,
            folderDataByPrefix,
          ),
        );
      }
    }
  }

  for (const video of data.items) {
    const name = video.s3Key.split("/").at(-1) ?? video.s3Key;
    rows.push({ type: "file", id: video.s3Key, name, depth, video });
  }

  return rows;
}

function collectAllVideos(
  data: VideoFolderData,
  folderDataByPrefix: Map<string, VideoFolderData & { loading?: boolean }>,
): VideoItem[] {
  const result: VideoItem[] = [...data.items];
  for (const folder of data.folders) {
    const child = folderDataByPrefix.get(folder.prefix);
    if (child && !child.loading) {
      result.push(...collectAllVideos(child, folderDataByPrefix));
    }
  }
  return result;
}

interface VideoTableProps {
  rootData: VideoFolderData;
  folderDataByPrefix: Map<string, VideoFolderData & { loading?: boolean }>;
  expandedFolders: Set<string>;
  onToggleFolder: (prefix: string) => void;
  selectedKeys: string[];
  selectedVideoKey: string;
  onSelectKey: (key: string) => void;
  onToggleCheck: (key: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onRefresh: () => void;
  onStartJobs: () => void;
  isStartingJobs: boolean;
}

export function VideoTable({
  rootData,
  folderDataByPrefix,
  expandedFolders,
  onToggleFolder,
  selectedKeys,
  selectedVideoKey,
  onSelectKey,
  onToggleCheck,
  onToggleAll,
  onRefresh,
  onStartJobs,
  isStartingJobs,
}: VideoTableProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const flatRows = useMemo(
    () => flattenFolderData(rootData, 0, expandedFolders, folderDataByPrefix),
    [rootData, expandedFolders, folderDataByPrefix],
  );

  const allLoadedVideos = useMemo(
    () => collectAllVideos(rootData, folderDataByPrefix),
    [rootData, folderDataByPrefix],
  );

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    overscan: 8,
  });

  function toggleFolder(prefix: string) {
    onToggleFolder(prefix);
  }

  function copyLink(e: React.MouseEvent, video: VideoItem) {
    e.stopPropagation();
    const link = video.presignedUrl ?? video.vttS3Url ?? video.s3Key;
    void navigator.clipboard.writeText(link).then(() => {
      setCopiedKey(video.s3Key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  }

  const INDENT = 16;

  return (
    <section className="table-panel">
      <div className="panel-header">
        <div>
          <h2>영상 목록</h2>
        </div>
        <div className="row-actions">
          <button className="ghost-button" onClick={onRefresh} type="button">
            새로고침
          </button>
          <button
            className="primary-button"
            disabled={selectedKeys.length === 0 || isStartingJobs}
            onClick={onStartJobs}
            type="button"
          >
            {isStartingJobs ? "추출 요청 중..." : `선택된 ${selectedKeys.length}개 자막 추출`}
          </button>
        </div>
      </div>

      <div className="tree-header">
        <div className="tree-col-check">
          <input
            checked={
              allLoadedVideos.length > 0 &&
              selectedKeys.length === allLoadedVideos.length
            }
            onChange={(e) => onToggleAll(e.target.checked)}
            type="checkbox"
          />
        </div>
        <div className="tree-col-name">제목</div>
        <div className="tree-col-size">용량</div>
        <div className="tree-col-date">업로드일</div>
        <div className="tree-col-dur">재생시간</div>
        <div className="tree-col-status">상태</div>
        <div className="tree-col-link" />
      </div>

      <div className="tree-scroll" ref={scrollRef}>
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((vRow) => {
            const row = flatRows[vRow.index];
            const rowStyle: React.CSSProperties = {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: vRow.size,
              transform: `translateY(${vRow.start}px)`,
            };

            if (row.type === "folder") {
              return (
                <div
                  key={vRow.key}
                  className="tree-row folder-row"
                  style={rowStyle}
                  onClick={() => toggleFolder(row.prefix)}
                >
                  <div className="tree-col-check" />
                  <div
                    className="tree-col-name folder-name"
                    style={{ paddingLeft: row.depth * INDENT }}
                  >
                    <span className="folder-arrow">
                      {row.isLoading ? "⋯" : row.isExpanded ? "▾" : "▸"}
                    </span>
                    {row.name}/
                  </div>
                  <div className="tree-col-size" />
                  <div className="tree-col-date" />
                  <div className="tree-col-dur" />
                  <div className="tree-col-status" />
                  <div className="tree-col-link" />
                </div>
              );
            }

            const { video } = row;
            const active = selectedVideoKey === video.s3Key;
            const checked = selectedKeys.includes(video.s3Key);
            const copied = copiedKey === video.s3Key;

            return (
              <div
                key={vRow.key}
                className={`tree-row file-row${active ? " active" : ""}`}
                style={rowStyle}
                onClick={() => onSelectKey(video.s3Key)}
              >
                <div
                  className="tree-col-check"
                  style={{ paddingLeft: row.depth * INDENT }}
                >
                  <input
                    checked={checked}
                    onChange={() => onToggleCheck(video.s3Key, checked)}
                    onClick={(e) => e.stopPropagation()}
                    type="checkbox"
                  />
                </div>
                <div className="tree-col-name" style={{ paddingLeft: INDENT }}>
                  <div className="cell-title">{row.name}</div>
                </div>
                <div className="tree-col-size">{formatBytes(video.size)}</div>
                <div className="tree-col-date">
                  {formatDate(video.uploadedAt)}
                </div>
                <div className="tree-col-dur">
                  {formatDuration(video.duration)}
                </div>
                <div className="tree-col-status">
                  <StatusBadge video={video} />
                </div>
                <div className="tree-col-link">
                  <button
                    className={`link-copy-btn${copied ? " copied" : ""}`}
                    onClick={(e) => copyLink(e, video)}
                    title="링크 복사"
                    type="button"
                  >
                    {copied ? <IconCheck /> : <IconLink />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
