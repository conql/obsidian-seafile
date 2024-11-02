import { DataAdapter, TAbstractFile, TFile, View, WorkspaceLeaf } from "obsidian";

interface InternalPlugin {
  enabled: boolean;
  enable: (b: boolean) => void;
  disable: (b: boolean) => void;
}

interface StarredFile {
  type: "file";
  title: string;
  path: string;
}

interface StarredInternalPlugin extends InternalPlugin {
  instance: {
    addItem: (file: StarredFile) => void;
    removeItem: (file: StarredFile) => void;
    items: StarredFile[];
  };
}

interface FileExplorerInternalPlugin extends InternalPlugin {
  views: { "file-explorer": Function };
}

interface InternalPlugins {
  starred: StarredInternalPlugin;
  "file-explorer": FileExplorerInternalPlugin;
}

declare module "obsidian" {
  interface Workspace {
    getLeavesOfType(viewType: "markdown" | "search" | "file-explorer"): ExplorerLeaf[];
  }

  interface App {
    internalPlugins: {
      plugins: InternalPlugins;
      getPluginById<T extends keyof InternalPlugins>(id: T): InternalPlugins[T];
      loadPlugin(...args: unknown[]): unknown;
    };
    viewRegistry: {
      viewByType: Record<string, Function>;
    };
  }
}

interface ExplorerLeaf extends WorkspaceLeaf {
  view: ExplorerView;
  containerEl: HTMLElement;
}

interface DomChild {
  file: TFile;
  collapseEl: HTMLElement;
  containerEl: HTMLElement;
}

interface ExplorerView extends View {
  fileItems: Record<string, FileItem>; // keyed by path
  ready: boolean; // true if fileItems is populated
  file?: TFile;
  dom: { children: DomChild[]; changed: () => void };
}

interface FileItem {
  selfEl: HTMLDivElement;
  file: TAbstractFile;
  titleInnerEl: HTMLDivElement;
  iconWrapper?: HTMLDivElement;
}

export interface MobileDataAdapter extends DataAdapter {
  getNativePath(path: string): Promise<string>;
}