"use client";

import { FileList } from "./file-list";
import { FolderGrid } from "./folder-grid";
import { RecentActivity } from "./recent-activity";
import { SharedWithMe } from "./shared-with-me";
import { StorageCards } from "./storage-cards";
import { StorageOverview } from "./storage-overview";

export type ViewType = "all" | "starred" | "recent" | "shared" | "trash" | "folder";

interface FilesContentProps {
  view: ViewType;
  folderId?: string;
}

export function FilesContent({ view, folderId }: FilesContentProps) {
  const showStorageCards = view === "all" || view === "recent";
  const showSidePanels = view === "all";
  const showFolders = view === "all";

  return (
    <div className="flex-1 overflow-auto w-full">
      <div className="flex flex-col xl:flex-row gap-6 p-4 md:p-6">
        <div className="flex-1 space-y-6 min-w-0">
          {showStorageCards && <StorageCards />}
          {showFolders && <FolderGrid />}
          <FileList view={view} folderId={folderId} />
        </div>

        {showSidePanels && (
          <div className="w-full xl:w-80 shrink-0 space-y-4">
            <StorageOverview />
            <SharedWithMe />
            <RecentActivity />
          </div>
        )}
      </div>
    </div>
  );
}
