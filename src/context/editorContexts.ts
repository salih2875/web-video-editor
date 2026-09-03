import { createContext, useContext, type Context } from "react";
import type { EditorContextType } from "../types/editor";

export type EditorMediaActions = Pick<
  EditorContextType,
  "setVideoFile" | "setAudioFile"
>;

export type EditorExportData = Pick<
  EditorContextType,
  "clips" | "audioClips" | "textClips" | "effects" | "totalDuration"
>;

export type EditorPropertiesData = Pick<
  EditorContextType,
  | "clips"
  | "audioClips"
  | "textClips"
  | "selectedItem"
  | "updateVideoClip"
  | "updateAudioClip"
  | "updateTextClip"
  | "addTextClip"
  | "bringToFront"
  | "duplicateSelected"
  | "deleteSelected"
  | "saveProject"
  | "setProjectName"
  | "projectName"
  | "isDirty"
  | "loopPlayback"
  | "setLoopPlayback"
  | "selectItem"
>;

export const EditorContext = createContext<EditorContextType | undefined>(undefined);
export const EditorMediaActionsContext = createContext<EditorMediaActions | undefined>(undefined);
export const EditorExportDataContext = createContext<EditorExportData | undefined>(undefined);
export const EditorPropertiesContext = createContext<EditorPropertiesData | undefined>(undefined);

const useRequiredContext = <T>(context: Context<T | undefined>, hookName: string): T => {
  const value = useContext(context);
  if (value === undefined) {
    throw new Error(`${hookName} must be used within an EditorProvider`);
  }
  return value;
};

export const useEditor = (): EditorContextType =>
  useRequiredContext(EditorContext, "useEditor");

export const useEditorMediaActions = (): EditorMediaActions =>
  useRequiredContext(EditorMediaActionsContext, "useEditorMediaActions");

export const useEditorExportData = (): EditorExportData =>
  useRequiredContext(EditorExportDataContext, "useEditorExportData");

export const useEditorProperties = (): EditorPropertiesData =>
  useRequiredContext(EditorPropertiesContext, "useEditorProperties");
