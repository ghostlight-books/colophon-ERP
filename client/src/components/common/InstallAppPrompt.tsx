import React, { useEffect, useState } from "react";

export default function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem("colophon_install_prompt_dismissed") === "true";
  });

  useEffect(() => {
    // Check if already installed / standalone
    const isStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(isStandaloneMode);

    // Detect iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // Listen for Android beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  if (isStandalone || dismissed) return null;
  if (!deferredPrompt && !isIos) return null;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
      }
    } else if (isIos) {
      setShowIosGuide(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("colophon_install_prompt_dismissed", "true");
  };

  return (
    <>
      {/* Floating Bottom App Installation Banner */}
      <div className="fixed bottom-20 lg:bottom-6 left-4 right-4 max-w-md mx-auto z-[9985] bg-gradient-to-r from-slate-900/95 to-indigo-950/95 backdrop-blur-xl text-white p-3.5 rounded-2xl border border-indigo-500/30 shadow-2xl flex items-center justify-between gap-3 animate-slideUp">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/90 border border-indigo-400/40 flex items-center justify-center text-xl shrink-0 shadow-sm">
            🏛️
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-black tracking-tight text-white truncate">Install Colophon App</h4>
            <p className="text-[11px] text-slate-300 truncate">
              Full-screen camera scanning & fast library access
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleInstallClick}
            className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer"
          >
            {isIos ? "Add to Home" : "Install"}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            title="Dismiss"
            className="p-1.5 text-slate-400 hover:text-white transition rounded-lg text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>

      {/* iOS Instructions Modal */}
      {showIosGuide && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 text-white shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📱</span>
                <h3 className="text-sm font-black">Install on iPhone / iPad</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="text-slate-400 hover:text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Install Colophon as a native standalone app with full-screen camera scanning:
            </p>

            <ol className="space-y-3 text-xs text-slate-200">
              <li className="flex items-start gap-2.5 p-2.5 bg-slate-800/80 rounded-xl border border-slate-700">
                <span className="font-black text-indigo-400">1.</span>
                <span>Tap the <strong>Share</strong> button in Safari's toolbar (<span className="text-sm">📤</span>).</span>
              </li>
              <li className="flex items-start gap-2.5 p-2.5 bg-slate-800/80 rounded-xl border border-slate-700">
                <span className="font-black text-indigo-400">2.</span>
                <span>Scroll down and tap <strong>"Add to Home Screen"</strong> (<span className="text-sm">➕</span>).</span>
              </li>
              <li className="flex items-start gap-2.5 p-2.5 bg-slate-800/80 rounded-xl border border-slate-700">
                <span className="font-black text-indigo-400">3.</span>
                <span>Tap <strong>"Add"</strong> in the top right to complete installation.</span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Got It!
            </button>
          </div>
        </div>
      )}
    </>
  );
}

