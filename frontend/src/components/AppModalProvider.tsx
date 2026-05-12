"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = ปุ่มยืนยันโทนแดง (ลบ ฯลฯ) */
  variant?: "danger" | "default";
};

export type AlertOptions = {
  title?: string;
  message: string;
  okLabel?: string;
};

type ModalState =
  | null
  | {
      kind: "confirm";
      title?: string;
      message: string;
      confirmLabel: string;
      cancelLabel: string;
      variant: "danger" | "default";
      resolve: (value: boolean) => void;
    }
  | {
      kind: "alert";
      title?: string;
      message: string;
      okLabel: string;
      resolve: () => void;
    };

type AppModalContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<void>;
};

const AppModalContext = createContext<AppModalContextValue | null>(null);

export function useAppModal(): AppModalContextValue {
  const ctx = useContext(AppModalContext);
  if (!ctx) {
    throw new Error("useAppModal must be used within AppModalProvider");
  }
  return ctx;
}

export function AppModalProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ModalState>(null);
  const titleId = useId();
  const descId = useId();

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({
        kind: "confirm",
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? "ยืนยัน",
        cancelLabel: options.cancelLabel ?? "ยกเลิก",
        variant: options.variant ?? "default",
        resolve,
      });
    });
  }, []);

  const alert = useCallback((options: AlertOptions) => {
    return new Promise<void>((resolve) => {
      setState({
        kind: "alert",
        title: options.title,
        message: options.message,
        okLabel: options.okLabel ?? "ตกลง",
        resolve: () => resolve(),
      });
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (state.kind === "confirm") {
        const r = state.resolve;
        setState(null);
        r(false);
      } else {
        const r = state.resolve;
        setState(null);
        r();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [state]);

  const value = useMemo(() => ({ confirm, alert }), [confirm, alert]);

  function finishConfirm(ok: boolean) {
    if (state?.kind !== "confirm") return;
    const r = state.resolve;
    setState(null);
    r(ok);
  }

  function finishAlert() {
    if (state?.kind !== "alert") return;
    const r = state.resolve;
    setState(null);
    r();
  }

  return (
    <AppModalContext.Provider value={value}>
      {children}
      {state ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:p-4"
          role="presentation"
        >
          <button
            type="button"
            aria-label="ปิด"
            className="absolute inset-0 bg-stone-950/50 backdrop-blur-[1px] dark:bg-black/60"
            onClick={() => (state.kind === "confirm" ? finishConfirm(false) : finishAlert())}
          />
          <div
            role={state.kind === "alert" ? "alertdialog" : "dialog"}
            aria-modal="true"
            aria-labelledby={state.title ? titleId : undefined}
            aria-describedby={descId}
            className="relative z-10 w-full max-w-md rounded-t-3xl border border-stone-200/90 bg-white p-6 shadow-xl shadow-stone-900/15 dark:border-zinc-700 dark:bg-zinc-900 sm:rounded-3xl"
          >
            {state.title ? (
              <h2 id={titleId} className="text-lg font-bold text-stone-900 dark:text-stone-50">
                {state.title}
              </h2>
            ) : null}
            <p
              id={descId}
              className={`whitespace-pre-wrap text-sm leading-relaxed text-stone-700 dark:text-stone-300 ${state.title ? "mt-3" : ""}`}
            >
              {state.message}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              {state.kind === "confirm" ? (
                <>
                  <button
                    type="button"
                    onClick={() => finishConfirm(false)}
                    className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-100 dark:border-zinc-600 dark:text-stone-200 dark:hover:bg-zinc-800"
                  >
                    {state.cancelLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => finishConfirm(true)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${
                      state.variant === "danger"
                        ? "bg-rose-600 hover:bg-rose-500"
                        : "bg-teal-600 hover:bg-teal-500"
                    }`}
                  >
                    {state.confirmLabel}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={finishAlert}
                  className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"
                >
                  {state.okLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </AppModalContext.Provider>
  );
}
