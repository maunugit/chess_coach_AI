import React from 'react';
import ChessCoach from './ChessCoach';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-chess-primary shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-white">Chess Coach AI</h1>
        </div>
      </nav>
      <main>
        <ChessCoach />
      </main>
    </div>
  );
}

export default App;