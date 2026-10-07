"use client";

import * as React from "react";
import { AGENT_STORAGE_URL } from "@/lib/constants";

interface CollectionStats {
  name: string;
  count: number;
}

interface ChromaStats {
  collections: CollectionStats[];
  total_documents: number;
  sources: string[];
}

interface Mem0Stats {
  available: boolean;
  users_with_memories: number;
}

export interface StorageStats {
  chroma: ChromaStats;
  mem0: Mem0Stats;
}

export interface StorageData {
  used: number;
  total: number;
  breakdown: {
    type: string;
    size: number;
    color: string;
  }[];
}

interface UseStorageStatsReturn {
  stats: StorageStats | null;
  storageData: StorageData;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const DEFAULT_STORAGE_DATA: StorageData = {
  used: 0,
  total: 15,
  breakdown: [
    { type: "Documents", size: 0, color: "#8B5CF6" },
    { type: "Images", size: 0, color: "#EC4899" },
    { type: "Videos", size: 0, color: "#F59E0B" },
    { type: "Archives", size: 0, color: "#10B981" },
    { type: "Other", size: 0, color: "#6B7280" },
  ],
};

function calculateStorageData(stats: StorageStats | null): StorageData {
  if (!stats) return DEFAULT_STORAGE_DATA;

  const totalDocs = stats.chroma.total_documents;
  const avgDocSizeMB = 0.5;
  const usedGB = (totalDocs * avgDocSizeMB) / 1024;

  return {
    used: Math.round(usedGB * 10) / 10,
    total: 15,
    breakdown: [
      { type: "Documents", size: Math.round(usedGB * 0.6 * 10) / 10, color: "#8B5CF6" },
      { type: "Images", size: Math.round(usedGB * 0.2 * 10) / 10, color: "#EC4899" },
      { type: "Videos", size: Math.round(usedGB * 0.1 * 10) / 10, color: "#F59E0B" },
      { type: "Archives", size: Math.round(usedGB * 0.05 * 10) / 10, color: "#10B981" },
      { type: "Other", size: Math.round(usedGB * 0.05 * 10) / 10, color: "#6B7280" },
    ],
  };
}

export function useStorageStats(): UseStorageStatsReturn {
  const [stats, setStats] = React.useState<StorageStats | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const fetchStats = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(AGENT_STORAGE_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch storage stats: ${response.statusText}`);
      }
      const data: StorageStats = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const storageData = React.useMemo(() => calculateStorageData(stats), [stats]);

  return {
    stats,
    storageData,
    isLoading,
    error,
    refetch: fetchStats,
  };
}
