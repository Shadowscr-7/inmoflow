"use client";

import { useAuth } from "@/lib/auth";
import { api, API_URL } from "@/lib/api";
import { useEffect, useState, useCallback, useRef } from "react";
import { Film, Download, Loader2, AlertCircle, CheckCircle2, Clock, RefreshCcw } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";

interface ReelJob {
  id: string;
  propertyId: string;
  propertyTitle: string;
  status: "pending" | "bundling" | "rendering" | "done" | "error";
  progress: number;
  error: string | null;
  createdAt: number;
}

function statusLabel(status: string) {
  switch (status) {
    case "pending": return "En cola";
    case "bundling": return "Preparando...";
    case "rendering": return "Renderizando...";
    case "done": return "Listo";
    case "error": return "Error";
    default: return status;
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "pending": return <Clock className="h-4 w-4 text-yellow-500" />;
    case "bundling":
    case "rendering": return <Loader2 className="h-4 w-4 text-indigo-500 animate-spin" />;
    case "done": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "error": return <AlertCircle className="h-4 w-4 text-red-500" />;
    default: return null;
  }
}

export default function PropertyVideosPage() {
  const { token } = useAuth();
  const toast = useToast();
  const [jobs, setJobs] = useState<ReelJob[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadJobs = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getReelJobs(token);
      setJobs(data as ReelJob[]);
    } catch { /* ignore */ }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Poll active jobs every 3 seconds
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === "pending" || j.status === "bundling" || j.status === "rendering");
    if (hasActive && token) {
      pollRef.current = setInterval(async () => {
        // Refresh all active jobs
        const updated = [...jobs];
        let changed = false;
        for (let i = 0; i < updated.length; i++) {
          const j = updated[i];
          if (j.status === "pending" || j.status === "bundling" || j.status === "rendering") {
            try {
              const status = await api.getReelStatus(token, j.id);
              if (status.status !== j.status || status.progress !== j.progress) {
                updated[i] = { ...j, status: status.status as ReelJob["status"], progress: status.progress, error: status.error };
                changed = true;
              }
            } catch { /* ignore */ }
          }
        }
        if (changed) setJobs(updated);
      }, 3000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
    return undefined;
  }, [jobs, token]);

  const handleDownload = (jobId: string) => {
    if (!token) return;
    const url = api.getReelDownloadUrl(jobId);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reel-${jobId}.mp4`;
    // Need auth header — use fetch + blob
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = `reel-${jobId}.mp4`;
        link.click();
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => toast.error("Error al descargar video"));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Film className="h-7 w-7 text-purple-500" /> Videos de propiedades
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Videos tipo Reel (1080×1920) generados para Instagram
          </p>
        </div>
        <button onClick={() => { setLoading(true); loadJobs(); }} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
          <RefreshCcw className="h-4 w-4" /> Actualizar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <Film className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Sin videos generados</p>
          <p className="text-sm mt-1">Generá un video desde la sección de propiedades usando el botón <Film className="h-4 w-4 inline" /></p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {statusIcon(job.status)}
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">{job.propertyTitle}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {statusLabel(job.status)}
                      {job.status === "error" && job.error && (
                        <span className="text-red-500 ml-2">— {job.error}</span>
                      )}
                      <span className="mx-2">·</span>
                      {new Date(job.createdAt).toLocaleString("es")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Progress bar for active jobs */}
                  {(job.status === "pending" || job.status === "bundling" || job.status === "rendering") && (
                    <div className="w-32">
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span>{job.progress}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-600 rounded-full transition-all duration-500"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {/* Download button when done */}
                  {job.status === "done" && (
                    <button
                      onClick={() => handleDownload(job.id)}
                      className="flex items-center gap-2 px-3 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
                    >
                      <Download className="h-4 w-4" /> Descargar .mp4
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
