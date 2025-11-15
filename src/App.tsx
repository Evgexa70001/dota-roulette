import { HeroRoulette } from './components/HeroRoulette';
import './App.css';

const withBase = (relativePath: string) => {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/$/, '')}/${relativePath.replace(/^\//, '')}`;
};

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <span className="title-icon">🎰</span>
          Dota 2 Hero Roulette
          <span className="title-icon">🎯</span>
        </h1>
      </header>

      <main className="app-main">
        <HeroRoulette />
      </main>

      <footer className="app-footer">
        <p>
          Dota 2 Hero Roulette by{' '}
          <a 
            href="https://steamcommunity.com/profiles/76561198445739005/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="footer-link"
          >
            @Evgexa
          </a>
          {' '}© 2025
        </p>
        <div className="stratz-credit">
          <span>API:</span>
          <a 
            href="https://stratz.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="stratz-link"
          >
            <img 
              src={withBase('stratz.png')} 
              alt="STRATZ" 
              className="stratz-logo"
            />
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App;
