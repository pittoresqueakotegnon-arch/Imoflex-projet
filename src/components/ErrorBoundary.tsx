import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  errorStack: string;
}

/**
 * Filet de sécurité global : si un composant plante au rendu, on affiche
 * un écran de secours avec un bouton "Réessayer" au lieu de l'écran blanc
 * total (crash silencieux). Important pour le taux de crash surveillé
 * par Google Play une fois l'app publiée.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '', errorStack: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? (error.stack || '') : '';
    return { hasError: true, errorMessage: message, errorStack: stack };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // Log complet pour débogage (console browser + Sentry si intégré)
    console.error('═══════════════════════════════════════');
    console.error('ErrorBoundary — Crash intercepté :');
    console.error('Erreur :', error);
    console.error('Stack component :', info.componentStack);
    console.error('═══════════════════════════════════════');
  }

  handleReload = () => {
    this.setState({ hasError: false, errorMessage: '', errorStack: '' });
    window.location.href = '/';
  };

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '', errorStack: '' });
  };

  render() {
    const isDev = import.meta.env.DEV;

    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center min-h-screen px-6 text-center gap-4"
          style={{ background: '#0B0819', color: 'var(--imx-text-primary)' }}
        >
          <p className="text-lg font-bold" style={{ fontFamily: 'Space Grotesk' }}>
            Une erreur est survenue
          </p>
          <p className="text-sm opacity-70">
            Quelque chose s'est mal passé. Réessayez, ou revenez à l'accueil.
          </p>

          {/* Détails en mode développement uniquement */}
          {isDev && this.state.errorMessage && (
            <div
              className="w-full max-w-sm text-left rounded-xl p-4 mt-2 text-xs overflow-auto max-h-48"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5', fontFamily: 'monospace' }}
            >
              <p className="font-bold mb-1">⚠ {this.state.errorMessage}</p>
              {this.state.errorStack && (
                <pre className="whitespace-pre-wrap opacity-70 text-[10px]">
                  {this.state.errorStack.slice(0, 600)}
                </pre>
              )}
            </div>
          )}

          <div className="flex gap-3 mt-2">
            <button
              onClick={this.handleRetry}
              className="px-5 py-3 rounded-xl font-semibold text-sm"
              style={{ background: 'rgba(123,63,228,0.2)', color: 'var(--imx-accent-light)', border: '1px solid rgba(123,63,228,0.4)' }}
            >
              Réessayer
            </button>
            <button
              onClick={this.handleReload}
              className="px-5 py-3 rounded-xl font-semibold text-sm"
              style={{ background: 'var(--imx-accent)', color: 'white' }}
            >
              Retour à l'accueil
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

