/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// --- Crypto Price Service ---

/**
 * Fetches the last 20 hourly prices of Bitcoin.
 * @returns A promise that resolves to an array of price numbers.
 */
export const fetchBitcoinHistory = async (): Promise<number[]> => {
    const response = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1');
    if (!response.ok) {
        throw new Error('Failed to fetch Bitcoin market data from CoinGecko API.');
    }
    const data = await response.json();
    if (!data.prices || !Array.isArray(data.prices)) {
        throw new Error('Invalid data format received from CoinGecko API.');
    }
    return data.prices.map((p: [number, number]) => p[1]).slice(-20); // Get last 20 periods
};

/**
 * Fetches the current price of Bitcoin.
 * @returns A promise that resolves to the current price as a number.
 */
export const fetchBitcoinPrice = async (): Promise<number> => {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
     if (!response.ok) {
        throw new Error('Failed to fetch current Bitcoin price from CoinGecko API.');
    }
    const data = await response.json();
    if (!data.bitcoin || !data.bitcoin.usd) {
         throw new Error('Invalid price data format received from CoinGecko API.');
    }
    return data.bitcoin.usd;
};

/**
 * Calculates Bollinger Bands for a given dataset.
 * @param data An array of numbers (prices).
 * @param period The moving average period (default 20).
 * @param stdDev The number of standard deviations (default 2).
 * @returns An object containing the upper, middle, and lower band values, or null if there's not enough data.
 */
export const calculateBollingerBands = (data: number[], period: number = 20, stdDev: number = 2): { upper: number, middle: number, lower: number } | null => {
    if (data.length < period) {
        return null;
    }
    const slice = data.slice(-period);
    const sum = slice.reduce((acc, val) => acc + val, 0);
    const middle = sum / period;
    
    const variance = slice.reduce((acc, val) => acc + (val - middle) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    
    return {
        upper: middle + (sd * stdDev),
        middle: middle,
        lower: middle - (sd * stdDev),
    };
};