import React, { useState, useEffect, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { analyzePosition, AnalysisWebSocket } from './api';

const ChessCoach = () => {
  const [game, setGame] = useState(new Chess());
  const [moveHistory, setMoveHistory] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [ws, setWs] = useState(null);
  const [arrows, setArrows] = useState([]);
  const [showBestMove, setShowBestMove] = useState(false);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [moves, setMoves] = useState([]);
  const [isReviewMode, setIsReviewMode] = useState(false);

  // PGN input to review games
  const [pgnInput, setPgnInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Test backend connection
    fetch('http://localhost:8000/health')
      .then(response => response.json())
      .then(data => console.log('Backend health check:', data))
      .catch(error => console.error('Backend connection failed:', error));
  }, []);

  // Initialize WebSocket connection
  useEffect(() => {
    const analysisWs = new AnalysisWebSocket((analysis) => {
      setAnalysis(analysis);
      setIsAnalyzing(false);
    });
    
    analysisWs.connect();
    setWs(analysisWs);

    return () => {
      analysisWs.disconnect();
    };
  }, []);

  const loadGame = () => {
    try {
      const newGame = new Chess();
      newGame.loadPgn(pgnInput);

      // Extract moves from game
      const history = newGame.history({ verbose: true });

      // Reset the game to starting position to begin analysis
      setGame(new Chess());
      setMoves(history);
      setCurrentMoveIndex(0);
      setIsReviewMode(true);
      setErrorMessage('');

      // Reset move history
      setMoveHistory(newGame.history());
    } catch (error) {
      setErrorMessage('Invalid PGN format. Please check your input')
      console.error('Error loading PGN:', error);
    }
  }

  // Navigate through each move from PGN
  const goToMove = (index) => {
    const newGame = new Chess();

    // Apply all moves up to the index
    for (let i = 0; i <= index && i < moves.length; i++) {
      newGame.move(moves[i]);
    }

    setGame(newGame);
    setCurrentMoveIndex(index);
    setShowBestMove(false);
  };

  const goToNextMove = () => {
    if (currentMoveIndex < moves.length - 1) { // If there are more moves to come
      goToMove(currentMoveIndex + 1);
    }
  };

  const goToPreviousMove = () => {
    if (currentMoveIndex > 0) {
      goToMove(currentMoveIndex - 1); // Go back one move
    }
  };
  // Function to convert chess notation to arrow coordinates
  const bestMoveToArrow = (move) => {
    if (!move || move.length < 4) return [];
    
    // Handle special cases like castling
    if (move === 'e1g1') return [['e1', 'g1', 'rgb(0, 128, 255)']]; // White kingside castle
    if (move === 'e1c1') return [['e1', 'c1', 'rgb(0, 128, 255)']]; // White queenside castle
    if (move === 'e8g8') return [['e8', 'g8', 'rgb(0, 128, 255)']]; // Black kingside castle
    if (move === 'e8c8') return [['e8', 'c8', 'rgb(0, 128, 255)']]; // Black queenside castle

    // Regular moves
    const from = move.substring(0, 2);
    const to = move.substring(2, 4);
    return [[from, to, 'rgb(0, 128, 255)']];
  };

  useEffect(() => {
    if (showBestMove && analysis && analysis.best_move) {
      setArrows(bestMoveToArrow(analysis.best_move));
    } else {
      setArrows([]);
    }
  }, [analysis, showBestMove]);

  // Clear arrows on new move
  function makeMove(move) {
    const gameCopy = new Chess(game.fen());
    
    try {
      const result = gameCopy.move(move);
      if (result) {
        setGame(gameCopy);
        setMoveHistory([...moveHistory, result.san]);
        setShowBestMove(false); // Hide arrows when a move is made
        return true;
      }
    } catch (error) {
      return false;
    }
    return false;
  }

  // Function to request position analysis
  const requestAnalysis = useCallback(async () => {
    setIsAnalyzing(true);
    try {
      if (ws) {
        ws.analyze(game.fen());
      } else {
        const result = await analyzePosition(game.fen());
        setAnalysis(result);
        setIsAnalyzing(false);
      }
    } catch (error) {
      console.error('Analysis failed:', error);
      setIsAnalyzing(false);
    }
  }, [game, ws]);

  // Request analysis after each move
  useEffect(() => {
    requestAnalysis();
  }, [game.fen(), requestAnalysis]);

  function onDrop(sourceSquare, targetSquare) {
    const move = makeMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q'
    });
    return move;
  }

  function resetGame() {
    setGame(new Chess());
    setMoveHistory([]);
    setShowBestMove(false);
  }
  // Format move history with move numbers
  const formattedMoveHistory = moveHistory.map((move, index) => {
    if (index % 2 === 0) {
      return `${Math.floor(index / 2) + 1}. ${move}`;
    }
    return move;
  }).join(' ');

  const renderAnalysis = () => {
    if (isAnalyzing) {
      return (
        <div className="flex items-center justify-center p-4">
          <div className="animate-pulse text-sm text-gray-500">Analyzing position...</div>
        </div>
      );
    }
    
    if (!analysis) {
      return (
        <div className="p-4 text-sm text-gray-500">
          No analysis available
        </div>
      );
    }
  
    // Function to format the evaluation score
    const formatEvaluation = (score) => {
      if (score === 0) return "0.00";
      return score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
    };
  
    // Function to determine text color based on evaluation
    const getEvaluationColor = (score) => {
      if (score === 0) return "text-gray-700";
      return score > 0 ? "text-green-600" : "text-red-600";
    };
  
    return (
      <div className="space-y-4">
        {/* Position Evaluation */}
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-600">Position Evaluation:</span>
            <span className={`text-lg font-bold ${getEvaluationColor(analysis.evaluation)}`}>
              {analysis.is_mate 
                ? `Mate in ${Math.abs(analysis.mate_in)}` 
                : formatEvaluation(analysis.evaluation)
              }
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {analysis.evaluation > 0 ? "White is better" : 
             analysis.evaluation < 0 ? "Black is better" : 
             "Equal position"}
          </div>
        </div>

        {/* Best Move Section */}
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-blue-800">Engine's Best Move:</span>
            <button
              onClick={() => setShowBestMove(!showBestMove)}
              className={`px-3 py-1 rounded-lg text-sm transition-colors duration-200 ${
                showBestMove 
                  ? 'bg-blue-500 text-white hover:bg-blue-600' 
                  : 'bg-blue-200 text-blue-800 hover:bg-blue-300'
              }`}
            >
              {showBestMove ? 'Hide Arrow' : 'Show Arrow'}
            </button>
          </div>
          <div className="font-mono text-lg font-bold text-blue-900">
            {analysis.best_move}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* PGN Input Section */}
      <div className="mb-8 bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Load Chess Game
          </h2>
          <div className="space-y-4">
            <textarea
              value={pgnInput}
              onChange={(e) => setPgnInput(e.target.value)}
              placeholder="Paste your PGN here..."
              className="w-full h-32 p-3 border rounded-lg font-mono text-sm"
            />
            {errorMessage && (
              <div className="text-red-500 text-sm">{errorMessage}</div>
            )}
            <button
              onClick={loadGame}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 
                       transition-colors duration-200 shadow-sm"
            >
              Load Game
            </button>
          </div>
        </div>


        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Chess Board Section */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="max-w-[600px] mx-auto">
              <Chessboard 
                position={game.fen()} 
                onPieceDrop={onDrop}
                boardWidth={600}
                customArrows={arrows}
                arePremovesAllowed={false}
                customBoardStyle={{
                  borderRadius: '4px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                }}
              />
            </div>

             {/* Game Navigation Controls */}
             {isReviewMode && (
              <div className="mt-4 flex justify-center items-center space-x-4">
                <button
                  onClick={() => goToMove(0)}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                >
                  ≪ Start
                </button>
                <button
                  onClick={goToPreviousMove}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                >
                  ← Previous
                </button>
                <span className="text-gray-700">
                  Move {currentMoveIndex + 1} of {moves.length}
                </span>
                <button
                  onClick={goToNextMove}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                >
                  Next →
                </button>
                <button
                  onClick={() => goToMove(moves.length - 1)}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                >
                  End ≫
                </button>
              </div>
            )}
            
            <div className="mt-4 flex justify-center space-x-4">
              <button 
                onClick={resetGame}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 
                         transition-colors duration-200 shadow-sm"
              >
                Reset Game
              </button>
              {!isReviewMode && (
                <button 
                  onClick={() => {
                    game.undo();
                    setGame(new Chess(game.fen()));
                  }}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 
                           transition-colors duration-200 shadow-sm"
                >
                  Undo Move
                </button>
              )}
            </div>
          </div>

          {/* Analysis Panel */}
          <div className="space-y-6">
            {/* Position Info */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Position Analysis
              </h2>
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-500 mb-1">
                    Current Position (FEN)
                  </h3>
                  <p className="text-sm font-mono break-all text-gray-700">
                    {game.fen()}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-500 mb-1">
                    Game Status
                  </h3>
                  <p className="text-sm text-gray-700">
                    {game.isCheckmate() ? "Checkmate!" : 
                     game.isDraw() ? "Draw" :
                     game.isCheck() ? "Check!" :
                     `${game.turn() === 'w' ? 'White' : 'Black'} to move`}
                  </p>
                </div>
              </div>
            </div>

            {/* Move History */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Move History
              </h2>
              <div className="p-4 bg-gray-50 rounded-lg min-h-[100px] font-mono text-sm">
                {formattedMoveHistory || "No moves played"}
              </div>
            </div>

            {/* Engine Analysis */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Engine Analysis
              </h2>
              <div className="bg-gray-50 rounded-lg">
                {renderAnalysis()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChessCoach;