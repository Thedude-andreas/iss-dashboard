import './App.css'
import { IssDashboard } from './pages/IssDashboard'

const appVersion = __APP_VERSION__

function App() {
  return (
    <div className="site-shell">
      <header className="site-nav">
        <a href="https://andreasmartensson.com" className="logo">
          andreasmartensson.com
        </a>
        <nav>
          <a href="https://andreasmartensson.com">Home</a>
          <a href="https://tempsense.andreasmartensson.com" target="_blank" rel="noreferrer">
            Tempsense
          </a>
        </nav>
      </header>
      <main>
        <IssDashboard />
      </main>
      <footer className="site-footer">
        <p>© {new Date().getFullYear()} Andreas Martensson · ISS dashboard</p>
        <p>Build {appVersion}</p>
      </footer>
    </div>
  )
}

export default App
