import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor } from "../../context/EditorContext";
import type { AudioClip, Clip, MediaSelection } from "../../types/editor";
import { TimelineRuler } from "./TimelineRuler";
import { ZoomControls } from "./ZoomControls";
import styles from "./Timeline.module.css";
import { snapToPoints } from "../../utils/timelineMath";

const ClipCanvas = memo(({ canvas }: { canvas: HTMLCanvasElement | null }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !canvas) return;
    host.replaceChildren(canvas);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    return () => { if (host.contains(canvas)) host.removeChild(canvas); };
  }, [canvas]);
  return <div ref={hostRef} className={styles.thumbnailCanvas} />;
});

const Waveform = memo(({ peaks }: { peaks: number[] }) => (
  <div className={styles.waveform} aria-hidden="true">
    {peaks.map((peak, index) => <i key={index} style={{ height: `${Math.max(8, peak * 92)}%` }} />)}
  </div>
));

type DragTarget = MediaSelection;
type TrimEdge = "start" | "end";

export const Timeline: React.FC = () => {
  const editor = useEditor();
  const {
    totalDuration,
    clips,
    audioClips,
    currentTime,
    timelineZoom,
    selectedItem,
    snapEnabled,
    isGeneratingThumbnails,
    isLoadingAudio,
    setTimelineZoom,
    setTimelineScrollPosition,
    zoomIn,
    zoomOut,
    resetZoom,
    zoomToFit,
    seek,
    selectItem,
    updateVideoClip,
    updateAudioClip,
    removeVideoClip,
    removeAudioClip,
    bringToFront,
    undo,
    redo,
    canUndo,
    canRedo,
    setSnapEnabled,
  } = editor;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(800);
  const [dragPreview, setDragPreview] = useState<{ type: DragTarget["type"]; left: number; width: number; lane: number } | null>(null);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const contentWidth = Math.max(viewportWidth, viewportWidth * timelineZoom);
  const displayDuration = Math.max(totalDuration, 1000);
  const percent = useCallback((time: number) => time / displayDuration * 100, [displayDuration]);
  const laneValues = useMemo(() => [...new Set(audioClips.map((clip) => clip.zIndex))].sort((a, b) => b - a), [audioClips]);
  const laneFor = useCallback((clip: AudioClip) => Math.max(0, laneValues.indexOf(clip.zIndex)), [laneValues]);
  const audioTrackHeight = Math.max(70, laneValues.length * 58 + 8);

  const snapTime = useCallback((candidate: number, target: DragTarget) => {
    if (!snapEnabled) return candidate;
    const threshold = displayDuration / Math.max(1, contentWidth) * 9;
    const points = [0, currentTime];
    clips.forEach((clip) => { if (target.type !== "video" || clip.id !== target.id) points.push(clip.timelineStart, clip.timelineEnd); });
    audioClips.forEach((clip) => { if (target.type !== "audio" || clip.id !== target.id) points.push(clip.timelineStart, clip.timelineEnd); });
    return snapToPoints(candidate, points, threshold);
  }, [audioClips, clips, contentWidth, currentTime, displayDuration, snapEnabled]);

  const handleSeek = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || totalDuration <= 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    seek(Math.max(0, Math.min(totalDuration, (event.clientX - rect.left) / rect.width * displayDuration)));
    selectItem(null);
  }, [displayDuration, seek, selectItem, totalDuration]);

  const getTarget = useCallback((target: DragTarget) => target.type === "video"
    ? clips.find((clip) => clip.id === target.id)
    : audioClips.find((clip) => clip.id === target.id), [audioClips, clips]);

  const startDrag = useCallback((event: React.MouseEvent, target: DragTarget) => {
    event.stopPropagation();
    if (!timelineRef.current) return;
    const source = getTarget(target);
    if (!source) return;
    selectItem(target);
    const startX = event.clientX;
    const originalStart = source.timelineStart;
    const duration = source.timelineEnd - source.timelineStart;
    const rect = timelineRef.current.getBoundingClientRect();
    let moved = false;
    let newStart = originalStart;
    const lane = target.type === "audio" ? laneFor(source as AudioClip) : 0;

    const onMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      if (Math.abs(deltaX) > 3) moved = true;
      if (!moved) return;
      const rawStart = Math.max(0, originalStart + deltaX / rect.width * displayDuration);
      const snappedStart = snapTime(rawStart, target);
      const snappedEnd = snapTime(rawStart + duration, target) - duration;
      newStart = Math.max(0,
        Math.abs(snappedStart - rawStart) <= Math.abs(snappedEnd - rawStart) ? snappedStart : snappedEnd,
      );
      setDragPreview({ type: target.type, left: percent(newStart), width: percent(duration), lane });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setDragPreview(null);
      if (!moved) { seek(source.timelineStart); return; }
      const patch = { timelineStart: newStart, timelineEnd: newStart + duration };
      if (target.type === "video") updateVideoClip(target.id, patch);
      else updateAudioClip(target.id, patch);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
  }, [displayDuration, getTarget, laneFor, percent, seek, selectItem, snapTime, updateAudioClip, updateVideoClip]);

  const startTrim = useCallback((event: React.MouseEvent, target: DragTarget, edge: TrimEdge) => {
    event.stopPropagation();
    if (!timelineRef.current) return;
    const source = getTarget(target);
    if (!source) return;
    selectItem(target);
    const startX = event.clientX;
    const rect = timelineRef.current.getBoundingClientRect();
    let timelineStart = source.timelineStart;
    let timelineEnd = source.timelineEnd;
    let clipStart = source.clipStart;
    let clipEnd = source.clipEnd;
    const lane = target.type === "audio" ? laneFor(source as AudioClip) : 0;

    const onMove = (moveEvent: MouseEvent) => {
      const delta = (moveEvent.clientX - startX) / rect.width * displayDuration;
      if (edge === "start") {
        const minimum = Math.max(0, source.timelineStart - source.clipStart);
        const maximum = source.timelineEnd - 100;
        timelineStart = Math.max(minimum, Math.min(maximum, snapTime(source.timelineStart + delta, target)));
        clipStart = source.clipStart + timelineStart - source.timelineStart;
      } else {
        const minimum = source.timelineStart + 100;
        const maximum = source.timelineEnd + (source.sourceDuration - source.clipEnd);
        timelineEnd = Math.max(minimum, Math.min(maximum, snapTime(source.timelineEnd + delta, target)));
        clipEnd = source.clipEnd + timelineEnd - source.timelineEnd;
      }
      setDragPreview({
        type: target.type,
        left: percent(timelineStart),
        width: percent(timelineEnd - timelineStart),
        lane,
      });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setDragPreview(null);
      const patch = {
        timelineStart,
        timelineEnd,
        clipStart,
        clipEnd,
        clipDuration: timelineEnd - timelineStart,
      };
      if (target.type === "video") updateVideoClip(target.id, patch);
      else updateAudioClip(target.id, patch);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
  }, [displayDuration, getTarget, laneFor, percent, selectItem, snapTime, updateAudioClip, updateVideoClip]);

  const hasMedia = clips.length > 0 || audioClips.length > 0;
  return (
    <div className={styles.timelineWrapper} ref={wrapperRef}>
      <div className={styles.timelineToolbar}>
        <ZoomControls zoomLevel={timelineZoom} minZoom={0.25} maxZoom={8} onZoomIn={zoomIn} onZoomOut={zoomOut} onZoomReset={resetZoom} onZoomToFit={zoomToFit} onZoomChange={setTimelineZoom} />
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">↶</button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">↷</button>
        <label><input type="checkbox" checked={snapEnabled} onChange={(event) => setSnapEnabled(event.target.checked)} /> Snap</label>
      </div>
      <div className={styles.scrollContainer} ref={scrollRef} onScroll={(event) => setTimelineScrollPosition(event.currentTarget.scrollLeft)} onWheel={(event) => {
        if (event.ctrlKey || event.metaKey) { event.preventDefault(); if (event.deltaY < 0) zoomIn(); else zoomOut(); }
        else if (scrollRef.current) scrollRef.current.scrollLeft += event.deltaY;
      }}>
        <div className={styles.timelineContent} style={{ width: contentWidth }}>
          <TimelineRuler duration={displayDuration} zoomLevel={timelineZoom} width={contentWidth} onTimeClick={(time) => seek(Math.min(time, totalDuration))} />
          <div className={styles.tracks} ref={timelineRef} onMouseDown={handleSeek}>
            <div className={`${styles.track} ${styles.videoTrack}`}>
              <span className={styles.trackLabel}>VIDEO · highest layer plays</span>
              {clips.map((clip: Clip) => {
                const selected = selectedItem?.type === "video" && selectedItem.id === clip.id;
                return <div key={clip.id} className={`${styles.videoClip} ${selected ? styles.selectedClip : ""}`} style={{ left: `${percent(clip.timelineStart)}%`, width: `${percent(clip.clipDuration)}%`, zIndex: clip.zIndex + 1 }} onMouseDown={(event) => startDrag(event, { type: "video", id: clip.id })} onContextMenu={(event) => { event.preventDefault(); bringToFront({ type: "video", id: clip.id }); }} title={`${clip.name} · layer ${clip.zIndex}`}>
                  <ClipCanvas canvas={clip.thumbnail} /><span className={styles.clipName}>{clip.name} · V{clip.zIndex}</span>
                  <div className={`${styles.trimHandle} ${styles.trimStart}`} onMouseDown={(event) => startTrim(event, { type: "video", id: clip.id }, "start")} />
                  <div className={`${styles.trimHandle} ${styles.trimEnd}`} onMouseDown={(event) => startTrim(event, { type: "video", id: clip.id }, "end")} />
                  <button type="button" className={styles.deleteClip} aria-label={`Delete video clip ${clip.name}`} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); removeVideoClip(clip.id); }}>×</button>
                </div>;
              })}
              {isGeneratingThumbnails && <span className={styles.trackStatus}>Generating thumbnails…</span>}
            </div>
            <div className={`${styles.track} ${styles.audioTrack}`} style={{ height: audioTrackHeight }}>
              <span className={styles.trackLabel}>AUDIO · highest lane plays</span>
              {audioClips.map((clip: AudioClip) => {
                const lane = laneFor(clip);
                const selected = selectedItem?.type === "audio" && selectedItem.id === clip.id;
                return <div key={clip.id} className={`${styles.audioClip} ${selected ? styles.selectedClip : ""}`} style={{ left: `${percent(clip.timelineStart)}%`, width: `${percent(clip.clipDuration)}%`, top: lane * 58 + 5, height: 52, bottom: "auto", zIndex: 10 + clip.zIndex }} onMouseDown={(event) => startDrag(event, { type: "audio", id: clip.id })} onContextMenu={(event) => { event.preventDefault(); bringToFront({ type: "audio", id: clip.id }); }} title={`${clip.name} · priority ${clip.zIndex}`}>
                  <Waveform peaks={clip.peaks} /><span className={styles.clipName}>{clip.name} · A{clip.zIndex}</span>
                  <div className={`${styles.trimHandle} ${styles.trimStart}`} onMouseDown={(event) => startTrim(event, { type: "audio", id: clip.id }, "start")} />
                  <div className={`${styles.trimHandle} ${styles.trimEnd}`} onMouseDown={(event) => startTrim(event, { type: "audio", id: clip.id }, "end")} />
                  <button type="button" className={styles.deleteClip} aria-label={`Delete audio clip ${clip.name}`} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); removeAudioClip(clip.id); }}>×</button>
                </div>;
              })}
              {isLoadingAudio && <span className={styles.trackStatus}>Building waveform…</span>}
            </div>
            {hasMedia && <div className={styles.playhead} style={{ left: `${percent(currentTime)}%` }} />}
            {dragPreview && <div className={`${styles.dragPreview} ${dragPreview.type === "audio" ? styles.audioPreview : ""}`} style={{ left: `${dragPreview.left}%`, width: `${dragPreview.width}%`, top: dragPreview.type === "audio" ? 89 + dragPreview.lane * 58 : 12 }} />}
            {!hasMedia && <div className={styles.placeholder}>Drop video or audio here to start editing</div>}
          </div>
        </div>
      </div>
    </div>
  );
};
