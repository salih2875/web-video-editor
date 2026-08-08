import React, { Suspense, lazy, useCallback, useState } from "react";
import { EditorProvider, useEditor } from "./context/EditorContext";
import { MediaUpload } from "./components/MediaUpload/MediaUpload";
import { VideoPlayer } from "./components/VideoPlayer/VideoPlayer";
import { ControlPanel } from "./components/ControlPanel/ControlPanel";
import { Timeline } from "./components/Timeline/Timeline";
import { PropertiesPanel } from "./components/PropertiesPanel/PropertiesPanel";
import "./styles/global.css";

const EffectsPanel = lazy(() => import("./components/EffectsPanel/EffectsPanel").then((module) => ({ default: module.EffectsPanel })));
const ExportPanel = lazy(() => import("./components/Export/Export").then((module) => ({ default: module.Export })));

const EditorShell: React.FC = () => {
  const { setVideoFile, setAudioFile } = useEditor();
  const [activePanel, setActivePanel] = useState<"properties" | "effects" | "export">("properties");
  const [isDragging, setIsDragging] = useState(false);

  const importFiles = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (file.type.startsWith("video/")) await setVideoFile(file);
      else if (file.type.startsWith("audio/")) await setAudioFile(file);
    }
  }, [setAudioFile, setVideoFile]);

  return (
    <div
      className={`editor-layout ${isDragging ? "is-dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDragging(false); }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        void importFiles(event.dataTransfer.files);
      }}
    >
      {isDragging && <div className="drop-overlay">Drop video or audio files</div>}
      <header className="editor-header"><h1>PIXI Video Editor</h1><MediaUpload /></header>
      <main className="editor-main">
        <div className="editor-main-left">
          <div className="panel-buttons">
            <button className={activePanel === "properties" ? "active" : ""} onClick={() => setActivePanel("properties")}>Properties</button>
            <button className={activePanel === "effects" ? "active" : ""} onClick={() => setActivePanel("effects")}>Effects</button>
            <button className={activePanel === "export" ? "active" : ""} onClick={() => setActivePanel("export")}>Export</button>
          </div>
          <VideoPlayer />
          <ControlPanel />
        </div>
        <div className="editor-main-right">
          <Suspense fallback={<div className="panel-loading">Loading panel…</div>}>
            {activePanel === "properties" && <PropertiesPanel />}
            {activePanel === "effects" && <EffectsPanel />}
            {activePanel === "export" && <ExportPanel />}
          </Suspense>
        </div>
      </main>
      <footer className="editor-footer"><Timeline /></footer>
    </div>
  );
};

const App: React.FC = () => <EditorProvider><EditorShell /></EditorProvider>;
export default App;
