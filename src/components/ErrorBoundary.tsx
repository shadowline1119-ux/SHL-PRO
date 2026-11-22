import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Nieoczekiwany błąd renderowania aplikacji.',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SHL PRO ErrorBoundary:', error, errorInfo);
  }

  private handleResetView = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  private handleReloadPage = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-900">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-50 text-red-700 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h1 className="font-display text-base font-semibold text-slate-900">
                  Wystąpił nieoczekiwany błąd interfejsu
                </h1>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Twoje kosztorysy zapisane w pamięci lokalnej i bazie SQLite są bezpieczne. Spróbuj przywrócić widok lub odświeżyć aplikację.
                </p>
              </div>
            </div>

            {this.state.errorMessage && (
              <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <summary className="cursor-pointer font-medium text-slate-800">
                  Szczegóły techniczne błędu
                </summary>
                <p className="mt-2 font-mono text-[11px] break-words text-slate-600">
                  {this.state.errorMessage}
                </p>
              </details>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleResetView}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Spróbuj ponownie</span>
              </button>
              <button
                type="button"
                onClick={this.handleReloadPage}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg transition-colors whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Odśwież aplikację</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
