import { useEffect, useState } from "react";
import SurfaceCard from "../../components/ui/SurfaceCard";
import {
  fetchValuationReport,
  type LibraryValuationReport,
} from "../../services/library.service";

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== "number" || isNaN(amount)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export default function LibraryValuationReportPage() {
  const [report, setReport] = useState<LibraryValuationReport | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReport = async () => {
    setLoading(true);
    try {
      const data = await fetchValuationReport();
      setReport(data);
    } catch (err) {
      console.warn("fetchValuationReport error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReport();
  }, []);

  const handleExportCsv = () => {
    if (!report || report.volumes.length === 0) return;

    const headers = [
      "ISBN",
      "Title",
      "Author",
      "Publisher",
      "Publish Year",
      "Dewey Decimal",
      "LOC Call Number",
      "Room",
      "Shelf",
      "Reading Status",
      "Ex-Libris Tags",
      "Acquisition Cost ($)",
      "Insurance Replacement Value ($)",
    ];

    const rows = report.volumes.map((v) => [
      `"${v.isbn}"`,
      `"${(v.title || "").replace(/"/g, '""')}"`,
      `"${(v.author || "").replace(/"/g, '""')}"`,
      `"${(v.publisher || "").replace(/"/g, '""')}"`,
      `"${v.publishYear || ""}"`,
      `"${v.deweyDecimal || ""}"`,
      `"${v.locClassification || ""}"`,
      `"${v.roomName || "Unassigned"}"`,
      `"${v.shelfName || "Unassigned"}"`,
      `"${v.readingStatus}"`,
      `"${(v.exLibrisTags || "").replace(/"/g, '""')}"`,
      (v.acquisitionPrice || 0).toFixed(2),
      (v.replacementValue || 0).toFixed(2),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `colophon_library_appraisal_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <SurfaceCard className="space-y-4 print:hidden">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 text-xl font-bold shadow-sm">
              📑
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Insurance & Estate Valuation Appraisal</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Comprehensive collection replacement valuation reports for personal property insurance, riders, and estate appraisal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={loading || !report || report.totalVolumes === 0}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>📊</span>
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={loading || !report || report.totalVolumes === 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>🖨️</span>
              <span>Print Appraisal Statement</span>
            </button>
          </div>
        </div>

        {/* 4 Financial Metric Tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 pt-1">
          <div className="p-4 bg-gradient-to-br from-emerald-50/70 to-emerald-100/40 rounded-2xl border border-emerald-200/80 shadow-2xs">
            <span className="text-xs text-emerald-800 font-bold block">Total Insurance Replacement Value</span>
            <div className="text-2xl font-black text-emerald-950 mt-1">
              {loading ? "--" : formatCurrency(report?.totalReplacementValue)}
            </div>
            <p className="text-[11px] text-emerald-700 mt-1 font-medium">Estimated fair market replacement</p>
          </div>

          <div className="p-4 bg-gradient-to-br from-indigo-50/70 to-indigo-100/40 rounded-2xl border border-indigo-200/80 shadow-2xs">
            <span className="text-xs text-indigo-800 font-bold block">Total Cataloged Volumes</span>
            <div className="text-2xl font-black text-indigo-950 mt-1">
              {loading ? "--" : report?.totalVolumes.toLocaleString() ?? 0}
            </div>
            <p className="text-[11px] text-indigo-700 mt-1 font-medium">Titles in collection</p>
          </div>

          <div className="p-4 bg-gradient-to-br from-blue-50/70 to-blue-100/40 rounded-2xl border border-blue-200/80 shadow-2xs">
            <span className="text-xs text-blue-800 font-bold block">Average Volume Value</span>
            <div className="text-2xl font-black text-blue-950 mt-1">
              {loading ? "--" : formatCurrency(report?.averageVolumeValue)}
            </div>
            <p className="text-[11px] text-blue-700 mt-1 font-medium">Mean price per title</p>
          </div>

          <div className="p-4 bg-gradient-to-br from-slate-100/70 to-slate-200/40 rounded-2xl border border-slate-300/80 shadow-2xs">
            <span className="text-xs text-slate-700 font-bold block">Total Acquisition Cost</span>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {loading ? "--" : formatCurrency(report?.totalAcquisitionCost)}
            </div>
            <p className="text-[11px] text-slate-600 mt-1 font-medium">Recorded original purchase cost</p>
          </div>
        </div>
      </SurfaceCard>

      {/* Printable Appraisal Document Container */}
      <SurfaceCard className="space-y-6 print:border-none print:shadow-none print:p-0">
        {/* Printable Header */}
        <div className="border-b-2 border-slate-900 pb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              COLOPHON LIBRARY & COLLECTION APPRAISAL
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Personal Property Replacement Valuation Schedule &bull; Valuation Date: {new Date().toLocaleDateString()}
            </p>
          </div>
          <div className="text-right text-xs">
            <span className="text-slate-500 block">Total Replacement Value</span>
            <span className="text-xl font-black text-emerald-800">
              {formatCurrency(report?.totalReplacementValue)}
            </span>
          </div>
        </div>

        {/* Room by Room Summary Table */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <span>📍</span> Location Breakdown by Room
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {report?.roomBreakdown.map((r) => (
              <div key={r.room} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <span className="font-bold text-slate-900 block truncate">{r.room}</span>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                  <span>{r.count} volumes</span>
                  <span className="font-bold text-emerald-800">{formatCurrency(r.totalValue)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* High-Value Items Table ($50+) */}
        {report && report.highValueVolumes.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span>⭐</span> High-Value Volumes ($50+ Schedule)
              </h3>
              <span className="text-[11px] text-amber-800 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                Special Floater / Rider Candidates ({report.highValueVolumes.length})
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-50">
                    <th className="py-2 px-3">Title & Author</th>
                    <th className="py-2 px-3">ISBN</th>
                    <th className="py-2 px-3">Call Number</th>
                    <th className="py-2 px-3">Location</th>
                    <th className="py-2 px-3">Tags & Notes</th>
                    <th className="py-2 px-3 text-right">Replacement Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.highValueVolumes.map((vol) => (
                    <tr key={vol.id} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-bold text-slate-900 min-w-[180px]">
                        {vol.title}
                        <span className="block text-[10px] text-slate-500 font-normal">{vol.author || "Unknown"}</span>
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600">{vol.isbn}</td>
                      <td className="py-2 px-3 font-mono text-indigo-700 font-bold">
                        {vol.deweyDecimal ? `DDC ${vol.deweyDecimal}` : vol.locClassification || "--"}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {vol.roomName ? `${vol.roomName} > ${vol.shelfName}` : "Unassigned"}
                      </td>
                      <td className="py-2 px-3 text-slate-600">{vol.exLibrisTags || vol.personalNotes || "--"}</td>
                      <td className="py-2 px-3 text-right font-black text-emerald-800">
                        {formatCurrency(vol.replacementValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Itemized Full Schedule */}
        <div className="space-y-2 pt-2">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <span>📋</span> Complete Catalog Schedule ({report?.totalVolumes ?? 0} Volumes)
          </h3>

          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-50 sticky top-0">
                  <th className="py-2 px-3">Title & Author</th>
                  <th className="py-2 px-3">ISBN</th>
                  <th className="py-2 px-3">Dewey (DDC)</th>
                  <th className="py-2 px-3">LOC Call #</th>
                  <th className="py-2 px-3">Shelf Location</th>
                  <th className="py-2 px-3 text-right">Replacement Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report?.volumes.map((vol) => (
                  <tr key={vol.id} className="hover:bg-slate-50/70">
                    <td className="py-2 px-3 min-w-[200px]">
                      <p className="font-bold text-slate-900 truncate">{vol.title}</p>
                      <p className="text-[10px] text-slate-500 truncate">{vol.author || "Unknown"}</p>
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-600">{vol.isbn}</td>
                    <td className="py-2 px-3 font-mono font-bold text-indigo-700">{vol.deweyDecimal || "--"}</td>
                    <td className="py-2 px-3 font-mono text-slate-700">{vol.locClassification || "--"}</td>
                    <td className="py-2 px-3 text-slate-600">
                      {vol.roomName ? `${vol.roomName} > ${vol.shelfName}` : "Unassigned"}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-800">
                      {formatCurrency(vol.replacementValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}
