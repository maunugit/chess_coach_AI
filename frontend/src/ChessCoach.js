import React, { useState, useEffect, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { analyzePosition, AnalysisWebSocket } from './api';
import EvaluationBar from './EvaluationBar';

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
  const [playerColor, setPlayerColor] = useState('white');

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

  const handleColorSelect = (color) => {
    setPlayerColor(color);
  };

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
    <div className="h-screen bg-gray-100 p-4 overflow-hidden">
      <div className="h-full grid grid-cols-12 gap-4">
      {/* Left Panel - Game Controls & PGN Input */}
      <div className="col-span-3 space-y-4 overflow-y-auto">
          {/* Color Selection */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-lg font-semibold mb-2">Playing As</h2>
            <div className="flex space-x-2">
            <button
              onClick={() => handleColorSelect('white')}
              className={`flex-1 py-2 rounded-lg flex items-center justify-center space-x-1 ${
                playerColor === 'white'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <div className="w-3 h-3 rounded-full bg-white border-2 border-gray-300" />
              <span>White</span>
            </button>
            <button
              onClick={() => handleColorSelect('black')}
              className={`flex-1 py-2 rounded-lg flex items-center justify-center space-x-1 ${
                playerColor === 'black'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <div className="w-3 h-3 rounded-full bg-gray-800 border-2 border-gray-300" />
                <span>Black</span>
              </button>
            </div>
          </div>

      {/* PGN Input */}
      <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-lg font-semibold mb-2">Load Game</h2>
            <textarea
              value={pgnInput}
              onChange={(e) => setPgnInput(e.target.value)}
              placeholder="Paste your PGN here..."
              className="w-full h-24 text-xs p-2 border rounded-lg font-mono"
            />
            {errorMessage && (
              <div className="text-red-500 text-xs mt-1">{errorMessage}</div>
            )}
            <button
              onClick={loadGame}
              className="mt-2 w-full py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600"
            >
              Load Game
            </button>
          </div>

          {/* Move History */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-lg font-semibold mb-2">Move History</h2>
            <div className="h-48 overflow-y-auto p-2 bg-gray-50 rounded-lg font-mono text-xs">
              {formattedMoveHistory || "No moves played"}
            </div>
          </div>
        </div>

        {/* Center Panel - Chessboard */}
        <div className="col-span-6 flex flex-col">
          <div className="bg-white rounded-lg shadow-sm p-4 flex-grow flex flex-col">
            <div className="flex-grow relative flex items-center justify-center">
              <div className="w-full max-w-2xl">
                <div className="flex">
                  <EvaluationBar 
                    evaluation={analysis?.evaluation || 0}
                    isMate={analysis?.is_mate || false}
                    mateIn={analysis?.mate_in || 0}
                    isReviewMode={isReviewMode}
                  />
                  <div className="flex-1">
                    <Chessboard 
                      position={game.fen()} 
                      onPieceDrop={onDrop}
                      customArrows={arrows}
                      arePremovesAllowed={false}
                      boardOrientation={playerColor}
                      customBoardStyle={{
                        borderRadius: '4px',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Game Controls */}
            <div className="mt-4 flex justify-center space-x-2">
              {isReviewMode ? (
                <>
                  <button onClick={() => goToMove(0)} className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600">≪</button>
                  <button onClick={goToPreviousMove} className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600">←</button>
                  <span className="px-3 py-1 text-sm">{currentMoveIndex + 1}/{moves.length}</span>
                  <button onClick={goToNextMove} className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600">→</button>
                  <button onClick={() => goToMove(moves.length - 1)} className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600">≫</button>
                </>
              ) : (
                <>
                  <button onClick={resetGame} className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600">Reset</button>
                  <button 
                    onClick={() => {
                      game.undo();
                      setGame(new Chess(game.fen()));
                    }}
                    className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
                  >
                    Undo
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Analysis */}
        <div className="col-span-3 space-y-4 overflow-y-auto">
          {/* Position Info */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-lg font-semibold mb-2">Position Info</h2>
            <div className="space-y-2">
              <div className="p-2 bg-gray-50 rounded">
                <div className="text-xs font-medium text-gray-500">Status</div>
                <div className="text-sm">
                  {game.isCheckmate() ? "Checkmate!" : 
                   game.isDraw() ? "Draw" :
                   game.isCheck() ? "Check!" :
                   `${game.turn() === 'w' ? 'White' : 'Black'} to move`}
                </div>
              </div>
              <div className="p-2 bg-gray-50 rounded">
                <div className="text-xs font-medium text-gray-500">FEN</div>
                <div className="text-xs font-mono break-all">{game.fen()}</div>
              </div>
            </div>
          </div>

          {/* Engine Analysis */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-lg font-semibold mb-2">Engine Analysis</h2>
            {isAnalyzing ? (
              <div className="text-sm text-gray-500 animate-pulse">Analyzing...</div>
            ) : analysis ? (
              <div className="space-y-3">
                <div className="p-2 bg-gray-50 rounded">
                <div className="text-xs font-medium text-gray-500">Evaluation</div>
                  <div className={`text-lg font-bold ${
                    analysis.is_mate ? 'text-purple-600' :
                    analysis.evaluation > 0 ? 'text-green-600' :
                    analysis.evaluation < 0 ? 'text-red-600' :
                    'text-gray-600'
                  }`}>
                    {analysis.is_mate 
                      ? `M${Math.abs(analysis.mate_in)}`
                      : (analysis.evaluation > 0 ? '+' : '') + analysis.evaluation.toFixed(2)
                    }
                  </div>
                  <div className="mt-1 text-sm">
                    {analysis.is_mate ? (
                      <span className={analysis.mate_in > 0 ? 'text-green-600' : 'text-red-600'}>
                        {analysis.mate_in > 0 ? 'White' : 'Black'} can force mate in {Math.abs(analysis.mate_in)}
                      </span>
                    ) : (
                      <>
                        {Math.abs(analysis.evaluation) < 0.3 ? (
                          <span className="text-gray-600">Position is equal</span>
                        ) : Math.abs(analysis.evaluation) < 1.5 ? (
                          <span className={analysis.evaluation > 0 ? 'text-green-600' : 'text-red-600'}>
                            {analysis.evaluation > 0 ? 'White' : 'Black'} has a slight advantage
                          </span>
                        ) : Math.abs(analysis.evaluation) < 3 ? (
                          <span className={analysis.evaluation > 0 ? 'text-green-600' : 'text-red-600'}>
                            {analysis.evaluation > 0 ? 'White' : 'Black'} has a clear advantage
                          </span>
                        ) : (
                          <span className={analysis.evaluation > 0 ? 'text-green-600' : 'text-red-600'}>
                            {analysis.evaluation > 0 ? 'White' : 'Black'} is winning
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="p-2 bg-blue-50 rounded">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-blue-800">Best Move</span>
                    <button
                      onClick={() => setShowBestMove(!showBestMove)}
                      className={`px-2 py-1 rounded text-xs ${
                        showBestMove 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {showBestMove ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="font-mono text-base font-bold text-blue-900">
                    {analysis.best_move}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">No analysis available</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChessCoach;