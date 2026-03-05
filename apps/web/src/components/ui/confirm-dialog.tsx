"use client";

import { useState, useCallback, createContext, useContext, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "./modal";

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (value: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback(
    (opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) => {
        setState({ ...opts, resolve });
      }),
    []
  );

  const handleClose = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <Modal
          open
          onClose={() => handleClose(false)}
          title={state.title}
          size="sm"
          footer={
            <>
              <button className="btn-secondary" onClick={() => handleClose(false)}>
                Cancelar
              </button>
              <button
                className={state.danger ? "btn-danger" : "btn-primary"}
                onClick={() => handleClose(true)}
              >
                {state.confirmLabel ?? "Confirmar"}
              </button>
            </>
          }
        >
          <div className="flex gap-4">
            {state.danger && (
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
            )}
            <p className="text-sm text-gray-600 dark:text-gray-300">{state.message}</p>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx.confirm;
}
