import React, { useEffect, useState } from 'react';

interface SelectionLogEntry {
    time: string;
    scrip: string;
    strike: number;
    side: string;
    price: number;
    expiry: string;
    status: string;
    strategy: string;
    confidence: number;
    interpretation: string;
    entry: number;
    targets: { '1m': number; '5m': number; '10m': number };
    stopLoss: number;
    maxLoss: number;
    maxProfit: number;
    profit: number;
    ltp: number;
}

interface Props {
    baseUrl: string;
    refreshTrigger: any;
}

const SelectionLogs: React.FC<Props> = ({ baseUrl, refreshTrigger }) => {
    const [entries, setEntries] = useState<SelectionLogEntry[]>([]);
    const [showLogs, setShowLogs] = useState(false);

    const fetchLogs = async () => {
        try {
            const response = await fetch(`${baseUrl}/get-selections`);
            const result = await response.json();
            if (result.success) {
                setEntries(result.data || []);
            }
        } catch (error) {
            console.error("Failed to fetch logs:", error);
        }
    };

    useEffect(() => {
        if (showLogs) {
            fetchLogs();
        }
    }, [showLogs, refreshTrigger]);

    return (
        <div className="card selection-logs-card" style={{ marginTop: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                    <i className="fa fa-history" style={{ marginRight: '8px', color: '#ffa726' }}></i>
                    Daily Selection Log (.txt)
                </h3>
                <button
                    onClick={() => setShowLogs(!showLogs)}
                    style={{
                        fontSize: '11px',
                        padding: '4px 10px',
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        color: '#fff',
                        cursor: 'pointer'
                    }}
                >
                    {showLogs ? 'Hide' : 'View Today\'s Logs'}
                </button>
            </div>

            {showLogs && (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {entries.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#aaa' }}>No logs found for today.</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.05)', color: '#aaa' }}>
                                    <th style={{ padding: '8px' }}>Time</th>
                                    <th style={{ padding: '8px' }}>Strike</th>
                                    <th style={{ padding: '8px' }}>Strategy</th>
                                    <th style={{ padding: '8px' }}>Status</th>
                                    <th style={{ padding: '8px' }}>Interpretation</th>
                                    <th style={{ padding: '8px' }}>Reasoning</th>
                                    <th style={{ padding: '8px' }}>Entry</th>
                                    <th style={{ padding: '8px' }}>LTP</th>
                                    <th style={{ padding: '8px' }}>Profit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map((entry, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '8px' }}>{entry.time}</td>
                                        <td style={{ padding: '8px', fontWeight: 'bold' }}>{entry.strike} {entry.side}</td>
                                        <td style={{ padding: '8px' }}>{entry.strategy}</td>
                                        <td style={{
                                            padding: '8px',
                                            fontWeight: 'bold',
                                            color: entry.status.includes('Hit') ? '#4ade80' : entry.status.includes('Stop') ? '#f87171' : '#fff'
                                        }}>{entry.status}</td>
                                        <td style={{ padding: '8px' }}>{entry.interpretation} ({entry.confidence}%)</td>
                                        <td style={{ padding: '8px', color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>{entry.strategy}</td>
                                        <td style={{ padding: '8px' }}>₹{entry.entry?.toFixed(2)}</td>
                                        <td style={{ padding: '8px' }}>₹{entry.ltp?.toFixed(2)}</td>
                                        <td style={{
                                            padding: '8px',
                                            fontWeight: 'bold',
                                            color: entry.profit >= 0 ? '#4ade80' : '#f87171'
                                        }}>₹{entry.profit?.toFixed(0)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
};

export default SelectionLogs;
