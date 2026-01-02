export class OptionChainController {
    private dhanService: any;

    constructor(dhanService: any) {
        this.dhanService = dhanService;
    }

    public async getOptionChain(req: any, res: any): Promise<void> {
        try {
            const payload = req.body;
            const optionChainData = await this.dhanService.getOptionChain(payload);
            res.status(200).json(optionChainData);
        } catch (error) {
            res.status(500).json({ error: (error as any).message });
        }
    }

    public async getOptionChainTable(req: any, res: any): Promise<void> {
        console.log('--- Option Chain Table Req ---');
        console.log('Body:', JSON.stringify(req.body));
        try {
            const payload = req.body;
            const tableData = await this.dhanService.getOptionChainTable(payload);
            console.log('Success returning table data');
            res.status(200).json(tableData);
        } catch (error: any) {
            console.error('Error in getOptionChainTable:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    public async getIntradayChart(req: any, res: any): Promise<void> {
        try {
            const payload = req.body;
            const chartData = await this.dhanService.getIntradayChart(payload);
            res.status(200).json(chartData);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    public async getHistoricalChart(req: any, res: any): Promise<void> {
        try {
            const payload = req.body;
            const chartData = await this.dhanService.getHistoricalChart(payload);
            res.status(200).json(chartData);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    public async getQuote(req: any, res: any): Promise<void> {
        console.log(`[Quote] Request for:`, JSON.stringify(req.body));
        try {
            const payload = req.body;
            const quoteData = await this.dhanService.getQuote(payload);
            console.log(`[Quote] Success. Segments returned:`, Object.keys(quoteData?.data || quoteData || {}));
            res.status(200).json(quoteData);
        } catch (error: any) {
            console.error(`[Quote] Error:`, error.message);
            res.status(500).json({ error: error.message });
        }
    }

    public async getLtp(req: any, res: any): Promise<void> {
        try {
            const payload = req.body;
            const ltpData = await this.dhanService.getLtp(payload);
            res.status(200).json(ltpData);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}