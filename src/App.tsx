import React, { Suspense, lazy, useCallback, useState } from "react";
import { EditorProvider, useEditorMediaActions } from "./context/EditorContext";
import { MediaUpload } from "./components/MediaUpload/MediaUpload";
import { VideoPlayer } from "./components/VideoPlayer/VideoPlayer";
import { ControlPanel } from "./components/ControlPanel/ControlPanel";
import { Timeline } from "./components/Timeline/Timeline";
import { PropertiesPanel } from "./components/PropertiesPanel/PropertiesPanel";
import "./styles/global.css";

const EffectsPanel = lazy(() => import("./components/EffectsPanel/EffectsPanel").then((module) => ({ default: module.EffectsPanel })));
const ExportPanel = lazy(() => import("./components/Export/Export").then((module) => ({ default: module.Export })));

type PanelName = "properties" | "effects" | "export";

interface PanelNavigationState {
  active: PanelName;
  opened: Record<PanelName, boolean>;
}

const INITIAL_PANEL_NAVIGATION: PanelNavigationState = {
  active: "properties",
  opened: {
    properties: true,
    effects: false,
    export: false,
  },
};

const EditorShell: React.FC = () => {
  const { setVideoFile, setAudioFile } = useEditorMediaActions();
  const [panelNavigation, setPanelNavigation] = useState(INITIAL_PANEL_NAVIGATION);
  const [isDragging, setIsDragging] = useState(false);

  const openPanel = useCallback((panel: PanelName) => {
    setPanelNavigation((previous) => ({
      active: panel,
      opened: previous.opened[panel]
        ? previous.opened
        : { ...previous.opened, [panel]: true },
    }));
  }, []);

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
          <div className="panel-buttons" role="tablist" aria-label="Editor panels">
            <button
              id="properties-tab"
              type="button"
              role="tab"
              aria-controls="properties-panel"
              aria-selected={panelNavigation.active === "properties"}
              className={panelNavigation.active === "properties" ? "active" : ""}
              onClick={() => openPanel("properties")}
            >
              Properties
            </button>
            <button
              id="effects-tab"
              type="button"
              role="tab"
              aria-controls="effects-panel"
              aria-selected={panelNavigation.active === "effects"}
              className={panelNavigation.active === "effects" ? "active" : ""}
              onClick={() => openPanel("effects")}
            >
              Effects
            </button>
            <button
              id="export-tab"
              type="button"
              role="tab"
              aria-controls="export-panel"
              aria-selected={panelNavigation.active === "export"}
              className={panelNavigation.active === "export" ? "active" : ""}
              onClick={() => openPanel("export")}
            >
              Export
            </button>
          </div>
          <VideoPlayer />
          <ControlPanel />
        </div>
        <div className="editor-main-right">
          <div
            id="properties-panel"
            role="tabpanel"
            aria-labelledby="properties-tab"
            hidden={panelNavigation.active !== "properties"}
          >
            <PropertiesPanel />
          </div>
          {panelNavigation.opened.effects && (
            <div
              id="effects-panel"
              role="tabpanel"
              aria-labelledby="effects-tab"
              hidden={panelNavigation.active !== "effects"}
            >
              <Suspense fallback={<div className="panel-loading">Loading panel…</div>}>
                <EffectsPanel />
              </Suspense>
            </div>
          )}
          {panelNavigation.opened.export && (
            <div
              id="export-panel"
              role="tabpanel"
              aria-labelledby="export-tab"
              hidden={panelNavigation.active !== "export"}
            >
              <Suspense fallback={<div className="panel-loading">Loading panel…</div>}>
                <ExportPanel />
              </Suspense>
            </div>
          )}
        </div>
      </main>
      <footer className="editor-footer"><Timeline /></footer>
    </div>
  );
};

const App: React.FC = () => <EditorProvider><EditorShell /></EditorProvider>;
export default App;
