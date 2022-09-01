import fetch, { Response } from 'node-fetch';
import BigNumber from 'bignumber.js';
import { ExchangeApi } from '../types/ExchangeApi';
import { getApiTokenName } from './Utils';

const URL = 'https://ap.coinbase.com/v2/exchange-rates';

export type CoinBaseResponse = {
    data: {
        currency: string;
        rates: Record<string, string>;
    };
};

type CoinBaseError = {
    id: string;
    message: string;
};

export type CoinBaseErrorResponse = {
    errors: Array<CoinBaseError>;
};

const CURRENCY_MAPPING: Record<string, string> = {
    RIF: 'RIF',
    RBTC: 'RBTC'
};

export class CoinBase implements ExchangeApi {
    getApiTokenName(tokenSymbol: string): string {
        return getApiTokenName('CoinBase', tokenSymbol, CURRENCY_MAPPING);
    }

    async queryExchangeRate(
        sourceCurrency: string,
        targetCurrency: string
    ): Promise<BigNumber> {
        const upperCaseTargetCurrency = targetCurrency.toUpperCase();
        const response: Response = await fetch(
            `${URL}?currency=${sourceCurrency}`,
            {
                method: 'get'
            }
        );

        if (!response.ok) {
            const {
                errors: [error]
            }: CoinBaseErrorResponse = await response.json();
            throw Error(
                `CoinBase API status ${response.status}/${response.statusText}/${error.message}`
            );
        }

        const {
            data: { rates }
        }: CoinBaseResponse = await response.json();
        const conversionRate = rates[upperCaseTargetCurrency];

        if (!conversionRate) {
            throw Error(
                `Exchange rate for currency pair ${sourceCurrency}/${targetCurrency} is not available`
            );
        }

        return new BigNumber(conversionRate);
    }
}