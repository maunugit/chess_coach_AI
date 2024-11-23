const API_URL = 'http://localhost:8000';

export const analyzePosition = async (fen, depth = 20) => {
    try {
        console.log('Sending HTTP analysis request:', fen);
        const response = await fetch(`${API_URL}/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ fen, depth }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Analysis failed: ${errorText}`);
        }

        const result = await response.json();
        console.log('Received analysis response:', result);
        return result;
    } catch (error) {
        console.error('Error analyzing position:', error);
        throw error;
    }
};

export class AnalysisWebSocket {
    constructor(onAnalysis) {
        this.ws = null;
        this.onAnalysis = onAnalysis;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.connected = false;
    }

    connect() {
        if (this.ws) {
            this.ws.close();
        }

        console.log('Attempting to connect to WebSocket...');
        this.ws = new WebSocket('ws://localhost:8000/ws');

        this.ws.onopen = () => {
            console.log('Successfully connected to analysis server');
            this.connected = true;
            this.reconnectAttempts = 0;
        };

        this.ws.onmessage = (event) => {
            try {
                const analysis = JSON.parse(event.data);
                console.log('Received analysis:', analysis);
                this.onAnalysis(analysis);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        this.ws.onclose = () => {
            console.log('WebSocket connection closed');
            this.connected = false;
            this.tryReconnect();
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.fallbackToHttp();
        };
    }

    async fallbackToHttp(fen) {
        if (!fen) return;
        
        try {
            const result = await analyzePosition(fen);
            this.onAnalysis(result);
        } catch (error) {
            console.error('HTTP fallback failed:', error);
        }
    }

    tryReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => this.connect(), 2000);
        }
    }

    analyze(fen) {
        if (!fen) return;
        
        console.log('Attempting to analyze position:', fen);
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ fen }));
        } else {
            this.fallbackToHttp(fen);
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.connected = false;
        }
    }
}