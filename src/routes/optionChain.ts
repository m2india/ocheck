import { Router, Application } from 'express';
import { OptionChainController } from '../controllers/optionChainController';
import { DhanService } from '../services/dhanService';
import DhanClient from '../api/dhan/client';
import config from '../config';
import { logTrade } from '../utils/tradeLogger';

const router = Router();

const dhanClient = new DhanClient(config.baseUrl, config.apiKey, config.clientId);
export const dhanService = new DhanService(dhanClient, config.defaultOptionChainPayload);
const optionChainController = new OptionChainController(dhanService);

export const setOptionChainRoutes = (app: Application) => {
    // router.post('/option-chain', optionChainController.getOptionChain.bind(optionChainController));
    router.post('/option-chain', optionChainController.getOptionChainTable.bind(optionChainController));
    router.post('/intraday-chart', optionChainController.getIntradayChart.bind(optionChainController));
    router.post('/historical-chart', optionChainController.getHistoricalChart.bind(optionChainController));
    router.post('/quote', optionChainController.getQuote.bind(optionChainController));
    router.post('/ltp', optionChainController.getLtp.bind(optionChainController));
    router.post('/log-trade', (req, res) => {
        try {
            logTrade(req.body);
            res.status(200).json({ success: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });
    app.use('/', router);
};