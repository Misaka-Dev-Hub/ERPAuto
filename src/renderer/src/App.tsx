import { useState } from 'react'
import Versions from './components/Versions'
import { ExtractorPage } from './pages/ExtractorPage'
import electronLogo from './assets/electron.svg'

type Page = 'home' | 'extractor' | 'cleaner'

function App(): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState<Page>('home')

  const renderPage = () => {
    switch (currentPage) {
      case 'extractor':
        return <ExtractorPage />
      default:
        return (
          <>
            <img alt="logo" className="logo" src={electronLogo} />
            <div className="creator">Powered by electron-vite</div>
            <div className="text">
              Build an Electron app with <span className="react">React</span>
              &nbsp;and <span className="ts">TypeScript</span>
            </div>
            <p className="tip">
              Please try pressing <code>F12</code> to open the devTool
            </p>
            <div className="actions">
              <div className="action">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setCurrentPage('extractor')
                  }}
                >
                  数据提取
                </a>
              </div>
              <div className="action">
                <a href="https://electron-vite.org/" target="_blank" rel="noreferrer">
                  Documentation
                </a>
              </div>
            </div>
            <Versions />
          </>
        )
    }
  }

  return (
    <div className="app">
      {currentPage !== 'home' && (
        <nav className="nav">
          <button className="nav-btn" onClick={() => setCurrentPage('home')}>
            ← 返回主页
          </button>
        </nav>
      )}
      {renderPage()}
      <style>{`
        .app {
          min-height: 100vh;
          background: #f5f7fa;
        }
        .nav {
          background: #fff;
          padding: 12px 24px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .nav-btn {
          background: #1890ff;
          color: #fff;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.3s;
        }
        .nav-btn:hover {
          background: #40a9ff;
        }
      `}</style>
    </div>
  )
}

export default App
