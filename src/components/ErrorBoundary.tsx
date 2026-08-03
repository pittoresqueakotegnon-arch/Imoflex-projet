import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
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
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // On garde une trace en console pour le débogage (pas d'envoi externe ici).
    console.error('ErrorBoundary a intercepté une erreur:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center min-h-screen px-6 text-center gap-4"
          style={{ background: '#0B0819', color: '#E8E0FF' }}
        >
          <p className="text-lg font-bold" style={{ fontFamily: 'Space Grotesk' }}>
            Une erreur est survenue
          </p>
          <p className="text-sm opacity-70">
            Quelque chose s'est mal passé. Réessayez, ou revenez à l'accueil.
          </p>
          <button
            onClick={this.handleReload}
            className="px-6 py-3 rounded-xl font-semibold"
            style={{ background: '#7B3FE4', color: 'white' }}
          >
            Retour à l'accueil
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
