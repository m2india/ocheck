import React, { useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ReferenceLine
} from 'recharts';

interface Props {
    data: any;
}

const OIChart: React.FC<Props> = ({ data }) => {
    const chartData = useMemo(() => {
        const safeData = data || {};

        // Normalize data format similar to OptionChainTable
        let rawOptions: any[] = [];
        if (safeData?.data?.oc) {
            const oc = safeData.data.oc;
            rawOptions = Object.keys(oc).map(strike => ({
                strikePrice: parseFloat(strike),
                callOI: oc[strike].ce?.oi || 0,
                putOI: oc[strike].pe?.oi || 0,
            }));
        } else {
            const candidates = [
                safeData?.options,
                safeData?.rows,
                safeData?.Data?.options,
                safeData?.data?.options,
            ];
            for (const c of candidates) {
                if (Array.isArray(c)) {
                    rawOptions = c.map((opt: any) => ({
                        strikePrice: opt.strikePrice,
                        callOI: opt.call?.openInterest || opt.call?.oi || 0,
                        putOI: opt.put?.openInterest || opt.put?.oi || 0,
                    }));
                    break;
                }
            }
        }

        return rawOptions.sort((a, b) => a.strikePrice - b.strikePrice);
    }, [data]);

    const underlyingPrice = data?.underlyingPrice || data?.data?.last_price || data?.underlyingValue || 0;

    if (chartData.length === 0) {
        return null;
    }

    return (
        <div className="card" style={{ height: '400px', marginBottom: '20px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', fontWeight: 600 }}>Open Interest Distribution</h3>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={chartData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                    <XAxis
                        dataKey="strikePrice"
                        fontSize={10}
                        tick={{ fill: '#666' }}
                        axisLine={{ stroke: '#eee' }}
                    />
                    <YAxis
                        fontSize={10}
                        tick={{ fill: '#666' }}
                        axisLine={{ stroke: '#eee' }}
                        tickFormatter={(value: number) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                        cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    {underlyingPrice > 0 && (
                        <ReferenceLine x={underlyingPrice} stroke="#ff9800" strokeDasharray="3 3" label={{ position: 'top', value: 'Spot', fill: '#ff9800', fontSize: 10 }} />
                    )}
                    <Bar dataKey="callOI" name="Call OI" fill="#ff5252" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="putOI" name="Put OI" fill="#00c853" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default OIChart;
