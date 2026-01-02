import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config';

export interface MarketData {
    securityId: number;
    type: 'ticker' | 'quote' | 'oi';
    ltp?: number;
    ltt?: number;
    volume?: number;
    oi?: number;
}

export const useDhanSocket = () => {
    const socketRef = useRef<Socket | null>(null);
    const [latestData, setLatestData] = useState<Record<number, MarketData>>({});
    const [isConnected, setIsConnected] = useState(false);
    const [latestChain, setLatestChain] = useState<any>(null);

    const connect = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.disconnect();
        }

        const socket = io(SOCKET_URL, {
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('Connected to backend via Socket.io');
            setIsConnected(true);
        });

        socket.on('disconnect', (reason) => {
            console.log('Disconnected from backend Socket.io:', reason);
            setIsConnected(false);
            if (reason === 'io server disconnect' || reason === 'transport close') {
                // the disconnection was initiated by the server, or transport was closed (e.g. computer sleep)
                // Socket.io handles auto-reconnect for 'transport close', but we log it here
            }
        });

        socket.on('reconnect', (attemptNumber) => {
            console.log('Reconnected to backend after', attemptNumber, 'attempts');
            setIsConnected(true);
        });

        socket.on('market-data', (data: MarketData) => {
            setLatestData(prev => ({
                ...prev,
                [data.securityId]: {
                    ...prev[data.securityId],
                    ...data
                }
            }));
        });

        socket.on('chain-update', (data: any) => {
            setLatestChain(data);
        });
    }, []);

    useEffect(() => {
        connect();
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [connect]);

    const subscribe = useCallback((data: { instruments: { ExchangeSegment: string; SecurityId: string }[], pollParams?: any }) => {
        if (socketRef.current && isConnected) {
            socketRef.current.emit('subscribe', data);
        }
    }, [isConnected]);

    const reconnect = useCallback(() => {
        console.log('Manually triggering socket.io reconnect...');
        connect();
    }, [connect]);

    return { latestData, setLatestData, latestChain, setLatestChain, subscribe, isConnected, reconnect };
};
