import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Si è verificato un errore imprevisto.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught error:', error);
  }

  render() {
    if (this.state.hasError) {
      let friendlyMessage = this.state.message;
      if (this.state.message.startsWith('{')) {
        try {
          const parsed = JSON.parse(this.state.message) as { error?: string; operationType?: string };
          friendlyMessage = `Errore di accesso ai dati (${parsed.operationType ?? 'operazione'}): ${parsed.error ?? 'permessi insufficienti'}`;
        } catch {
          // keep original message
        }
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8">
            <h1 className="text-xl font-bold text-slate-900 mb-2">
              Qualcosa è andato storto
            </h1>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              {friendlyMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Ricarica l&apos;applicazione
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
