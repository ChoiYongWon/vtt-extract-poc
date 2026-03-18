"use client";

import { memo, useEffect, useRef } from "react";
import type { Segment } from "@vtt/types";

interface VideoPlayerProps {
  src: string | null;
  segments: Segment[];
  videoRef: React.RefObject<HTMLVideoElement>;
  onDownload: () => void;
}

function toVtt(segments: Segment[]) {
  const toTimestamp = (value: number) => {
    const totalMilliseconds = Math.max(0, Math.floor(value * 1000));
    const hours = Math.floor(totalMilliseconds / 3_600_000);
    const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
    const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
    const milliseconds = totalMilliseconds % 1000;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
  };

  return `WEBVTT\n\n${segments
    .map((segment, index) => {
      const start = toTimestamp(segment.start);
      const end = toTimestamp(segment.end);
      return `${index + 1}\n${start} --> ${end}\n${segment.text}\n`;
    })
    .join("\n")}\n`;
}

export const VideoPlayer = memo(function VideoPlayer({ src, segments, videoRef, onDownload }: VideoPlayerProps) {
  const trackUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    Array.from(video.querySelectorAll("track")).forEach((t) => video.removeChild(t));
    Array.from(video.textTracks).forEach((t) => {
      t.mode = "disabled";
    });

    if (trackUrlRef.current) {
      URL.revokeObjectURL(trackUrlRef.current);
      trackUrlRef.current = null;
    }

    if (segments.length === 0) return;

    const blob = new Blob([toVtt(segments)], { type: "text/vtt" });
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
      Array.from(video.textTracks).forEach((t) => {
        t.mode = "disabled";
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
  }, [segments, videoRef]);

  return (
    <div className="video-wrap">
      <div className="video-frame">
        {src ? (
          <video className="video-element" controls playsInline ref={videoRef} src={src} />
        ) : (
          <div className="video-empty">재생할 영상을 선택하세요</div>
        )}
      </div>
      {src && segments.length > 0 && (
        <div className="video-actions">
          <button className="ghost-button small" onClick={onDownload} type="button">
            VTT 다운로드
          </button>
        </div>
      )}
    </div>
  );
});
