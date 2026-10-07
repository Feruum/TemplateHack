"use client";

import { AiChat02Icon, ArrowRight01Icon, Home01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useFilesStore } from "@/store/files-store";

export function Breadcrumb() {
  const pathname = usePathname();
  const { folders } = useFilesStore();

  const getViewInfo = () => {
    if (pathname === "/chat") return { name: "AI Chat", icon: AiChat02Icon };
    if (pathname === "/starred") return { name: "Starred" };
    if (pathname === "/recent") return { name: "Recent" };
    if (pathname === "/shared") return { name: "Shared" };
    if (pathname === "/trash") return { name: "Trash" };
    if (pathname.startsWith("/folder/")) {
      const folderId = pathname.split("/folder/")[1];
      const folder = folders.find((f) => f.id === folderId);
      return { name: folder?.name || "Folder" };
    }
    return null;
  };

  const viewInfo = getViewInfo();

  return (
    <nav className="flex items-center gap-1 text-sm">
      <Link
        href="/"
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors",
          pathname === "/"
            ? "text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
      >
        <HugeiconsIcon icon={Home01Icon} className="size-4" />
        <span>My Files</span>
      </Link>
      {viewInfo && (
        <>
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 text-muted-foreground" />
          <span className="flex items-center gap-1.5 px-2 py-1 font-medium">
            {viewInfo.icon && <HugeiconsIcon icon={viewInfo.icon} className="size-4" />}
            {viewInfo.name}
          </span>
        </>
      )}
    </nav>
  );
}
