import BigNumber from 'bignumber.js';

import { ExchangeApi } from './types/ExchangeApi';

const INTERMEDIATE_CURRENCY = 'USD';

export default class RelayPricer {
    private readonly sourceApi: ExchangeApi;

    constructor(sourceApi: ExchangeApi) {
        if (!sourceApi) {
            throw Error('RelayPricer should be initialized with SourceApi');
        }
        this.sourceApi = sourceApi;
    }

    async getExchangeRate(
        sourceCurrency: string,
        targetCurrency: string,
        intermediateCurrency?: string
    ): Promise<BigNumber> {
        const intermediary = intermediateCurrency
            ? intermediateCurrency
            : INTERMEDIATE_CURRENCY;

        const [sourceExchangeRate, targetExchangeRate] = await Promise.all([
            this.sourceApi.query(sourceCurrency, intermediary),
            this.sourceApi.query(targetCurrency, intermediary)
        ]);
        if (
            sourceExchangeRate.isEqualTo(0) ||
            targetExchangeRate.isEqualTo(0)
        ) {
            throw Error(
                `Currency conversion for pair ${sourceCurrency}:${targetCurrency} not found in current exchange api`
            );
        }
        return sourceExchangeRate.dividedBy(targetExchangeRate);
    }
}
