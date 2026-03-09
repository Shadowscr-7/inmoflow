"use client";

import { useAuth } from "@/lib/auth";
import { api, ImportPreview, ImportResult } from "@/lib/api";
import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight, X, Download } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/errors";

type Step = "upload" | "preview" | "result";

const LEAD_FIELDS = [
  { value: "name", label: "Nombre" },
  { value: "phone", label: "Teléfono" },
  { value: "email", label: "Email" },
  { value: "status", label: "Estado" },
  { value: "notes", label: "Notas" },
  { value: "intent", label: "Interés" },
  { value: "stageKey", label: "Etapa (key)" },
  { value: "", label: "— Ignorar —" },
];

export default function ImportPage() {
  const { token } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      await doPreview(text);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const doPreview = async (text: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.previewImport(token, text);
      setPreview(res);
      // Auto-map known columns
      const map: Record<string, string> = {};
      res.columns.forEach((col) => {
        const lower = col.toLowerCase();
        if (lower.includes("name") || lower.includes("nombre")) map[col] = "name";
        else if (lower.includes("phone") || lower.includes("tel") || lower.includes("cel") || lower.includes("mobile")) map[col] = "phone";
        else if (lower.includes("email") || lower.includes("correo") || lower.includes("mail")) map[col] = "email";
        else if (lower.includes("status") || lower.includes("estado")) map[col] = "status";
        else if (lower.includes("note") || lower.includes("nota") || lower.includes("observ")) map[col] = "notes";
        else if (lower.includes("intent") || lower.includes("interes")) map[col] = "intent";
        else if (lower.includes("stage") || lower.includes("etapa")) map[col] = "stageKey";
      });
      setMapping(map);
      setStep("preview");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    }
    setLoading(false);
  };

  const doImport = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.importLeads(token, csvText, mapping);
      setResult(res);
      setStep("result");
      toast.success(`${res.created} leads importados`);
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    }
    setLoading(false);
  };

  const reset = () => {
    setStep("upload");
    setCsvText("");
    setFileName("");
    setPreview(null);
    setMapping({});
    setResult(null);
  };

  const downloadTemplate = () => {
    const csv = "nombre,telefono,email,estado,notas,interes\nJuan Pérez,+598991234567,juan@email.com,NEW,Interesado en 3 dormitorios,Compra\nMaría López,+598992345678,maria@email.com,CONTACTED,Busca alquiler,Alquiler";
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "plantilla-leads.csv";
    link.click();
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Upload className="h-7 w-7 text-indigo-500" /> Importar Leads
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Importa leads desde un archivo CSV</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(["upload", "preview", "result"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <ArrowRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />}
            <span className={`px-3 py-1 rounded-full ${step === s ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 font-medium" : "text-gray-400"}`}>
              {i + 1}. {s === "upload" ? "Subir archivo" : s === "preview" ? "Mapeo y vista previa" : "Resultado"}
            </span>
          </div>
        ))}
      </div>

      {/* Upload */}
      {step === "upload" && (
        <div className="space-y-4">
          <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer hover:border-indigo-400 dark:border-gray-600 dark:hover:border-indigo-500 transition-colors">
            <FileSpreadsheet className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-300 font-medium">Arrastra un archivo CSV aquí</p>
            <p className="text-sm text-gray-400 mt-1">o haz clic para seleccionar</p>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
          <div className="flex justify-center">
            <button onClick={downloadTemplate} className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
              <Download className="h-4 w-4" /> Descargar plantilla CSV
            </button>
          </div>
          {loading && <div className="flex justify-center"><Spinner /></div>}
        </div>
      )}

      {/* Preview & Mapping */}
      {step === "preview" && preview && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{fileName}</p>
                <p className="text-sm text-gray-500">{preview.count} filas detectadas · {preview.columns.length} columnas</p>
              </div>
              <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cambiar archivo</button>
            </div>

            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Mapeo de columnas</h3>
            <div className="grid gap-2">
              {preview.columns.map((col) => (
                <div key={col} className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 dark:text-gray-400 w-40 truncate font-mono">{col}</span>
                  <ArrowRight className="h-4 w-4 text-gray-300" />
                  <select value={mapping[col] ?? ""} onChange={(e) => setMapping({ ...mapping, [col]: e.target.value })}
                    className="border rounded-lg px-3 py-1.5 text-sm flex-1 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    {LEAD_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Preview table */}
          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 p-4 pb-2">Vista previa (primeras 10 filas)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50 dark:bg-gray-700">
                  {preview.columns.map((col) => <th key={col} className="px-3 py-2 text-left text-gray-600 dark:text-gray-300 font-medium">{col}</th>)}
                </tr></thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="border-t dark:border-gray-700">
                      {preview.columns.map((col) => <td key={col} className="px-3 py-2 text-gray-700 dark:text-gray-300 truncate max-w-[200px]">{String(row[col] ?? "")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={reset} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancelar</button>
            <button onClick={doImport} disabled={loading}
              className="px-6 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2">
              {loading ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />} Importar {preview.count} leads
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {step === "result" && result && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-6 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Importación completada</h2>
            <div className="flex justify-center gap-6 text-sm">
              <div><span className="text-2xl font-bold text-green-600">{result.created}</span><span className="block text-gray-500">Creados</span></div>
              <div><span className="text-2xl font-bold text-yellow-600">{result.skipped}</span><span className="block text-gray-500">Omitidos</span></div>
              <div><span className="text-2xl font-bold text-gray-500">{result.total}</span><span className="block text-gray-500">Total filas</span></div>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300 flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4" /> {result.errors.length} errores
              </h3>
              <div className="space-y-1 max-h-40 overflow-y-auto text-xs">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-yellow-700 dark:text-yellow-400">Fila {e.row}: {e.error}</p>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-center">
            <button onClick={reset} className="px-6 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">Importar otro archivo</button>
          </div>
        </div>
      )}
    </div>
  );
}
