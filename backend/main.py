from fastapi import FastAPI, WebSocket, HTTPException, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import chess
import subprocess
import os
import sys
import logging
import signal

app = FastAPI()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for testing
    allow_credentials=False,  # Set to False when allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalysisRequest(BaseModel):
    fen: str
    depth: int = 20

class AnalysisResponse(BaseModel):
    evaluation: float
    best_move: str
    top_moves: List[dict]
    is_mate: bool = False
    mate_in: Optional[int] = None

class ChessAnalyzer:
    def __init__(self):
        self.stockfish_path = "C:/Users/maunu/Downloads/stockfish-windows-x86-64-avx2/stockfish/stockfish-windows-x86-64-avx2.exe"
        self.process = None
        self.initialize_engine()
        
    def initialize_engine(self):
        if not os.path.isfile(self.stockfish_path):
            print(f"Stockfish not found at: {self.stockfish_path}")
            return False
        
        try:
            print(f"Attempting to start Stockfish from: {self.stockfish_path}")
            self.process = subprocess.Popen(
                [self.stockfish_path],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            
            if self.process.poll() is not None:
                print("Process failed to start")
                return False

            self._send_command("uci")
            self._wait_for_ready()
            self._send_command("setoption name MultiPV value 3")
            self._send_command("setoption name Threads value 2")
            self._send_command("setoption name Hash value 128")
            self._send_command("isready")
            self._wait_for_ready()
            return True
            
        except Exception as e:
            print(f"Error in initialize_engine: {str(e)}")
            self.cleanup()
            return False
        
    def analyze_position_deeply(self, fen: str, depth: int = 20) -> dict:
        """Provides a deeper analysis of a position including best continuation"""
        if not self.process or self.process.poll() is not None:
            if not self.initialize_engine():
                return self._get_default_response()
        try:
            print(f"Analyzing position deeply: {fen}")
            self._send_command("ucinewgame")
            # First analyze normal depth
            self._send_command(f"position fen {fen}")
            # Tell Stockfish to report scores from White's perspective
            self._send_command("setoption name UCI_Chess960 value false")
            self._send_command("setoption name UCI_AnalyseMode value true")
            self._send_command(f"go depth {depth}")

            best_move = None
            score = 0
            is_mate = False
            mate_in = None
            best_line = []

            # Store previous position's evaluation for comparison
            prev_evaluation = self._get_previous_evaluation(fen)
            is_likely_trade = False
            
            while True:
                line = self.process.stdout.readline().strip()
                print(f"Engine output: {line}")

                if "score cp " in line:
                    score_parts = line.split("score cp ")[1].split()
                    score = int(score_parts[0]) / 100

                    # A check to see if this works
                    if len(score_parts) >  1 and "upperbound" not in score_parts and "lowerbound" not in score_parts:
                        if any("wtime" in part or "btime" in part for part in score_parts):
                            raw_score = -score

                    # Detect potential trades in position evaluation
                    if prev_evaluation is not None:
                        score_change = abs(raw_score - prev_evaluation)
                        if score_change > 2.5: # This is a significant change in eval
                            is_likely_trade = self._detect_trade(fen, best_line)
                            if is_likely_trade:
                                # Return the eval to normal because it's a trade
                                score = self._smooth_trade_evaluation(raw_score, prev_evaluation)
                            else:
                                score = raw_score
                        else:
                            score = raw_score
                    else:
                        score = raw_score

                elif "score mate " in line:
                    is_mate = True
                    mate_parts = line.split("score mate ")[1].split()
                    mate_in = int(mate_parts[0])
                    # If it's black to move, negate mate score
                    if len(mate_parts) > 1 and any("wtime" in part or "btime" in part for part in mate_parts):
                        mate_in = -mate_in
                
                if "pv " in line:
                    best_line = line.split("pv ")[1].split()
                    if not best_move:
                        best_move = best_line[0]

                if line.startswith("bestmove"):
                    if not best_move:
                        best_move = line.split()[1]
                    break

            # Store current eval for next comparison
            self._store_evaluation(fen, score)

            comment = self._generate_commentary(score, is_mate, mate_in, best_line, is_likely_trade)

            return {
                "evaluation": score,
                "best_move": best_move,
                "best_line": best_line[:5],  # First 5 moves of the best line
                "is_mate": is_mate,
                "mate_in": mate_in,
                "comment": comment,
                "is_trade": is_likely_trade
            }

        except Exception as e:
            print(f"Analysis error: {e}")
            raise HTTPException(status_code=500, detail=str(e))
        
    def _detect_trade(self, fen: str, best_line: List[str]) -> bool:
        """Detect if the position is likely in the middle of a trading sequence"""
        if not best_line:
            return False
        
        # Look at the first few moves in the best line
        # If they include captures that restore material balance, it's probably just a trade
        try:
            board = chess.Board(fen)
            first_move = chess.Move.from_uci(best_line[0])

            # Check if the best move is to capture
            if board.is_capture(first_move):
                # Look at next move (if there is one)
                if len(best_line) > 1:
                    board.push(first_move)
                    second_move = chess.Move.from_uci(best_line[1])
                    if board.is_capture(second_move):
                        return True
            return False
        except:
            return False
        
    def _smooth_trade_evaluation(self, current_eval: float, prev_eval: float) -> float:
        """Smooth out evaluation during trading sequences"""
        # If the  eval change is too dramatic and we detected a trade happening,
        # return a weighted average favoring the previous eval
        if abs(current_eval - prev_eval) > 2.5:
            return (prev_eval * 0.7) + (current_eval * 0.3)
        return current_eval

    def _generate_commentary(self, score, is_mate, mate_in, best_line, is_trade=False):
        """Generate human-readable commentary based on the position analysis"""
        if is_mate:
            if mate_in > 0:
                return f"{'White' if mate_in > 0 else 'Black'} has a forced mate in {abs(mate_in)} moves."
            else:
                return f"{'Black' if mate_in > 0 else 'White'} has a forced mate in {abs(mate_in)} moves."
        
        if is_trade:
            base_comment = "Position is in the middle of a trading sequence. "
        else:
            base_comment = ""
        
        if abs(score) < 0.5:
            return base_comment + "The position is approximately equal."
        elif abs(score) < 1.5:
            return base_comment + f"{'White' if score > 0 else 'Black'} has a slight advantage."
        elif abs(score) < 3:
            return base_comment + f"{'White' if score > 0 else 'Black'} has a clear advantage."
        else:
            return base_comment + f"{'White' if score > 0 else 'Black'} has a winning position."
            
    def analyze_position(self, fen: str, depth: int = 20) -> AnalysisResponse:
        if not self.process or self.process.poll() is not None:
            if not self.initialize_engine():
                return AnalysisResponse(
                    evaluation=0.0,
                    best_move="",
                    top_moves=[],
                    is_mate=False,
                    mate_in=None
                )

        try:
            print(f"Analyzing position: {fen}")
            self._send_command("ucinewgame")
            self._send_command(f"position fen {fen}")
            self._send_command(f"go depth {depth}")

            best_move = None
            score = 0
            is_mate = False
            mate_in = None
            top_moves = []

            while True:
                line = self.process.stdout.readline().strip()
                print(f"Engine output: {line}")

                if "score cp " in line:
                    score = int(line.split("score cp ")[1].split()[0]) / 100
                elif "score mate " in line:
                    is_mate = True
                    mate_in = int(line.split("score mate ")[1].split()[0])
                
                if "pv " in line:
                    moves = line.split("pv ")[1].split()
                    top_moves.append({
                        'move': moves[0],
                        'evaluation': score if not is_mate else None,
                        'mate_in': mate_in if is_mate else None,
                    })

                if line.startswith("bestmove"):
                    best_move = line.split()[1]
                    break

            return AnalysisResponse(
                evaluation=score,
                best_move=best_move,
                top_moves=top_moves[:3],
                is_mate=is_mate,
                mate_in=mate_in
            )

        except Exception as e:
            print(f"Analysis error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    def cleanup(self):
        if self.process:
            try:
                self._send_command("quit")
                self.process.terminate()
                self.process.wait(timeout=2)
            except:
                if self.process:
                    self.process.kill()
            finally:
                self.process = None

    def _send_command(self, cmd):
        print(f"Sending command: {cmd}")
        if self.process and self.process.poll() is None:
            self.process.stdin.write(f"{cmd}\n")
            self.process.stdin.flush()

    def _wait_for_ready(self):
        while True:
            line = self.process.stdout.readline().strip()
            print(f"Read line: {line}")
            if line == "readyok" or line == "uciok":
                break

    def __del__(self):
        try:
            self._send_command("quit")
            self.process.terminate()
            self.process.wait(timeout=2)
        except:
            if self.process:
                self.process.kill()

def signal_handler(signum, frame):
    print("\nReceived shutdown signal. Cleaning up...")
    if hasattr(analyzer, 'cleanup'):
        analyzer.cleanup()
    print("Shutdown complete")
    sys.exit(0)

# Register signal handlers
signal.signal(signal.SIGINT, signal_handler)  # For Ctrl+C
signal.signal(signal.SIGTERM, signal_handler)  # For termination requests


# Create analyzer instance
analyzer = ChessAnalyzer()

# Register cleanup on application shutdown
@app.on_event("shutdown")
async def shutdown_event():
    if analyzer:
        analyzer.cleanup()

if __name__ == "__main__":
    import uvicorn
    try:
        uvicorn.run(app, host="127.0.0.1", port=8000)
    except KeyboardInterrupt:
        print("Shutting down...")
        if analyzer:
            analyzer.cleanup()

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "stockfish_running": analyzer.process is not None and analyzer.process.poll() is None
    }

@app.post("/analyze")
async def analyze_position(request: AnalysisRequest):
    try:
        result = analyzer.analyze_position(request.fen, request.depth)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    print("WebSocket connection attempt...")
    await websocket.accept()
    print("WebSocket connection accepted")
    
    try:
        while True:
            data = await websocket.receive_json()
            print(f"Received position for analysis: {data['fen']}")
            analysis = analyzer.analyze_position(data['fen'], data.get('depth', 20))
            await websocket.send_json(analysis.dict())
            
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        if websocket.client_state.CONNECTED:
            await websocket.close()