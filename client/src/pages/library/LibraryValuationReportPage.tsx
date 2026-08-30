import { useEffect, useState } from "react";
import LibrarySpaceSwitcher from "../../components/library/LibrarySpaceSwitcher";
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
    <div className="space-y-6 pb-24 font-sans max-w-4xl mx-auto">
      {/* 1. Header Bar: Location Switcher & Action */}
      <div className="flex items-center justify-between gap-3 pt-1 flex-wrap print:hidden">
        <LibrarySpaceSwitcher />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!report || report.volumes.length === 0}
            className="px-3.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-800 dark:text-slate-200 font-medium text-xs rounded-2xl border border-slate-300 dark:border-slate-700 shadow-2xs transition cursor-pointer"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!report || report.volumes.length === 0}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium text-xs rounded-2xl transition shadow-2xs cursor-pointer"
          >
            Print Appraisal
          </button>
        </div>
      </div>

      {/* 2. Top Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Total Insured Value
          </p>
          <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
            {formatCurrency(report?.totalReplacementValue)}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            Replacement cost
          </p>
        </div>

        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Historical Cost Basis
          </p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">
            {formatCurrency(report?.totalAcquisitionCost)}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            Acquisition spend
          </p>
        </div>

        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Average Volume Value
          </p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-indigo-400">
            {formatCurrency(report?.averageVolumeValue)}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            Per cataloged book
          </p>
        </div>

        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Valued Volumes
          </p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">
            {report?.volumes.length || 0}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            Items on registry
          </p>
        </div>
      </div>

      {/* 3. Valuation Table Card */}
      <div className="p-4 sm:p-5 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold text-slate-800 dark:text-white uppercase tracking-wider">
            Catalog Appraisal Schedule ({report?.volumes.length || 0})
          </h3>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs">Generating appraisal schedule...</div>
        ) : !report || report.volumes.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 space-y-2">
            <p className="text-xs font-semibold text-slate-800 dark:text-white">No catalog volumes recorded.</p>
            <p className="text-[11px] text-slate-500">Add or scan books into your library to generate an appraisal schedule.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-medium">
                  <th className="py-2.5 px-3">Title & Author</th>
                  <th className="py-2.5 px-3">ISBN</th>
                  <th className="py-2.5 px-3">Call / DDC</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3 text-right">Cost</th>
                  <th className="py-2.5 px-3 text-right">Appraised Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {report.volumes.map((vol) => (
                  <tr key={vol.id} className="hover:bg-white/60 dark:hover:bg-slate-700/60 transition">
                    <td className="py-2.5 px-3 min-w-[200px]">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">{vol.title}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal truncate">{vol.author || "Unknown"}</p>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 font-normal">{vol.isbn}</td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-normal">
                      {vol.deweyDecimal ? `DDC ${vol.deweyDecimal}` : vol.locClassification || "--"}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 font-normal">
                      {vol.roomName ? `${vol.roomName} > ${vol.shelfName || "Shelf"}` : "Unassigned"}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-500 dark:text-slate-400 font-normal">
                      {formatCurrency(vol.acquisitionPrice)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(vol.replacementValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
