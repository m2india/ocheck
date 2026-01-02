export interface Scrip {
    id: number;          // Used for Quotes and Charts (Spot)
    occId?: number;     // Used for Option Chain
    name: string;
    symbol: string;
    segment: string;
}

export const SCRIPS: Scrip[] = [
    {
        id: 13,
        occId: 13,
        name: "NIFTY",
        symbol: "NIFTY",
        segment: "IDX_I"
    },
    {
        id: 51,
        occId: 51,
        name: "SENSEX",
        symbol: "SENSEX",
        segment: "IDX_I",
    },
    {
        id: 465849,
        name: 'NATURALGAS',
        symbol: 'NATURALGAS',
        segment: 'MCX_COMM'
    }
];
