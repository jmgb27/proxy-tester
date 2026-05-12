"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useProxyTesterStore } from "@/store/proxy";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { copyTextToClipboard } from "@/lib/clipboard-write";
import { formatUnknownError } from "@/lib/format-error";
import { saveTextWithPicker } from "@/lib/save-text-file";
import {
  filterByStatus,
  scopeLabel,
  toCsv,
  toRawLines,
  type ExportScope,
} from "@/lib/export-tested-proxies";

const COPY_SCOPES: ExportScope[] = ["all", "ok", "fail"];
const TXT_SCOPES: ExportScope[] = ["all", "ok", "fail"];

const MENU_WIDTH = 260;
const MENU_GAP = 8;

function scopeTitle(scope: ExportScope, action: "copy" | "download"): string {
  const label = scopeLabel(scope);
  if (action === "copy") {
    return scope === "all" ? "Copy all" : `Copy ${label} only`;
  }
  return scope === "all" ? "Download .txt (all)" : `Download .txt (${label} only)`;
}

function exportFilename(scope: ExportScope, ext: "txt" | "csv"): string {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  const scopePart = scope === "all" ? "all" : scopeLabel(scope).replace(/\s+/g, "-");
  return `proxy-export-${date}-${scopePart}.${ext}`;
}

type MenuCoords = { top: number; left: number };

export default function ExportResultsMenu() {
  const { testedProxies, testStatus } = useProxyTesterStore();
  const [open, setOpen] = useState(false);
  const [menuCoords, setMenuCoords] = useState<MenuCoords | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const blocked =
    testStatus === "testing" || testStatus === "stopping" || testedProxies.length === 0;

  useEffect(() => {
    if (blocked) setOpen(false);
  }, [blocked]);

  const updateMenuPosition = useCallback(() => {
    const trigger = wrapRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    let left = rect.right - MENU_WIDTH;
    left = Math.max(MENU_GAP, Math.min(left, window.innerWidth - MENU_WIDTH - MENU_GAP));

    const estimatedHeight = 360;
    const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP;
    let top = rect.bottom + MENU_GAP;
    if (spaceBelow < estimatedHeight && rect.top > estimatedHeight * 0.45) {
      top = rect.top - estimatedHeight - MENU_GAP;
    }
    top = Math.max(MENU_GAP, Math.min(top, window.innerHeight - estimatedHeight - MENU_GAP));

    setMenuCoords({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open || blocked) {
      setMenuCoords(null);
      return;
    }
    updateMenuPosition();
  }, [open, blocked, updateMenuPosition]);

  useEffect(() => {
    if (!open || blocked) return;
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, blocked, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const t = event.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const handleCopy = async (scope: ExportScope) => {
    const list = filterByStatus(testedProxies, scope);
    const text = toRawLines(list);
    if (!text) {
      toast.error("Nothing to copy", {
        description: `No ${scopeLabel(scope)} proxies in the results.`,
      });
      return;
    }
    try {
      await copyTextToClipboard(text);
      toast.success(`Copied ${list.length} ${list.length === 1 ? "proxy" : "proxies"}`, {
        description: `${scopeLabel(scope)} — raw lines`,
      });
      setOpen(false);
    } catch {
      toast.error("Could not copy", {
        description: "Clipboard access was blocked or unavailable.",
      });
    }
  };

  const handleDownloadTxt = async (scope: ExportScope) => {
    const list = filterByStatus(testedProxies, scope);
    const text = toRawLines(list);
    if (!text) {
      toast.error("Nothing to download", {
        description: `No ${scopeLabel(scope)} proxies in the results.`,
      });
      return;
    }
    const filename = exportFilename(scope, "txt");
    try {
      const outcome = await saveTextWithPicker(filename, text, "txt");
      if (outcome === "cancelled") return;
      toast.success(`Saved ${list.length} ${list.length === 1 ? "proxy" : "proxies"}`, {
        description: filename,
      });
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Could not save file", {
        description: formatUnknownError(err),
      });
    }
  };

  const handleDownloadCsv = async () => {
    const list = filterByStatus(testedProxies, "all");
    const csv = toCsv(list);
    const filename = exportFilename("all", "csv");
    try {
      const outcome = await saveTextWithPicker(filename, csv, "csv");
      if (outcome === "cancelled") return;
      toast.success("CSV saved", {
        description: filename,
      });
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Could not save file", {
        description: formatUnknownError(err),
      });
    }
  };

  const disabledReason =
    testedProxies.length === 0
      ? "Run a test first to export results"
      : testStatus === "testing" || testStatus === "stopping"
        ? "Wait until the test finishes"
        : undefined;

  const triggerButton = (
    <Button
      type="button"
      variant="ghost"
      size="lg"
      disabled={blocked}
      onClick={() => !blocked && setOpen((v) => !v)}
      className={
        blocked ? "text-gray-500" : "text-gray-400 hover:text-white"
      }
      aria-expanded={open}
      aria-haspopup="menu"
    >
      <Download className="w-4 h-4 mr-2" />
      Export
    </Button>
  );

  const menuPanel =
    open &&
    !blocked &&
    menuCoords &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={menuRef}
        role="menu"
        style={{
          position: "fixed",
          top: menuCoords.top,
          left: menuCoords.left,
          width: MENU_WIDTH,
          zIndex: 200,
        }}
        className="max-h-[min(70vh,calc(100vh-24px))] overflow-y-auto rounded-2xl border border-white/20 bg-[rgba(255,255,255,0.01)] shadow-lg backdrop-blur-3xl"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        >
          <div className="border-b border-white/10 px-3 py-3">
            <div className="flex items-center gap-2">
              <Download className="text-accent size-5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Export results</p>
                <p className="text-xs text-gray-400 leading-snug">
                  Raw lines match Load Proxies / paste import
                </p>
              </div>
            </div>
          </div>

          <div className="px-1 py-2">
            <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Copy
            </p>
            {COPY_SCOPES.map((scope) => (
              <button
                key={`copy-${scope}`}
                type="button"
                role="menuitem"
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-white/90 transition-colors hover:bg-white/5"
                onClick={() => void handleCopy(scope)}
              >
                {scopeTitle(scope, "copy")}
              </button>
            ))}

            <div className="my-2 border-t border-white/10" />

            <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Download .txt
            </p>
            {TXT_SCOPES.map((scope) => (
              <button
                key={`txt-${scope}`}
                type="button"
                role="menuitem"
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-white/90 transition-colors hover:bg-white/5"
                onClick={() => handleDownloadTxt(scope)}
              >
                {scopeTitle(scope, "download")}
              </button>
            ))}

            <div className="my-2 border-t border-white/10" />

            <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Spreadsheet
            </p>
            <button
              type="button"
              role="menuitem"
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-white/90 transition-colors hover:bg-white/5"
              onClick={handleDownloadCsv}
            >
              Download CSV (all columns)
            </button>
          </div>
        </motion.div>
      </div>,
      document.body
    );

  return (
    <div className="relative" ref={wrapRef}>
      {blocked && disabledReason ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">{triggerButton}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{disabledReason}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        triggerButton
      )}

      {menuPanel}
    </div>
  );
}
